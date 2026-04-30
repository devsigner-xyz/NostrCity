import { describe, expect, test, vi } from 'vitest';
import type { HttpClient } from './http-client';
import { createSocialNotificationsApiService } from './social-notifications-api-service';

interface NotificationsResponseDto {
    items: Array<{
        id: string;
        kind: number;
        actorPubkey: string;
        createdAt: number;
        targetEventId: string | null;
        targetPubkey: string | null;
        rawEvent: {
            id: string;
            pubkey: string;
            kind: number;
            createdAt: number;
            content: string;
            tags: string[][];
        };
    }>;
    hasMore: boolean;
    nextSince: number | null;
}

describe('createSocialNotificationsApiService', () => {
    test('clamps outgoing list limit to backend max', async () => {
        const ownerPubkey = 'a'.repeat(64);
        const response: NotificationsResponseDto = {
            items: [],
            hasMore: false,
            nextSince: null,
        };
        const getJson = vi.fn(async () => response);
        const client: HttpClient = {
            requestRaw: vi.fn(async () => new Response(null, { status: 200 })),
            requestJson: vi.fn(async () => response) as unknown as HttpClient['requestJson'],
            getJson: getJson as unknown as HttpClient['getJson'],
            postJson: vi.fn(async () => response) as unknown as HttpClient['postJson'],
        };

        const service = createSocialNotificationsApiService({ client });

        await service.loadInitialSocial({
            ownerPubkey,
            limit: 1000,
        });

        expect(getJson).toHaveBeenCalledWith('/notifications', expect.objectContaining({
            query: expect.objectContaining({
                limit: 100,
            }),
        }));
    });

    test('returns notification list pagination metadata', async () => {
        const ownerPubkey = 'a'.repeat(64);
        const eventId = 'b'.repeat(64);
        const response: NotificationsResponseDto = {
            items: [
                {
                    id: eventId,
                    kind: 7,
                    actorPubkey: 'c'.repeat(64),
                    createdAt: 200,
                    targetEventId: 'd'.repeat(64),
                    targetPubkey: ownerPubkey,
                    rawEvent: {
                        id: eventId,
                        pubkey: 'c'.repeat(64),
                        kind: 7,
                        createdAt: 200,
                        content: '+',
                        tags: [['p', ownerPubkey], ['e', 'd'.repeat(64)]],
                    },
                },
            ],
            hasMore: true,
            nextSince: 123,
        };
        const client: HttpClient = {
            requestRaw: vi.fn(async () => new Response(null, { status: 200 })),
            requestJson: vi.fn(async () => response) as unknown as HttpClient['requestJson'],
            getJson: vi.fn(async () => response) as unknown as HttpClient['getJson'],
            postJson: vi.fn(async () => response) as unknown as HttpClient['postJson'],
        };

        const service = createSocialNotificationsApiService({ client });

        const page = await service.loadInitialSocial({
            ownerPubkey,
            limit: 20,
            since: 456,
        });

        expect(page).toMatchObject({
            hasMore: true,
            nextSince: 123,
        });
        expect(page.items.map((event) => event.id)).toEqual([eventId]);
    });
});
