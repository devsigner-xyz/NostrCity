import type { SentIndexItem } from '../../nostr/dm-service';

type StorageVersion = 'v1' | 'v2';

export const DM_SENT_INDEX_MAX_ITEMS = 2_000;
export const DM_SENT_INDEX_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface DmReadStateStorage {
    getLastReadAt(ownerPubkey: string, conversationId: string): number;
    setLastReadAt(ownerPubkey: string, conversationId: string, timestampSec: number): void;
    getSentIndex(ownerPubkey: string): SentIndexItem[];
    setSentIndex(ownerPubkey: string, items: SentIndexItem[]): void;
}

interface CreateDmReadStateStorageOptions {
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    now: () => number;
    version: StorageVersion;
}

export const fallbackStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem() {
        return null;
    },
    setItem() {
        return;
    },
    removeItem() {
        return;
    },
};

function safeJsonParse<T>(value: string | null): T | null {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function toEpochSeconds(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    if (value > 1_000_000_000_000) {
        return Math.floor(value / 1000);
    }

    return Math.floor(value);
}

function sentIndexIdentity(item: SentIndexItem, fallbackIndex: number): string {
    if (item.clientMessageId) {
        return `client:${item.clientMessageId}`;
    }

    if (item.rumorEventId) {
        return `rumor:${item.rumorEventId}`;
    }

    if (item.giftWrapEventId) {
        return `gift:${item.giftWrapEventId}`;
    }

    return `fallback:${item.conversationId}:${toEpochSeconds(item.createdAtSec)}:${fallbackIndex}`;
}

function stripPlaintext(item: SentIndexItem): SentIndexItem {
    const { plaintext: _plaintext, ...safeItem } = item;
    return safeItem;
}

function normalizeSentIndex(items: SentIndexItem[], nowSec: number): SentIndexItem[] {
    const minCreatedAt = nowSec - DM_SENT_INDEX_MAX_AGE_SECONDS;

    const filteredSorted = items
        .map(stripPlaintext)
        .filter((item) => toEpochSeconds(item.createdAtSec) >= minCreatedAt)
        .sort((left, right) => toEpochSeconds(right.createdAtSec) - toEpochSeconds(left.createdAtSec));

    const seen = new Set<string>();
    const deduped: SentIndexItem[] = [];
    for (const [index, item] of filteredSorted.entries()) {
        const identity = sentIndexIdentity(item, index);
        if (seen.has(identity)) {
            continue;
        }

        seen.add(identity);
        deduped.push(item);
    }

    return deduped.slice(0, DM_SENT_INDEX_MAX_ITEMS);
}

export function buildSeenStorageKey(ownerPubkey: string, conversationId: string, version: StorageVersion = 'v1'): string {
    return `nostr-overlay:dm:${version}:seen:${ownerPubkey}:${conversationId}`;
}

export function buildSentIndexStorageKey(ownerPubkey: string, version: StorageVersion = 'v1'): string {
    return `nostr-overlay:dm:${version}:sent-index:${ownerPubkey}`;
}

export function createDmReadStateStorage(options: CreateDmReadStateStorageOptions): DmReadStateStorage {
    const migrateSeenIfNeeded = (ownerPubkey: string, conversationId: string): number | null => {
        if (options.version !== 'v2') {
            return null;
        }

        const v2Key = buildSeenStorageKey(ownerPubkey, conversationId, 'v2');
        const v2Data = safeJsonParse<{ lastReadAt?: number }>(options.storage.getItem(v2Key));
        if (v2Data && typeof v2Data.lastReadAt === 'number') {
            return toEpochSeconds(v2Data.lastReadAt);
        }

        const v1Key = buildSeenStorageKey(ownerPubkey, conversationId, 'v1');
        const v1Data = safeJsonParse<{ lastReadAt?: number }>(options.storage.getItem(v1Key));
        if (!v1Data || typeof v1Data.lastReadAt !== 'number') {
            return null;
        }

        const lastReadAt = toEpochSeconds(v1Data.lastReadAt);
        options.storage.setItem(v2Key, JSON.stringify({ lastReadAt }));
        options.storage.removeItem(v1Key);
        return lastReadAt;
    };

    return {
        getLastReadAt(ownerPubkey, conversationId) {
            const migrated = migrateSeenIfNeeded(ownerPubkey, conversationId);
            if (typeof migrated === 'number') {
                return migrated;
            }

            const key = buildSeenStorageKey(ownerPubkey, conversationId, options.version);
            const parsed = safeJsonParse<{ lastReadAt?: number }>(options.storage.getItem(key));
            if (!parsed || typeof parsed.lastReadAt !== 'number') {
                return 0;
            }

            return toEpochSeconds(parsed.lastReadAt);
        },

        setLastReadAt(ownerPubkey, conversationId, timestampSec) {
            const key = buildSeenStorageKey(ownerPubkey, conversationId, options.version);
            options.storage.setItem(key, JSON.stringify({ lastReadAt: toEpochSeconds(timestampSec) }));
        },

        getSentIndex(ownerPubkey) {
            const key = buildSentIndexStorageKey(ownerPubkey, options.version);
            const parsed = safeJsonParse<SentIndexItem[]>(options.storage.getItem(key));
            const normalized = normalizeSentIndex(Array.isArray(parsed) ? parsed : [], toEpochSeconds(options.now()));
            options.storage.setItem(key, JSON.stringify(normalized));
            return normalized;
        },

        setSentIndex(ownerPubkey, items) {
            const key = buildSentIndexStorageKey(ownerPubkey, options.version);
            const normalized = normalizeSentIndex(items, toEpochSeconds(options.now()));
            options.storage.setItem(key, JSON.stringify(normalized));
        },
    };
}

export function normalizeToEpochSeconds(value: number): number {
    return toEpochSeconds(value);
}
