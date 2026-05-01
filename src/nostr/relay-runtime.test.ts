import { describe, expect, test } from 'vitest';
import { resolveConservativeSocialRelaySets } from './relay-runtime';

describe('resolveConservativeSocialRelaySets', () => {
    test('uses read and both relays as primary for social consumption before write-only relays', () => {
        const resolved = resolveConservativeSocialRelaySets({
            ownerPubkey: '1'.repeat(64),
            loadSettings: () => ({
                relays: ['wss://fallback.user-relay'],
                byType: {
                    nip65Both: ['wss://relay.both'],
                    nip65Read: ['wss://relay.read'],
                    nip65Write: ['wss://relay.write'],
                    dmInbox: [],
                    search: [],
                    groups: [],
                },
            }),
            bootstrapRelays: ['wss://bootstrap.one'],
        });

        expect(resolved.primary).toEqual(['wss://relay.both', 'wss://relay.read']);
        expect(resolved.fallback).toEqual(['wss://bootstrap.one']);
    });

    test('uses owner-scoped relays as primary and bootstrap as fallback', () => {
        const resolved = resolveConservativeSocialRelaySets({
            ownerPubkey: 'f'.repeat(64),
            loadSettings: () => ({
                relays: ['wss://user-relay.one'],
                byType: {
                    nip65Both: ['wss://user-relay.one'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                    search: [],
                    groups: [],
                },
            }),
            bootstrapRelays: ['wss://bootstrap.one', 'wss://bootstrap.two'],
        });

        expect(resolved.primary).toEqual(['wss://user-relay.one']);
        expect(resolved.fallback).toEqual(['wss://bootstrap.one', 'wss://bootstrap.two']);
    });

    test('uses bootstrap as primary when owner-scoped relays are empty', () => {
        const resolved = resolveConservativeSocialRelaySets({
            ownerPubkey: 'a'.repeat(64),
            loadSettings: () => ({
                relays: [],
                byType: {
                    nip65Both: [],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                    search: [],
                    groups: [],
                },
            }),
            bootstrapRelays: ['wss://bootstrap.one'],
        });

        expect(resolved.primary).toEqual(['wss://bootstrap.one']);
        expect(resolved.fallback).toEqual([]);
    });

    test('merges additional read relays into primary set while preserving bootstrap fallback', () => {
        const resolved = resolveConservativeSocialRelaySets({
            ownerPubkey: '9'.repeat(64),
            additionalReadRelays: ['wss://hint.one', 'wss://relay.read', 'wss://hint.two'],
            loadSettings: () => ({
                relays: ['wss://fallback.user-relay'],
                byType: {
                    nip65Both: ['wss://relay.both'],
                    nip65Read: ['wss://relay.read'],
                    nip65Write: ['wss://relay.write'],
                    dmInbox: [],
                    search: [],
                    groups: [],
                },
            }),
            bootstrapRelays: ['wss://bootstrap.one', 'wss://bootstrap.two'],
        });

        expect(resolved.primary).toEqual([
            'wss://hint.one',
            'wss://hint.two',
            'wss://relay.both',
            'wss://relay.read',
        ]);
        expect(resolved.fallback).toEqual(['wss://bootstrap.one', 'wss://bootstrap.two']);
    });

    test('canonicalizes equivalent relay sets from hints and suggestions', () => {
        const resolved = resolveConservativeSocialRelaySets({
            ownerPubkey: '8'.repeat(64),
            additionalReadRelays: ['wss://relay.hint', 'wss://relay.extra', 'wss://relay.hint'],
            loadSettings: () => ({
                relays: [],
                byType: {
                    nip65Both: ['wss://relay.suggested'],
                    nip65Read: ['wss://relay.extra'],
                    nip65Write: [],
                    dmInbox: [],
                    search: [],
                    groups: [],
                },
            }),
            bootstrapRelays: ['wss://bootstrap.one'],
        });

        expect(resolved.primary).toEqual([
            'wss://relay.extra',
            'wss://relay.hint',
            'wss://relay.suggested',
        ]);
        expect(resolved.fallback).toEqual(['wss://bootstrap.one']);
    });
});
