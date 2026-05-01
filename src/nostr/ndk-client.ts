import NDK from '@nostr-dev-kit/ndk';
import { createNdkDmTransport } from './dm-transport-ndk';
import { resolveRelaySetWithBootstrapFallback } from './relay-policy';
import type { DmTransport } from './dm-transport';
import type { NostrClient, NostrEvent, NostrFilter } from './types';

function toNostrEvent(rawEvent: {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
    sig?: string;
}): NostrEvent {
    return {
        id: rawEvent.id,
        pubkey: rawEvent.pubkey,
        kind: rawEvent.kind,
        created_at: rawEvent.created_at,
        tags: rawEvent.tags,
        content: rawEvent.content,
        ...(typeof rawEvent.sig === 'string' ? { sig: rawEvent.sig } : {}),
    };
}

export class NdkClient implements NostrClient {
    private static readonly CONNECT_TIMEOUT_MS = 4_000;
    private static readonly FETCH_EVENTS_TIMEOUT_MS = 5_000;
    private connectPromise: Promise<void> | null = null;

    private readonly ndk: {
        connect: (timeout?: number) => Promise<void>;
        fetchEvents: (filter: Record<string, unknown>) => Promise<Set<unknown>>;
    };

    constructor(relays: string[] = []) {
        const relayUrls = resolveRelaySetWithBootstrapFallback(relays);
        this.ndk = new NDK({ explicitRelayUrls: relayUrls }) as unknown as {
            connect: (timeout?: number) => Promise<void>;
            fetchEvents: (filter: Record<string, unknown>) => Promise<Set<unknown>>;
        };
    }

    async connect(): Promise<void> {
        if (!this.connectPromise) {
            this.connectPromise = this.ndk.connect(NdkClient.CONNECT_TIMEOUT_MS).catch((error) => {
                this.connectPromise = null;
                throw error;
            });
        }

        await this.connectPromise;
    }

    async fetchEvents(filter: NostrFilter): Promise<NostrEvent[]> {
        const eventSet = await withTimeout(
            this.ndk.fetchEvents(filter as unknown as Record<string, unknown>),
            NdkClient.FETCH_EVENTS_TIMEOUT_MS,
            `NDK fetchEvents timed out after ${NdkClient.FETCH_EVENTS_TIMEOUT_MS}ms`
        );
        const events = [...eventSet]
            .map((event) => event as {
                id: string;
                pubkey: string;
                kind: number;
                created_at: number;
                tags: string[][];
                content: string;
                sig?: string;
            })
            .map(toNostrEvent);

        events.sort((a, b) => b.created_at - a.created_at);
        return events;
    }

    async fetchLatestReplaceableEvent(pubkey: string, kind: number): Promise<NostrEvent | null> {
        const events = await this.fetchEvents({
            authors: [pubkey],
            kinds: [kind],
            limit: 20,
        });

        if (events.length === 0) {
            return null;
        }

        return events[0] ?? null;
    }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeout);
    });
}

export function createNdkDmTransportClient(relays: string[] = []): DmTransport {
    return createNdkDmTransport({ relays });
}
