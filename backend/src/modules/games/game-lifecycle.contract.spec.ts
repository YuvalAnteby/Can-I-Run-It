import type { ConfirmChannel } from 'amqplib';

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

    it('asserts one shared durable main/retry/dead topology in a stable order', async () => {
        const assertQueue = jest.fn().mockResolvedValue({});
        const channel = {
            assertQueue,
        } as unknown as ConfirmChannel;

        await assertGameEnrichmentTopology(channel);

        expect(assertQueue).toHaveBeenCalledTimes(3);
        expect(assertQueue).toHaveBeenNthCalledWith(
            1,
            GAME_ENRICHMENT_DEAD_QUEUE,
            {
                durable: true,
                exclusive: false,
                autoDelete: false,
                arguments: {},
            },
        );
        expect(assertQueue).toHaveBeenNthCalledWith(2, GAME_ENRICHMENT_QUEUE, {
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: {
                'x-dead-letter-exchange': '',
                'x-dead-letter-routing-key': GAME_ENRICHMENT_DEAD_QUEUE,
            },
        });
        expect(assertQueue).toHaveBeenNthCalledWith(
            3,
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
        );
    });
});
