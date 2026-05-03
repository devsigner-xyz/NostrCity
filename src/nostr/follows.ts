import { createTtlCache } from './cache';
import { decodeNpubToHex } from './npub';
import { relayHintsFromKind3Content } from './relay-policy';
import type { FollowGraphResult, NostrClient, NostrEvent } from './types';

const followsCache = createTtlCache<FollowGraphResult>({
    ttlMs: 60_000,
    maxEntries: 200,
});

const FETCH_KIND3_TIMEOUT_MS = 10_000;

export function __resetFollowsCacheForTests(): void {
    followsCache.clear();
}

function isHexPubkey(value: string): boolean {
    return /^[a-f0-9]{64}$/.test(value);
}

export function parseFollowsFromKind3(event: NostrEvent): string[] {
    if (event.kind !== 3) {
        return [];
    }

    const follows = new Set<string>();
    for (const tag of event.tags) {
        if (tag[0] !== 'p') {
            continue;
        }

        const pubkey = tag[1];
        if (typeof pubkey !== 'string') {
            continue;
        }

        if (isHexPubkey(pubkey)) {
            follows.add(pubkey);
        }
    }

    return [...follows];
}

export function buildContactListTags(follows: string[], preservedTags: string[][] = []): string[][] {
    const retainedFollows = [...new Set(follows.filter(isHexPubkey))];
    const preservedTagByPubkey = new Map<string, string[]>();

    for (const tag of preservedTags) {
        if (tag[0] !== 'p') {
            continue;
        }

        const pubkey = tag[1];
        if (typeof pubkey !== 'string' || !isHexPubkey(pubkey) || preservedTagByPubkey.has(pubkey)) {
            continue;
        }

        preservedTagByPubkey.set(pubkey, [...tag]);
    }

    return retainedFollows.map((pubkey) => preservedTagByPubkey.get(pubkey) ?? ['p', pubkey]);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(message));
        }, timeoutMs);

        void promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

function relayHintsFromKind3Event(event: NostrEvent): string[] {
    const fromTags = event.tags
        .filter((tag) => tag[0] === 'p')
        .map((tag) => tag[2])
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

    return [...new Set([...fromTags, ...relayHintsFromKind3Content(event.content)])];
}

export async function fetchFollowsByNpub(npub: string, client: NostrClient): Promise<FollowGraphResult> {
    const ownerPubkey = decodeNpubToHex(npub);

    return fetchFollowsByPubkey(ownerPubkey, client);
}

export async function fetchFollowsByPubkey(ownerPubkey: string, client: NostrClient): Promise<FollowGraphResult> {
    const cacheKey = `follows:${ownerPubkey}`;

    return followsCache.getOrLoad(cacheKey, async () => {
        await client.connect();

        const kind3 = await withTimeout(
            client.fetchLatestReplaceableEvent(ownerPubkey, 3),
            FETCH_KIND3_TIMEOUT_MS,
            'Relay timeout while fetching follows graph'
        );
        if (!kind3) {
            return {
                ownerPubkey,
                follows: [],
                relayHints: [],
            };
        }

        return {
            ownerPubkey,
            follows: parseFollowsFromKind3(kind3),
            relayHints: relayHintsFromKind3Event(kind3),
        };
    });
}
