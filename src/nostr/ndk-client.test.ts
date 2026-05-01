import { describe, expect, test, vi } from 'vitest';
import { NdkClient } from './ndk-client';

const connectMock = vi.fn(async () => undefined);
const fetchEventsMock = vi.fn(async () => new Set());

vi.mock('@nostr-dev-kit/ndk', () => {
    return {
        default: vi.fn(function MockNdk(this: unknown, _options: unknown) {
            return {
                connect: connectMock,
                fetchEvents: fetchEventsMock,
            };
        }),
    };
});

describe('NdkClient relay initialization', () => {
    test('does not merge bootstrap relays when explicit relays are provided', async () => {
        const client = new NdkClient(['wss://relay.custom']);
        await client.connect();

        const ctor = (await import('@nostr-dev-kit/ndk')).default as unknown as ReturnType<typeof vi.fn>;
        expect(ctor).toHaveBeenCalledWith({ explicitRelayUrls: ['wss://relay.custom'] });
    });

    test('rejects fetchEvents when relays never finish the request', async () => {
        vi.useFakeTimers();
        fetchEventsMock.mockReturnValueOnce(new Promise(() => undefined));
        const client = new NdkClient(['wss://relay.custom']);

        const fetchPromise = client.fetchEvents({ kinds: [39000] });
        let rejectionMessage: string | null = null;
        void fetchPromise.catch((error) => {
            rejectionMessage = error instanceof Error ? error.message : String(error);
        });
        await vi.advanceTimersByTimeAsync(6_000);

        expect(rejectionMessage).toBe('NDK fetchEvents timed out after 5000ms');
        vi.useRealTimers();
    });
});
