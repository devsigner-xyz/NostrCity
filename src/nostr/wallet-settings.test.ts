import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    WALLET_SETTINGS_STORAGE_KEY,
    getDefaultWalletSettings,
    loadWalletSettings,
    saveWalletSettings,
} from './wallet-settings';

describe('wallet-settings', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    test('loads disconnected defaults when storage is empty', () => {
        expect(loadWalletSettings()).toEqual(getDefaultWalletSettings());
    });

    test('persists nwc wallet settings normalized for the active owner', () => {
        const ownerPubkey = 'f'.repeat(64);
        const scopedKey = `${WALLET_SETTINGS_STORAGE_KEY}:user:${ownerPubkey}`;
        const saved = saveWalletSettings({
            activeConnection: {
                method: 'nwc',
                uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                walletServicePubkey: 'A'.repeat(64),
                relays: ['wss://relay.one.example/', 'wss://relay.one.example'],
                secret: 'B'.repeat(64),
                encryption: 'nip44_v2',
                restoreState: 'connected',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }, { ownerPubkey });

        expect(saved.activeConnection).toMatchObject({
            method: 'nwc',
            walletServicePubkey: 'a'.repeat(64),
            relays: ['wss://relay.one.example'],
            secret: 'b'.repeat(64),
            restoreState: 'connected',
        });

        const persisted = window.localStorage.getItem(scopedKey);
        expect(persisted).toContain('nip44_v2');
        expect(persisted).not.toContain('b'.repeat(64));
        expect(persisted).not.toContain('secret=');
        expect(window.sessionStorage.getItem('nostr.overlay.wallet.session.v1')).toBeNull();
        expect(window.sessionStorage.getItem(`nostr.overlay.wallet.session.v1:user:${ownerPubkey}`)).toBeNull();

        expect(loadWalletSettings({ ownerPubkey }).activeConnection).toMatchObject({
            method: 'nwc',
            secret: '',
            uri: '',
            restoreState: 'reconnect-required',
        });
    });

    test('keeps wallet settings isolated per owner pubkey', () => {
        const ownerA = 'a'.repeat(64);
        const ownerB = 'b'.repeat(64);

        saveWalletSettings({
            activeConnection: {
                method: 'webln',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: true,
                    notifications: false,
                },
                restoreState: 'reconnect-required',
            },
        }, { ownerPubkey: ownerA });

        expect(loadWalletSettings({ ownerPubkey: ownerA }).activeConnection).toMatchObject({ method: 'webln' });
        expect(loadWalletSettings({ ownerPubkey: ownerB })).toEqual(getDefaultWalletSettings());
    });

    test('drops malformed persisted payloads back to defaults', () => {
        window.localStorage.setItem(WALLET_SETTINGS_STORAGE_KEY, '{bad-json');
        expect(loadWalletSettings()).toEqual(getDefaultWalletSettings());
    });

    test('deletes malformed persisted payloads that contain secret material', () => {
        window.localStorage.setItem(
            WALLET_SETTINGS_STORAGE_KEY,
            `{bad-json nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`
        );

        expect(loadWalletSettings()).toEqual(getDefaultWalletSettings());
        expect(window.localStorage.getItem(WALLET_SETTINGS_STORAGE_KEY)).toBeNull();
    });

    test('clears session-scoped nwc secret when disconnecting', () => {
        const owner = 'f'.repeat(64);
        saveWalletSettings({
            activeConnection: {
                method: 'nwc',
                uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                walletServicePubkey: 'a'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: 'b'.repeat(64),
                encryption: 'nip44_v2',
                restoreState: 'connected',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: true,
                    notifications: false,
                },
            },
        }, { ownerPubkey: owner });

        saveWalletSettings({ activeConnection: null }, { ownerPubkey: owner });
        expect(loadWalletSettings({ ownerPubkey: owner })).toEqual(getDefaultWalletSettings());
    });

    test('removes legacy session-scoped nwc secrets without restoring them', () => {
        const ownerA = 'a'.repeat(64);

        window.localStorage.setItem(WALLET_SETTINGS_STORAGE_KEY, JSON.stringify({
            activeConnection: {
                method: 'nwc',
                uri: '',
                walletServicePubkey: 'c'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: '',
                encryption: 'nip44_v2',
                restoreState: 'reconnect-required',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }));
        window.sessionStorage.setItem('nostr.overlay.wallet.session.v1', JSON.stringify({
            uri: `nostr+walletconnect://${'c'.repeat(64)}?relay=wss://relay.one.example&secret=${'d'.repeat(64)}`,
            secret: 'd'.repeat(64),
        }));

        expect(loadWalletSettings({ ownerPubkey: ownerA }).activeConnection).toMatchObject({
            method: 'nwc',
            secret: '',
            restoreState: 'reconnect-required',
        });
        expect(window.sessionStorage.getItem('nostr.overlay.wallet.session.v1')).toBeNull();
    });

    test('removes scoped legacy nwc session secrets', () => {
        const owner = 'f'.repeat(64);
        const scopedSessionKey = `nostr.overlay.wallet.session.v1:user:${owner}`;

        window.localStorage.setItem(`${WALLET_SETTINGS_STORAGE_KEY}:user:${owner}`, JSON.stringify({
            activeConnection: {
                method: 'nwc',
                uri: '',
                walletServicePubkey: 'a'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: '',
                encryption: 'nip44_v2',
                restoreState: 'reconnect-required',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }));
        window.sessionStorage.setItem(scopedSessionKey, JSON.stringify({
            uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
            secret: 'b'.repeat(64),
        }));

        expect(loadWalletSettings({ ownerPubkey: owner }).activeConnection).toMatchObject({
            method: 'nwc',
            secret: '',
            restoreState: 'reconnect-required',
        });
        expect(window.sessionStorage.getItem(scopedSessionKey)).toBeNull();
    });

    test('scrubs legacy scoped localStorage nwc secrets during load', () => {
        const owner = 'f'.repeat(64);
        const scopedKey = `${WALLET_SETTINGS_STORAGE_KEY}:user:${owner}`;

        window.localStorage.setItem(scopedKey, JSON.stringify({
            activeConnection: {
                method: 'nwc',
                uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                walletServicePubkey: 'a'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: 'b'.repeat(64),
                encryption: 'nip44_v2',
                restoreState: 'connected',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }));

        expect(loadWalletSettings({ ownerPubkey: owner }).activeConnection).toMatchObject({
            method: 'nwc',
            secret: '',
            uri: '',
            restoreState: 'reconnect-required',
        });
        expect(window.localStorage.getItem(scopedKey)).not.toContain('b'.repeat(64));
        expect(window.localStorage.getItem(scopedKey)).not.toContain('secret=');
    });

    test('scrubs legacy global localStorage nwc secrets during unscoped load', () => {
        window.localStorage.setItem(WALLET_SETTINGS_STORAGE_KEY, JSON.stringify({
            activeConnection: {
                method: 'nwc',
                uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                walletServicePubkey: 'a'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: 'b'.repeat(64),
                encryption: 'nip44_v2',
                restoreState: 'connected',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }));

        expect(loadWalletSettings().activeConnection).toMatchObject({
            method: 'nwc',
            secret: '',
            uri: '',
            restoreState: 'reconnect-required',
        });
        expect(window.localStorage.getItem(WALLET_SETTINGS_STORAGE_KEY)).not.toContain('b'.repeat(64));
        expect(window.localStorage.getItem(WALLET_SETTINGS_STORAGE_KEY)).not.toContain('secret=');
    });

    test('removes global legacy session secrets when scoped settings already exist', () => {
        const owner = 'f'.repeat(64);

        window.localStorage.setItem(`${WALLET_SETTINGS_STORAGE_KEY}:user:${owner}`, JSON.stringify({
            activeConnection: {
                method: 'nwc',
                uri: '',
                walletServicePubkey: 'a'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: '',
                encryption: 'nip44_v2',
                restoreState: 'reconnect-required',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }));
        window.sessionStorage.setItem('nostr.overlay.wallet.session.v1', JSON.stringify({
            uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
            secret: 'b'.repeat(64),
        }));

        expect(loadWalletSettings({ ownerPubkey: owner }).activeConnection).toMatchObject({
            method: 'nwc',
            secret: '',
            restoreState: 'reconnect-required',
        });
        expect(window.sessionStorage.getItem('nostr.overlay.wallet.session.v1')).toBeNull();
    });

    test('removes all scoped legacy session secrets when loading settings', () => {
        const owner = 'f'.repeat(64);
        const otherOwner = 'e'.repeat(64);
        const scopedSessionKey = `nostr.overlay.wallet.session.v1:user:${owner}`;
        const otherScopedSessionKey = `nostr.overlay.wallet.session.v1:user:${otherOwner}`;

        window.localStorage.setItem(`${WALLET_SETTINGS_STORAGE_KEY}:user:${owner}`, JSON.stringify({
            activeConnection: {
                method: 'nwc',
                uri: '',
                walletServicePubkey: 'a'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: '',
                encryption: 'nip44_v2',
                restoreState: 'reconnect-required',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }));
        window.sessionStorage.setItem(scopedSessionKey, JSON.stringify({
            uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
            secret: 'b'.repeat(64),
        }));
        window.sessionStorage.setItem(otherScopedSessionKey, JSON.stringify({
            uri: `nostr+walletconnect://${'c'.repeat(64)}?relay=wss://relay.two.example&secret=${'d'.repeat(64)}`,
            secret: 'd'.repeat(64),
        }));

        expect(loadWalletSettings({ ownerPubkey: owner }).activeConnection).toMatchObject({
            method: 'nwc',
            secret: '',
            restoreState: 'reconnect-required',
        });
        expect(window.sessionStorage.getItem(scopedSessionKey)).toBeNull();
        expect(window.sessionStorage.getItem(otherScopedSessionKey)).toBeNull();
    });

    test('removes global and current scoped session secrets with non-enumerable storage', () => {
        const owner = 'f'.repeat(64);
        const otherOwner = 'e'.repeat(64);
        const scopedSessionKey = `nostr.overlay.wallet.session.v1:user:${owner}`;
        const otherScopedSessionKey = `nostr.overlay.wallet.session.v1:user:${otherOwner}`;
        const storageValues = new Map<string, string>([[
            `${WALLET_SETTINGS_STORAGE_KEY}:user:${owner}`,
            JSON.stringify({
                activeConnection: {
                    method: 'nwc',
                    uri: '',
                    walletServicePubkey: 'a'.repeat(64),
                    relays: ['wss://relay.one.example'],
                    secret: '',
                    encryption: 'nip44_v2',
                    restoreState: 'reconnect-required',
                    capabilities: {
                        payInvoice: true,
                        makeInvoice: false,
                        notifications: false,
                    },
                },
            }),
        ]]);
        const sessionValues = new Map<string, string>([
            ['nostr.overlay.wallet.session.v1', 'global-secret'],
            [scopedSessionKey, 'owner-secret'],
            [otherScopedSessionKey, 'other-secret'],
        ]);

        loadWalletSettings({
            ownerPubkey: owner,
            storage: {
                getItem: (key) => storageValues.get(key) ?? null,
                setItem: (key, value) => { storageValues.set(key, value); },
                removeItem: (key) => { storageValues.delete(key); },
            },
            sessionStorage: {
                getItem: (key) => sessionValues.get(key) ?? null,
                setItem: (key, value) => { sessionValues.set(key, value); },
                removeItem: (key) => { sessionValues.delete(key); },
            },
        });

        expect(sessionValues.has('nostr.overlay.wallet.session.v1')).toBe(false);
        expect(sessionValues.has(scopedSessionKey)).toBe(false);
        expect(sessionValues.has(otherScopedSessionKey)).toBe(true);
    });

    test('removes legacy global localStorage secrets when scoped settings already exist', () => {
        const owner = 'f'.repeat(64);

        window.localStorage.setItem(`${WALLET_SETTINGS_STORAGE_KEY}:user:${owner}`, JSON.stringify({
            activeConnection: {
                method: 'nwc',
                uri: '',
                walletServicePubkey: 'a'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: '',
                encryption: 'nip44_v2',
                restoreState: 'reconnect-required',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }));
        window.localStorage.setItem(WALLET_SETTINGS_STORAGE_KEY, JSON.stringify({
            activeConnection: {
                method: 'nwc',
                uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                walletServicePubkey: 'a'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: 'b'.repeat(64),
                encryption: 'nip44_v2',
                restoreState: 'connected',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }));

        expect(loadWalletSettings({ ownerPubkey: owner }).activeConnection).toMatchObject({
            method: 'nwc',
            secret: '',
            restoreState: 'reconnect-required',
        });
        expect(window.localStorage.getItem(WALLET_SETTINGS_STORAGE_KEY)).toBeNull();
    });

    test('removes legacy session secrets on save when localStorage is unavailable', () => {
        const owner = 'f'.repeat(64);
        const scopedSessionKey = `nostr.overlay.wallet.session.v1:user:${owner}`;
        const localStorageSpy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
            throw new Error('localStorage unavailable');
        });

        try {
            window.sessionStorage.setItem('nostr.overlay.wallet.session.v1', JSON.stringify({
                uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                secret: 'b'.repeat(64),
            }));
            window.sessionStorage.setItem(scopedSessionKey, JSON.stringify({
                uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                secret: 'b'.repeat(64),
            }));

            const saved = saveWalletSettings({
                activeConnection: {
                    method: 'nwc',
                    uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                    walletServicePubkey: 'a'.repeat(64),
                    relays: ['wss://relay.one.example'],
                    secret: 'b'.repeat(64),
                    encryption: 'nip44_v2',
                    restoreState: 'connected',
                    capabilities: {
                        payInvoice: true,
                        makeInvoice: false,
                        notifications: false,
                    },
                },
            }, { ownerPubkey: owner });

            expect(saved.activeConnection).toMatchObject({
                method: 'nwc',
                secret: 'b'.repeat(64),
                restoreState: 'connected',
            });
            expect(window.sessionStorage.getItem('nostr.overlay.wallet.session.v1')).toBeNull();
            expect(window.sessionStorage.getItem(scopedSessionKey)).toBeNull();
        } finally {
            localStorageSpy.mockRestore();
        }
    });

    test('removes legacy session secrets when migration marker skips global migration', () => {
        const owner = 'f'.repeat(64);
        const scopedSessionKey = `nostr.overlay.wallet.session.v1:user:${owner}`;

        window.localStorage.setItem(`${WALLET_SETTINGS_STORAGE_KEY}:legacy-migrated-user`, owner);
        window.sessionStorage.setItem('nostr.overlay.wallet.session.v1', JSON.stringify({
            uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
            secret: 'b'.repeat(64),
        }));
        window.sessionStorage.setItem(scopedSessionKey, JSON.stringify({
            uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
            secret: 'b'.repeat(64),
        }));

        expect(loadWalletSettings({ ownerPubkey: owner })).toEqual(getDefaultWalletSettings());
        expect(window.sessionStorage.getItem('nostr.overlay.wallet.session.v1')).toBeNull();
        expect(window.sessionStorage.getItem(scopedSessionKey)).toBeNull();
    });

    test('removes legacy global localStorage secrets when migration marker skips global migration', () => {
        const owner = 'f'.repeat(64);

        window.localStorage.setItem(`${WALLET_SETTINGS_STORAGE_KEY}:legacy-migrated-user`, owner);
        window.localStorage.setItem(WALLET_SETTINGS_STORAGE_KEY, JSON.stringify({
            activeConnection: {
                method: 'nwc',
                uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                walletServicePubkey: 'a'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: 'b'.repeat(64),
                encryption: 'nip44_v2',
                restoreState: 'connected',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }));

        expect(loadWalletSettings({ ownerPubkey: owner })).toEqual(getDefaultWalletSettings());
        expect(window.localStorage.getItem(WALLET_SETTINGS_STORAGE_KEY)).toBeNull();
    });
});
