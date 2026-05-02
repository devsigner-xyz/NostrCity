/** @vitest-environment jsdom */

import { describe, expect, test } from 'vitest';

import { buildSentIndexStorageKey, createDmReadStateStorage } from './dm-storage';

const OWNER = 'a'.repeat(64);

function createMemoryStorage() {
    const memory = new Map<string, string>();
    return {
        memory,
        storage: {
            getItem(key: string) {
                return memory.get(key) ?? null;
            },
            setItem(key: string, value: string) {
                memory.set(key, value);
            },
            removeItem(key: string) {
                memory.delete(key);
            },
        },
    };
}

describe('createDmReadStateStorage', () => {
    test('rewrites persisted sent index without plaintext on read', () => {
        const { memory, storage } = createMemoryStorage();
        const key = buildSentIndexStorageKey(OWNER, 'v1');
        memory.set(key, JSON.stringify([
            {
                clientMessageId: 'client-1',
                conversationId: 'b'.repeat(64),
                createdAtSec: 100,
                deliveryState: 'failed',
                targetRelays: [],
                plaintext: 'secret message',
            },
        ]));

        const dmStorage = createDmReadStateStorage({
            storage,
            now: () => 200,
            version: 'v1',
        });

        const sentIndex = dmStorage.getSentIndex(OWNER);

        expect(sentIndex).toEqual([
            {
                clientMessageId: 'client-1',
                conversationId: 'b'.repeat(64),
                createdAtSec: 100,
                deliveryState: 'failed',
                targetRelays: [],
            },
        ]);
        expect(memory.get(key)).not.toContain('secret message');
        expect(memory.get(key)).not.toContain('plaintext');
    });

    test('drops plaintext before persisting sent index entries', () => {
        const { memory, storage } = createMemoryStorage();
        const key = buildSentIndexStorageKey(OWNER, 'v1');
        const dmStorage = createDmReadStateStorage({
            storage,
            now: () => 200,
            version: 'v1',
        });

        dmStorage.setSentIndex(OWNER, [
            {
                clientMessageId: 'client-2',
                conversationId: 'c'.repeat(64),
                createdAtSec: 120,
                deliveryState: 'failed',
                targetRelays: [],
                plaintext: 'persist me not',
            },
        ]);

        expect(memory.get(key)).not.toContain('persist me not');
        expect(memory.get(key)).not.toContain('plaintext');
    });
});
