import { describe, expect, test, vi } from 'vitest';
import type { RelaySettingsState } from '../relay-settings';
import { bootstrapLocalAccount } from './bootstrap-profile';

function buildSyntheticRelaySettings(): RelaySettingsState {
    return {
        relays: [
            'wss://relay-one.example.invalid',
            'wss://read.example.invalid',
            'wss://write.example.invalid',
            'wss://dm.example.invalid',
        ],
        byType: {
            nip65Both: ['wss://relay-one.example.invalid'],
            nip65Read: ['wss://read.example.invalid'],
            nip65Write: ['wss://write.example.invalid'],
            dmInbox: ['wss://dm.example.invalid'],
            search: [],
            groups: [],
        },
    };
}

describe('bootstrapLocalAccount', () => {
    test('publishes profile, relay list, and dm inbox bootstrap events', async () => {
        const publishEvent = vi.fn(async (event) => ({
            ...event,
            id: `${event.kind}`.repeat(64).slice(0, 64),
            pubkey: 'f'.repeat(64),
        }));

        const relaySettings = buildSyntheticRelaySettings();
        await bootstrapLocalAccount({
            publisher: { publishEvent },
            profile: {
                name: 'Synthetic Mapper',
                about: 'Synthetic profile text',
                picture: 'https://example.com/avatar.png',
            },
            relaySettings,
            now: () => 123,
        });

        expect(publishEvent).toHaveBeenNthCalledWith(1, {
            kind: 0,
            content: JSON.stringify({
                name: 'Synthetic Mapper',
                about: 'Synthetic profile text',
                picture: 'https://example.com/avatar.png',
            }),
            created_at: 123,
            tags: [],
        });

        expect(publishEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 10002, created_at: 123 }));
        expect(publishEvent.mock.calls[1]?.[0]?.tags).toContainEqual(['r', 'wss://relay-one.example.invalid']);
        expect(publishEvent.mock.calls[1]?.[0]?.tags).toContainEqual(['r', 'wss://read.example.invalid', 'read']);
        expect(publishEvent.mock.calls[1]?.[0]?.tags).toContainEqual(['r', 'wss://write.example.invalid', 'write']);

        expect(publishEvent).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 10050, created_at: 123 }));
        expect(publishEvent.mock.calls[2]?.[0]?.tags).toContainEqual(['relay', 'wss://dm.example.invalid']);
    });

    test('skips profile event when profile fields are empty', async () => {
        const publishEvent = vi.fn(async (event) => ({
            ...event,
            id: `${event.kind}`.repeat(64).slice(0, 64),
            pubkey: 'f'.repeat(64),
        }));

        await bootstrapLocalAccount({
            publisher: { publishEvent },
            relaySettings: buildSyntheticRelaySettings(),
            now: () => 999,
        });

        expect(publishEvent).toHaveBeenCalledTimes(2);
        expect(publishEvent.mock.calls[0]?.[0]?.kind).toBe(10002);
        expect(publishEvent.mock.calls[1]?.[0]?.kind).toBe(10050);
    });

    test('continues attempting relay bootstrap events after an earlier publish failure', async () => {
        const publishEvent = vi.fn()
            .mockRejectedValueOnce(new Error('profile failed'))
            .mockResolvedValueOnce({ id: 'relay-list' })
            .mockResolvedValueOnce({ id: 'dm-list' });

        await expect(bootstrapLocalAccount({
            publisher: { publishEvent },
            profile: { name: 'Synthetic Mapper' },
            relaySettings: buildSyntheticRelaySettings(),
            now: () => 123,
        })).rejects.toThrow('profile failed');

        expect(publishEvent).toHaveBeenCalledTimes(3);
        expect(publishEvent.mock.calls[1]?.[0]?.kind).toBe(10002);
        expect(publishEvent.mock.calls[2]?.[0]?.kind).toBe(10050);
    });

    test('continues attempting all bootstrap events and reports the last publish error', async () => {
        const publishEvent = vi.fn()
            .mockRejectedValueOnce(new Error('profile ACK missing'))
            .mockRejectedValueOnce(new Error('relay list ACK missing'))
            .mockRejectedValueOnce(new Error('dm inbox ACK missing'));

        await expect(bootstrapLocalAccount({
            publisher: { publishEvent },
            profile: { name: 'Synthetic Mapper' },
            relaySettings: buildSyntheticRelaySettings(),
            now: () => 123,
        })).rejects.toThrow('dm inbox ACK missing');

        expect(publishEvent).toHaveBeenCalledTimes(3);
        expect(publishEvent.mock.calls.map((call) => call[0]?.kind)).toEqual([0, 10002, 10050]);
    });
});
