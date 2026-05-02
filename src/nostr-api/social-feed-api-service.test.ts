import { describe, expect, test, vi } from 'vitest';

import type { HttpClient } from './http-client';
import { createSocialFeedApiService } from './social-feed-api-service';

describe('createSocialFeedApiService', () => {
    test('includes auth only for viewer-specific social state requests', async () => {
        const postJson = vi.fn(async (path: string) => {
            if (path === '/social/viewer-reactions' || path === '/social/viewer-zaps' || path === '/social/viewer-replies') {
                return { byEventId: {} };
            }

            return { byEventId: {}, items: [], hasMore: false, nextUntil: null };
        });
        const client: HttpClient = {
            requestRaw: vi.fn(async () => new Response(null, { status: 200 })),
            requestJson: vi.fn(async () => ({})) as unknown as HttpClient['requestJson'],
            getJson: vi.fn(async () => ({ items: [], hasMore: false, nextUntil: null })) as unknown as HttpClient['getJson'],
            postJson: postJson as unknown as HttpClient['postJson'],
        };

        const service = createSocialFeedApiService({ client });

        await service.loadEngagement({ eventIds: ['a'.repeat(64)] });
        await service.loadViewerReactions({ ownerPubkey: 'b'.repeat(64), eventIds: ['a'.repeat(64)] });
        await service.loadViewerZaps({ ownerPubkey: 'b'.repeat(64), eventIds: ['a'.repeat(64)] });
        await service.loadViewerReplies({ ownerPubkey: 'b'.repeat(64), eventIds: ['a'.repeat(64)] });

        expect(postJson).toHaveBeenNthCalledWith(1, '/social/engagement', expect.not.objectContaining({ includeAuth: true }));
        expect(postJson).toHaveBeenNthCalledWith(2, '/social/viewer-reactions', expect.objectContaining({ includeAuth: true }));
        expect(postJson).toHaveBeenNthCalledWith(3, '/social/viewer-zaps', expect.objectContaining({ includeAuth: true }));
        expect(postJson).toHaveBeenNthCalledWith(4, '/social/viewer-replies', expect.objectContaining({ includeAuth: true }));
    });
});
