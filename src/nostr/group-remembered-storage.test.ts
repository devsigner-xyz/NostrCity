import { describe, expect, test } from 'vitest';
import {
    addRememberedGroup,
    loadRememberedGroups,
    saveRememberedGroups,
} from './group-remembered-storage';

function storage() {
    const values = new Map<string, string>();
    return {
        values,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
    };
}

describe('remembered groups storage', () => {
    test('stores remembered groups scoped by owner pubkey without invite codes', () => {
        const store = storage();
        saveRememberedGroups({
            ownerPubkey: 'a'.repeat(64),
            storage: store,
            groups: [{ relay: 'wss://groups.example/', id: 'Maps' }],
        });

        expect(loadRememberedGroups({ ownerPubkey: 'a'.repeat(64), storage: store }).map((group) => group.key)).toEqual([
            "wss://groups.example'Maps",
        ]);
        expect(loadRememberedGroups({ ownerPubkey: 'b'.repeat(64), storage: store })).toEqual([]);
        expect(Array.from(store.values.values()).join('\n')).not.toContain('invite');
    });

    test('dedupes and discards invalid entries individually', () => {
        const store = storage();
        addRememberedGroup({ ownerPubkey: 'a'.repeat(64), storage: store, group: { relay: 'wss://groups.example', id: 'Maps' } });
        addRememberedGroup({ ownerPubkey: 'a'.repeat(64), storage: store, group: "groups.example'Maps" });

        store.setItem('nostr.overlay.groups.remembered.v1:user:' + 'a'.repeat(64), JSON.stringify({
            groups: [
                { relay: 'wss://groups.example', id: 'Maps' },
                { relay: 'https://bad.example', id: 'parks' },
                { relay: 'wss://groups.example', id: 'bad id' },
            ],
        }));

        expect(loadRememberedGroups({ ownerPubkey: 'a'.repeat(64), storage: store }).map((group) => group.key)).toEqual([
            "wss://groups.example'Maps",
        ]);
    });
});
