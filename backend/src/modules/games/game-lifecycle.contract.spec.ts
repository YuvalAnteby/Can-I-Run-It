import { canTransitionGame } from './game-lifecycle.contract';

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
});
