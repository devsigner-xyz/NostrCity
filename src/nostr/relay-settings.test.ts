import { beforeEach, describe, expect, test } from 'vitest';
import {
    addRelay,
    getDefaultDmInboxRelays,
    getDefaultRelaySettings,
    setRelayNip65Access,
    getRelaySetByType,
    loadRelaySettings,
    RELAY_SETTINGS_STORAGE_KEY,
    removeRelay,
    saveRelaySettings,
} from './relay-settings';

describe('relay-settings', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('returns bootstrap relays when storage is empty', () => {
        const state = loadRelaySettings(window.localStorage);
        expect(state).toEqual(getDefaultRelaySettings());
        expect(getRelaySetByType(state, 'dmInbox').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'nip65Both').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'nip65Read').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'nip65Write').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'groups')).toEqual([]);
        expect(getRelaySetByType(state, 'search')).toEqual([
            'wss://search.nos.today',
            'wss://relay.noswhere.com',
            'wss://filter.nostr.wine',
        ]);
    });

    test('falls back to bootstrap relays when storage payload is malformed', () => {
        window.localStorage.setItem(RELAY_SETTINGS_STORAGE_KEY, '{invalid-json');
        const state = loadRelaySettings(window.localStorage);

        expect(state).toEqual(getDefaultRelaySettings());
    });

    test('normalizes and deduplicates relays on save', () => {
        const saved = saveRelaySettings(
            {
                relays: [
                    'wss://relay.damus.io/',
                    'wss://relay.damus.io',
                    'wss://nos.lol',
                    'https://invalid.example',
                ],
                byType: {
                    nip65Both: ['wss://relay.damus.io'],
                    nip65Read: ['wss://relay.damus.io', 'wss://nos.lol'],
                    nip65Write: ['wss://relay.damus.io'],
                    dmInbox: ['wss://nos.lol'],
                    search: ['wss://search.nos.today', 'wss://search.nos.today/'],
                    groups: ['wss://groups.fiatjaf.com/', 'wss://groups.fiatjaf.com', 'https://invalid.example'],
                },
            },
            window.localStorage
        );

        expect(saved.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
        expect(saved.byType.search).toEqual(['wss://search.nos.today']);
        expect(saved.byType.groups).toEqual(['wss://groups.fiatjaf.com']);
        expect(loadRelaySettings(window.localStorage)).toEqual(saved);
    });

    test('adds and removes relays while keeping normalized values', () => {
        const initial = {
            relays: ['wss://relay.damus.io'],
            byType: {
                nip65Both: ['wss://relay.damus.io'],
                nip65Read: [] as string[],
                nip65Write: [] as string[],
                dmInbox: [] as string[],
                search: [] as string[],
                groups: [] as string[],
            },
        };

        const afterAdd = addRelay(initial, 'wss://nos.lol/', 'dmInbox');
        const duplicateAdd = addRelay(afterAdd, 'wss://nos.lol', 'dmInbox');
        const afterRemove = removeRelay(duplicateAdd, 'wss://nos.lol/', 'dmInbox');
        const afterSearchAdd = addRelay(afterRemove, 'wss://search.nos.today/', 'search');
        const afterSearchRemove = removeRelay(afterSearchAdd, 'wss://search.nos.today/', 'search');

        expect(afterAdd.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
        expect(getRelaySetByType(afterAdd, 'dmInbox')).toEqual(['wss://nos.lol']);
        expect(duplicateAdd.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
        expect(getRelaySetByType(duplicateAdd, 'dmInbox')).toEqual(['wss://nos.lol']);
        expect(afterRemove.relays).toEqual(['wss://relay.damus.io']);
        expect(getRelaySetByType(afterRemove, 'dmInbox')).toEqual([]);
        expect(afterSearchAdd.relays).toEqual(['wss://relay.damus.io']);
        expect(getRelaySetByType(afterSearchAdd, 'search')).toEqual(['wss://search.nos.today']);
        expect(afterSearchRemove.relays).toEqual(['wss://relay.damus.io']);
        expect(getRelaySetByType(afterSearchRemove, 'search')).toEqual([]);
    });

    test('keeps group relays as a local category outside runtime relays', () => {
        const initial = getDefaultRelaySettings();

        const afterAdd = addRelay(initial, 'wss://groups.fiatjaf.com/', 'groups');
        const afterRemove = removeRelay(afterAdd, 'wss://groups.fiatjaf.com', 'groups');

        expect(afterAdd.byType.groups).toEqual(['wss://groups.fiatjaf.com']);
        expect(afterAdd.relays).toEqual(initial.relays);
        expect(afterRemove.byType.groups).toEqual([]);
        expect(afterRemove.relays).toEqual(initial.relays);
    });

    test('removes retired group relays from persisted settings', () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: [],
                byType: {
                    groups: ['wss://pyramid.fiatjaf.com', 'wss://groups.0xchat.com'],
                },
            })
        );

        expect(loadRelaySettings(window.localStorage).byType.groups).toEqual(['wss://groups.0xchat.com']);
    });

    test('global relay removal leaves group relays isolated', () => {
        const relayUrl = 'wss://groups.fiatjaf.com';
        const initial = addRelay(getDefaultRelaySettings(), relayUrl, 'groups');

        const afterRemove = removeRelay(initial, relayUrl);

        expect(afterRemove.byType.groups).toEqual([relayUrl]);
    });

    test('rewrites a relay across NIP-65 access states', () => {
        const relayUrl = 'wss://relay.example';
        const initial = {
            relays: [relayUrl],
            byType: {
                nip65Both: [relayUrl],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
                search: [],
                groups: [],
            },
        };

        const readOnly = setRelayNip65Access(initial, relayUrl, { read: true, write: false });
        const writeOnly = setRelayNip65Access(readOnly, relayUrl, { read: false, write: true });
        const off = setRelayNip65Access(writeOnly, relayUrl, { read: false, write: false });

        expect(getRelaySetByType(readOnly, 'nip65Both')).toEqual([]);
        expect(getRelaySetByType(readOnly, 'nip65Read')).toEqual([relayUrl]);
        expect(getRelaySetByType(readOnly, 'nip65Write')).toEqual([]);

        expect(getRelaySetByType(writeOnly, 'nip65Both')).toEqual([]);
        expect(getRelaySetByType(writeOnly, 'nip65Read')).toEqual([]);
        expect(getRelaySetByType(writeOnly, 'nip65Write')).toEqual([relayUrl]);

        expect(getRelaySetByType(off, 'nip65Both')).toEqual([]);
        expect(getRelaySetByType(off, 'nip65Read')).toEqual([]);
        expect(getRelaySetByType(off, 'nip65Write')).toEqual([]);
    });

    test('rewriting NIP-65 access does not change dmInbox or search relays', () => {
        const relayUrl = 'wss://relay.example';
        const initial = {
            relays: [relayUrl, 'wss://dm.example'],
            byType: {
                nip65Both: [relayUrl],
                nip65Read: [],
                nip65Write: [],
                dmInbox: ['wss://dm.example'],
                search: ['wss://search.example'],
                groups: ['wss://groups.fiatjaf.com'],
            },
        };

        const nextState = setRelayNip65Access(initial, relayUrl, { read: false, write: false });

        expect(getRelaySetByType(nextState, 'nip65Both')).toEqual([]);
        expect(getRelaySetByType(nextState, 'nip65Read')).toEqual([]);
        expect(getRelaySetByType(nextState, 'nip65Write')).toEqual([]);
        expect(getRelaySetByType(nextState, 'dmInbox')).toEqual(['wss://dm.example']);
        expect(getRelaySetByType(nextState, 'search')).toEqual(['wss://search.example']);
        expect(getRelaySetByType(nextState, 'groups')).toEqual(['wss://groups.fiatjaf.com']);
    });

    test('rewriting NIP-65 access preserves overlapping dmInbox relays', () => {
        const relayUrl = 'wss://relay.example';
        const initial = {
            relays: [relayUrl],
            byType: {
                nip65Both: [relayUrl],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [relayUrl],
                search: [],
                groups: [],
            },
        };

        const nextState = setRelayNip65Access(initial, relayUrl, { read: false, write: false });

        expect(getRelaySetByType(nextState, 'nip65Both')).toEqual([]);
        expect(getRelaySetByType(nextState, 'nip65Read')).toEqual([]);
        expect(getRelaySetByType(nextState, 'nip65Write')).toEqual([]);
        expect(getRelaySetByType(nextState, 'dmInbox')).toEqual([relayUrl]);
    });

    test('rewriting NIP-65 access does not introduce a missing relay', () => {
        const initial = {
            relays: ['wss://existing.example'],
            byType: {
                nip65Both: ['wss://existing.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
                search: [],
                groups: [],
            },
        };

        const nextState = setRelayNip65Access(initial, 'wss://relay.example', { read: true, write: false });

        expect(nextState).toEqual(initial);
    });

    test('returns a copy of default dm inbox relays', () => {
        const defaults = getDefaultDmInboxRelays();
        defaults.push('wss://mutated.example');

        expect(getDefaultDmInboxRelays()).not.toContain('wss://mutated.example');
    });

    test('migrates legacy payload into general relay type', () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({ relays: ['wss://relay.legacy.example'] })
        );

        const state = loadRelaySettings(window.localStorage);
        expect(getRelaySetByType(state, 'nip65Both')).toEqual(['wss://relay.legacy.example']);
        expect(getRelaySetByType(state, 'dmInbox').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'nip65Read').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'nip65Write').length).toBeGreaterThan(0);
        expect(getRelaySetByType(state, 'search')).toEqual([
            'wss://search.nos.today',
            'wss://relay.noswhere.com',
            'wss://filter.nostr.wine',
        ]);
        expect(state.byType.groups).toEqual([]);
    });

    test('migrates v1 typed payload into protocol-aligned categories', () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.legacy.example'],
                byType: {
                    general: ['wss://relay.general.example'],
                    dmInbox: ['wss://relay.legacy.read.example'],
                    dmOutbox: ['wss://relay.legacy.write.example'],
                },
            })
        );

        const state = loadRelaySettings(window.localStorage);
        expect(getRelaySetByType(state, 'nip65Both')).toEqual(['wss://relay.general.example']);
        expect(getRelaySetByType(state, 'nip65Read')).toEqual(['wss://relay.legacy.read.example']);
        expect(getRelaySetByType(state, 'nip65Write')).toEqual(['wss://relay.legacy.write.example']);
        expect(getRelaySetByType(state, 'dmInbox')).toEqual([]);
        expect(state.byType.groups).toEqual([]);
    });

    test('keeps relay settings isolated per owner pubkey', () => {
        const ownerA = 'a'.repeat(64);
        const ownerB = 'b'.repeat(64);

        const savedA = saveRelaySettings({
            relays: ['wss://relay.owner-a.example'],
            byType: {
                nip65Both: ['wss://relay.owner-a.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: [],
                search: ['wss://search.nos.today'],
                groups: [],
            },
        }, { ownerPubkey: ownerA });

        const loadedA = loadRelaySettings({ ownerPubkey: ownerA });
        const loadedB = loadRelaySettings({ ownerPubkey: ownerB });

        expect(savedA.relays).toEqual(['wss://relay.owner-a.example']);
        expect(loadedA.relays).toEqual(['wss://relay.owner-a.example']);
        expect(loadedA.byType.search).toEqual(['wss://search.nos.today']);
        expect(loadedB).toEqual(getDefaultRelaySettings());
    });

    test('migrates legacy global relay settings once to first owner', () => {
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({ relays: ['wss://relay.legacy.example'] })
        );

        const ownerA = 'a'.repeat(64);
        const ownerB = 'b'.repeat(64);

        const loadedA = loadRelaySettings({ ownerPubkey: ownerA });
        const loadedB = loadRelaySettings({ ownerPubkey: ownerB });

        expect(loadedA.relays).toContain('wss://relay.legacy.example');
        expect(loadedB.relays).not.toContain('wss://relay.legacy.example');
    });
});
