import {
    assertGameEnrichmentTopology,
    canTransitionGame,
    GAME_ENRICHMENT_DEAD_QUEUE,
    GAME_ENRICHMENT_QUEUE,
    GAME_ENRICHMENT_RETRY_QUEUE,
    GAME_ENRICHMENT_RETRY_TTL_MS,
} from './game-lifecycle.contract';

describe('game lifecycle contract', () => {
    it('allows only pending games to become published or rejected', () => {
        expect(canTransitionGame('pending_approval', 'published')).toBe(true);
        expect(canTransitionGame('pending_approval', 'rejected')).toBe(true);
        expect(canTransitionGame('rejected', 'pending_approval')).toBe(false);
        expect(canTransitionGame('published', 'pending_approval')).toBe(false);
        expect(canTransitionGame('published', 'published')).toBe(false);
        expect(canTransitionGame('pending_approval', 'pending_approval')).toBe(
            false,
        );
        expect(canTransitionGame('published', 'rejected')).toBe(false);
        expect(canTransitionGame('rejected', 'published')).toBe(false);
        expect(canTransitionGame('rejected', 'rejected')).toBe(false);
    });

    it('declares the shared dead, main, and retry topology in the frozen order', async () => {
        const channel = {
            assertQueue: jest.fn().mockResolvedValue({}),
        };

        await assertGameEnrichmentTopology(channel as never);

        expect(channel.assertQueue.mock.calls).toEqual([
            [
                GAME_ENRICHMENT_DEAD_QUEUE,
                {
                    durable: true,
                    exclusive: false,
                    autoDelete: false,
                    arguments: {},
                },
            ],
            [
                GAME_ENRICHMENT_QUEUE,
                {
                    durable: true,
                    exclusive: false,
                    autoDelete: false,
                    arguments: {
                        'x-dead-letter-exchange': '',
                        'x-dead-letter-routing-key': GAME_ENRICHMENT_DEAD_QUEUE,
                    },
                },
            ],
            [
                GAME_ENRICHMENT_RETRY_QUEUE,
                {
                    durable: true,
                    exclusive: false,
                    autoDelete: false,
                    arguments: {
                        'x-message-ttl': GAME_ENRICHMENT_RETRY_TTL_MS,
                        'x-dead-letter-exchange': '',
                        'x-dead-letter-routing-key': GAME_ENRICHMENT_QUEUE,
                    },
                },
            ],
        ]);
    });
});
