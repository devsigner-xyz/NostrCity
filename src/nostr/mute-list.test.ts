import { describe, expect, test, vi } from 'vitest';
import type { AuthProvider } from './auth/providers/types';
import type { NostrEvent } from './types';
import { buildEncryptedMuteListContent, extractMuteListTags, extractMutedPubkeys, parseMutedPubkeysFromTags } from './mute-list';

function buildProvider(): AuthProvider {
    return {
        method: 'nip46',
        supports: {
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip04', 'nip44'],
        },
        resolveSession: vi.fn(),
        signEvent: vi.fn(),
        encrypt: vi.fn(async (_pubkey, plaintext, scheme) => `enc:${scheme || 'nip44'}:${plaintext}`),
        decrypt: vi.fn(async (_pubkey, ciphertext, scheme) => {
            if (ciphertext.startsWith('legacy?iv=')) {
                return JSON.stringify([
                    ['p', 'b'.repeat(64)],
                    ['p', 'a'.repeat(64)],
                ]);
            }

            return `dec:${scheme || 'nip44'}:${ciphertext}`.replace(`dec:${scheme || 'nip44'}:`, '');
        }),
        lock: vi.fn(async () => {}),
    };
}

function muteEvent(input: Partial<NostrEvent> = {}): NostrEvent {
    return {
        id: '1'.repeat(64),
        pubkey: 'f'.repeat(64),
        kind: 10000,
        created_at: 123,
        tags: [],
        content: '',
        ...input,
    };
}

describe('mute-list', () => {
    test('parses muted pubkeys from public p tags', () => {
        expect(parseMutedPubkeysFromTags([
            ['p', 'a'.repeat(64)],
            ['e', '1'.repeat(64)],
            ['p', 'b'.repeat(64)],
        ])).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
    });

    test('merges encrypted and public muted pubkeys without duplicates', async () => {
        const provider = buildProvider();

        const muted = await extractMutedPubkeys({
            event: muteEvent({
                tags: [
                    ['p', 'a'.repeat(64)],
                    ['p', 'c'.repeat(64)],
                ],
                content: JSON.stringify([
                    ['p', 'b'.repeat(64)],
                    ['p', 'a'.repeat(64)],
                ]),
            }),
            provider,
            ownerPubkey: 'f'.repeat(64),
        });

        expect(muted).toEqual(['a'.repeat(64), 'c'.repeat(64), 'b'.repeat(64)]);
        expect(provider.decrypt).toHaveBeenCalledWith('f'.repeat(64), JSON.stringify([
            ['p', 'b'.repeat(64)],
            ['p', 'a'.repeat(64)],
        ]), 'nip44');
    });

    test('ignores non-p tags for this feature scope', async () => {
        const provider = buildProvider();

        const muted = await extractMutedPubkeys({
            event: muteEvent({
                tags: [
                    ['word', 'spam'],
                    ['t', 'nsfw'],
                    ['e', '1'.repeat(64)],
                ],
                content: 'legacy?iv=1',
            }),
            provider,
            ownerPubkey: 'f'.repeat(64),
        });

        expect(muted).toEqual(['b'.repeat(64), 'a'.repeat(64)]);
        expect(provider.decrypt).toHaveBeenCalledWith('f'.repeat(64), 'legacy?iv=1', 'nip04');
    });

    test('builds encrypted payload from muted pubkeys only', async () => {
        const provider = buildProvider();

        const ciphertext = await buildEncryptedMuteListContent({
            mutedPubkeys: ['A'.repeat(64), 'b'.repeat(64), 'A'.repeat(64), 'invalid'],
            provider,
            ownerPubkey: 'f'.repeat(64),
        });

        expect(ciphertext).toBe(`enc:nip44:${JSON.stringify([
            ['p', 'a'.repeat(64)],
            ['p', 'b'.repeat(64)],
        ])}`);
        expect(provider.encrypt).toHaveBeenCalledWith('f'.repeat(64), JSON.stringify([
            ['p', 'a'.repeat(64)],
            ['p', 'b'.repeat(64)],
        ]), 'nip44');
    });

    test('extracts full mute tags preserving non-user entries', async () => {
        const provider = buildProvider();

        const tags = await extractMuteListTags({
            event: muteEvent({
                tags: [
                    ['t', 'nsfw'],
                    ['word', 'spam'],
                    ['p', 'a'.repeat(64)],
                ],
                content: JSON.stringify([
                    ['e', '1'.repeat(64)],
                    ['p', 'b'.repeat(64)],
                ]),
            }),
            provider,
            ownerPubkey: 'f'.repeat(64),
        });

        expect(tags).toEqual([
            ['t', 'nsfw'],
            ['word', 'spam'],
            ['p', 'a'.repeat(64)],
            ['e', '1'.repeat(64)],
            ['p', 'b'.repeat(64)],
        ]);
    });

    test('builds encrypted payload preserving non-user mute tags when provided', async () => {
        const provider = buildProvider();

        const ciphertext = await buildEncryptedMuteListContent({
            tags: [
                ['t', 'nsfw'],
                ['word', 'spam'],
                ['p', 'A'.repeat(64)],
                ['p', 'b'.repeat(64)],
            ],
            provider,
            ownerPubkey: 'f'.repeat(64),
        });

        expect(ciphertext).toBe(`enc:nip44:${JSON.stringify([
            ['t', 'nsfw'],
            ['word', 'spam'],
            ['p', 'a'.repeat(64)],
            ['p', 'b'.repeat(64)],
        ])}`);
    });

    test('fails closed in strict mode when encrypted mute content cannot be preserved', async () => {
        const provider = buildProvider();
        vi.mocked(provider.decrypt).mockRejectedValueOnce(new Error('decrypt failed'));

        await expect(extractMuteListTags({
            event: muteEvent({ content: 'ciphertext' }),
            provider,
            ownerPubkey: 'f'.repeat(64),
            strict: true,
        })).rejects.toThrow('No se pudo preservar la mute list cifrada actual');
    });
});
