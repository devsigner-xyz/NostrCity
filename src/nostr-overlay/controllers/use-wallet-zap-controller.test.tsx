import { act, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildScopedStorageKey } from '../../nostr/storage-scope';
import { loadWalletActivity, WALLET_ACTIVITY_STORAGE_KEY } from '../../nostr/wallet-activity';
import { WALLET_SETTINGS_STORAGE_KEY } from '../../nostr/wallet-settings';
import type { NostrClient, NostrEvent } from '../../nostr/types';
import type { WalletActivityState, WalletSettingsState } from '../../nostr/wallet-types';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        error: toastErrorMock,
        success: toastSuccessMock,
    },
}));

import {
    useWalletZapController,
    type UseWalletZapControllerInput,
    type WalletZapController,
} from './use-wallet-zap-controller';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const mountedRoots: RenderResult[] = [];
const WALLET_SESSION_CONNECTION_STORAGE_KEY = 'nostr.overlay.wallet.session.v1';

function ControllerProbe(props: {
    input: UseWalletZapControllerInput;
    onController: (controller: WalletZapController) => void;
}): ReactElement | null {
    const controller = useWalletZapController(props.input);

    useEffect(() => {
        props.onController(controller);
    }, [controller, props]);

    return null;
}

async function renderProbe(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    const result = { container, root };
    mountedRoots.push(result);
    return result;
}

async function flushEffects(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

function createDeferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });

    return { promise, resolve, reject };
}

function hexToBytes(value: string): Uint8Array {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
        bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

function createSignedInfoEvent(input: {
    secret: string;
    kind?: number;
    content?: string;
    tags?: string[][];
}): NostrEvent {
    return finalizeEvent({
        kind: input.kind ?? 13194,
        created_at: 1,
        tags: input.tags ?? [['encryption', 'nip44_v2 nip04']],
        content: input.content ?? 'pay_invoice make_invoice notifications',
    }, hexToBytes(input.secret)) as unknown as NostrEvent;
}

function createNwcFixture(infoEvent?: NostrEvent): {
    walletServicePubkey: string;
    clientSecret: string;
    nwcUri: string;
    client: NostrClient;
    createClient: ReturnType<typeof vi.fn<(relays?: string[]) => NostrClient>>;
} {
    const walletServiceSecret = '1'.repeat(64);
    const walletServicePubkey = getPublicKey(hexToBytes(walletServiceSecret));
    const clientSecret = '2'.repeat(64);
    const relay = 'wss://relay.example';
    const nwcUri = `nostr+walletconnect://${walletServicePubkey}?relay=${encodeURIComponent(relay)}&secret=${clientSecret}`;
    const client: NostrClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        fetchLatestReplaceableEvent: vi.fn().mockResolvedValue(infoEvent ?? createSignedInfoEvent({ secret: walletServiceSecret })),
        fetchEvents: vi.fn().mockResolvedValue([]),
    };
    const createClient = vi.fn<(relays?: string[]) => NostrClient>().mockReturnValue(client);
    return {
        walletServicePubkey,
        clientSecret,
        nwcUri,
        client,
        createClient,
    };
}

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete window.webln;
    toastErrorMock.mockClear();
    toastSuccessMock.mockClear();
});

afterEach(() => {
    for (const { root, container } of mountedRoots.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
    localStorage.clear();
    sessionStorage.clear();
});

describe('useWalletZapController', () => {
    test('loads wallet settings and activity scoped to the owner pubkey', async () => {
        const ownerPubkey = 'ABCDEF';
        const walletSettings: WalletSettingsState = {
            activeConnection: {
                method: 'webln',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
                restoreState: 'reconnect-required',
            },
        };
        const walletActivity: WalletActivityState = {
            items: [{
                id: 'activity-a',
                status: 'pending',
                actionType: 'zap-payment',
                amountMsats: 21000,
                createdAt: 123,
                targetType: 'event',
                targetId: 'event-a',
                provider: 'webln',
            }],
        };
        localStorage.setItem(
            buildScopedStorageKey(WALLET_SETTINGS_STORAGE_KEY, ownerPubkey),
            JSON.stringify(walletSettings),
        );
        localStorage.setItem(
            buildScopedStorageKey(WALLET_ACTIVITY_STORAGE_KEY, ownerPubkey),
            JSON.stringify(walletActivity),
        );
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        expect(latest?.walletSettings).toEqual(walletSettings);
        expect(latest?.walletActivity).toEqual(walletActivity);
    });

    test('clears the NWC URI input when the owner pubkey changes', async () => {
        let latest: WalletZapController | undefined;
        const { root } = await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey: 'owner-a' }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        await act(async () => {
            latest?.setWalletNwcUriInput('nostr+walletconnect://wallet-a');
        });
        expect(latest?.walletNwcUriInput).toBe('nostr+walletconnect://wallet-a');

        await act(async () => {
            root.render(
                <ControllerProbe
                    input={{ ownerPubkey: 'owner-b' }}
                    onController={(controller) => { latest = controller; }}
                />,
            );
        });
        await flushEffects();

        expect(latest?.walletNwcUriInput).toBe('');
    });

    test('connectWebLnWallet persists a connected WebLN wallet and clears the NWC URI input', async () => {
        const enable = vi.fn().mockResolvedValue(undefined);
        const sendPayment = vi.fn().mockResolvedValue({ preimage: 'preimage' });
        window.webln = { enable, sendPayment };
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey: 'owner-a' }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();
        await act(async () => {
            latest?.setWalletNwcUriInput('nostr+walletconnect://wallet-a');
        });

        await act(async () => {
            await latest?.connectWebLnWallet();
        });

        expect(enable).toHaveBeenCalledOnce();
        expect(latest?.walletSettings.activeConnection).toEqual({
            method: 'webln',
            capabilities: {
                payInvoice: true,
                makeInvoice: false,
                notifications: false,
            },
            restoreState: 'connected',
        });
        expect(latest?.walletNwcUriInput).toBe('');
    });

    test('connectWebLnWallet shows localized english connection toasts', async () => {
        window.webln = {
            enable: vi.fn().mockResolvedValue(undefined),
            sendPayment: vi.fn().mockResolvedValue({ preimage: 'preimage' }),
        };
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey: 'owner-a', language: 'en' }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        await act(async () => {
            await latest?.connectWebLnWallet();
        });

        expect(toastSuccessMock).toHaveBeenCalledWith('Wallet connected', { duration: 1800 });
    });

    test('connectWebLnWallet shows localized english unavailable errors', async () => {
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey: 'owner-a', language: 'en' }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        await act(async () => {
            await latest?.connectWebLnWallet();
        });

        expect(toastErrorMock).toHaveBeenCalledWith('WebLN is not available in this browser.', { duration: 2200 });
    });

    test('connectWebLnWallet does not show a stale failure toast after owner changes', async () => {
        let rejectEnable: (error: Error) => void = () => undefined;
        window.webln = {
            enable: vi.fn(() => new Promise<void>((_resolve, reject) => {
                rejectEnable = reject;
            })),
            sendPayment: vi.fn().mockResolvedValue({ preimage: 'preimage' }),
        };
        let latest: WalletZapController | undefined;
        const { root } = await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey: 'owner-a' }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();
        let connectPromise: Promise<boolean> | undefined;
        act(() => {
            connectPromise = latest?.connectWebLnWallet();
        });

        await act(async () => {
            root.render(
                <ControllerProbe
                    input={{ ownerPubkey: 'owner-b' }}
                    onController={(controller) => { latest = controller; }}
                />,
            );
        });
        await act(async () => {
            rejectEnable(new Error('permission denied'));
            await connectPromise;
        });

        expect(toastErrorMock).not.toHaveBeenCalled();
    });

    test('auto-restore remembered WebLN reconnect-required connection silently attempts WebLN reconnect', async () => {
        const ownerPubkey = 'owner-a';
        const enable = vi.fn().mockResolvedValue(undefined);
        window.webln = {
            enable,
            sendPayment: vi.fn().mockResolvedValue({ preimage: 'preimage' }),
        };
        localStorage.setItem(
            buildScopedStorageKey(WALLET_SETTINGS_STORAGE_KEY, ownerPubkey),
            JSON.stringify({
                activeConnection: {
                    method: 'webln',
                    capabilities: {
                        payInvoice: true,
                        makeInvoice: false,
                        notifications: false,
                    },
                    restoreState: 'reconnect-required',
                },
            }),
        );
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        expect(enable).toHaveBeenCalledOnce();
        expect(latest?.walletSettings.activeConnection).toEqual({
            method: 'webln',
            capabilities: {
                payInvoice: true,
                makeInvoice: false,
                notifications: false,
            },
            restoreState: 'connected',
        });
    });

    test('connectNwcWallet persists a validated NWC connection from an info event', async () => {
        const { walletServicePubkey, clientSecret, nwcUri, client, createClient } = createNwcFixture();
        const input = { ownerPubkey: 'owner-a', createClient };
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={input}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();
        await act(async () => {
            latest?.setWalletNwcUriInput(nwcUri);
        });

        await act(async () => {
            await latest?.connectNwcWallet();
        });

        expect(createClient).toHaveBeenCalledWith(['wss://relay.example']);
        expect(client.connect).toHaveBeenCalledOnce();
        expect(client.fetchLatestReplaceableEvent).toHaveBeenCalledWith(walletServicePubkey, 13194);
        expect(latest?.walletSettings.activeConnection).toEqual({
            method: 'nwc',
            uri: nwcUri,
            walletServicePubkey,
            relays: ['wss://relay.example'],
            secret: clientSecret,
            encryption: 'nip44_v2',
            capabilities: {
                payInvoice: true,
                makeInvoice: true,
                notifications: true,
            },
            restoreState: 'connected',
        });
        expect(latest?.walletNwcUriInput).toBe('');
    });

    test('connectNwcWallet does not show a stale failure toast after owner changes', async () => {
        const { nwcUri, client, createClient } = createNwcFixture();
        let rejectInfoFetch: (error: Error) => void = () => undefined;
        client.fetchLatestReplaceableEvent = vi.fn(() => new Promise<NostrEvent | null>((_resolve, reject) => {
            rejectInfoFetch = reject;
        }));
        let latest: WalletZapController | undefined;
        const { root } = await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey: 'owner-a', createClient }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();
        await act(async () => {
            latest?.setWalletNwcUriInput(nwcUri);
        });
        let connectPromise: Promise<void> | undefined;
        act(() => {
            connectPromise = latest?.connectNwcWallet();
        });

        await act(async () => {
            root.render(
                <ControllerProbe
                    input={{ ownerPubkey: 'owner-b', createClient }}
                    onController={(controller) => { latest = controller; }}
                />,
            );
        });
        await act(async () => {
            rejectInfoFetch(new Error('NWC info event was not found'));
            await connectPromise;
        });

        expect(toastErrorMock).not.toHaveBeenCalled();
    });

    test('handleZapIntent navigates to wallet when no payment-ready wallet is connected', async () => {
        const navigate = vi.fn();
        const sendPayment = vi.fn();
        window.webln = { sendPayment };
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{
                    ownerPubkey: 'owner-a',
                    location: { pathname: '/profile/alice', search: '?tab=zaps' },
                    navigate,
                }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        await act(async () => {
            await latest?.handleZapIntent({ targetPubkey: 'target-a', amount: 21 });
        });

        expect(navigate).toHaveBeenCalledWith('/wallet');
        expect(sendPayment).not.toHaveBeenCalled();
    });

    test('handleZapIntent pays a WebLN profile zap and records optimistic success', async () => {
        const targetPubkey = 'target-a';
        const sendPayment = vi.fn().mockResolvedValue({ preimage: 'preimage' });
        window.webln = {
            enable: vi.fn().mockResolvedValue(undefined),
            sendPayment,
        };
        const writeGateway = {
            publishEvent: vi.fn().mockResolvedValue({
                id: 'zap-request-a',
                pubkey: 'owner-a',
                kind: 9734,
                created_at: 1,
                tags: [],
                content: '',
            }),
        };
        const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                callback: 'https://ln.example/callback',
                allowsNostr: true,
                nostrPubkey: 'f'.repeat(64),
                minSendable: 1,
                maxSendable: 100_000,
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ pr: 'lnbc1invoice' }), { status: 200 }));
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock as typeof fetch;
        const onRecordOptimisticZap = vi.fn();
        let latest: WalletZapController | undefined;

        try {
            await renderProbe(
                <ControllerProbe
                    input={{
                        ownerPubkey: 'owner-a',
                        location: { pathname: '/profile/alice', search: '' },
                        navigate: vi.fn(),
                        language: 'es',
                        profiles: {
                            [targetPubkey]: { pubkey: targetPubkey, lud16: 'alice@ln.example' },
                        },
                        relaySettingsSnapshot: {
                            relays: ['wss://relay-write.example'],
                            byType: {
                                nip65Both: ['wss://relay-write.example'],
                                nip65Read: [],
                                nip65Write: ['wss://relay-write.example'],
                                dmInbox: [],
                                search: [],
                            },
                        },
                        writeGateway,
                        onRecordOptimisticZap,
                    }}
                    onController={(controller) => { latest = controller; }}
                />,
            );
            await flushEffects();
            await act(async () => {
                await latest?.connectWebLnWallet();
            });

            await act(async () => {
                await latest?.handleZapIntent({ targetPubkey, amount: 21 });
            });

            expect(sendPayment).toHaveBeenCalledWith('lnbc1invoice');
            expect(latest?.walletActivity.items).toEqual([
                expect.objectContaining({
                    status: 'succeeded',
                    actionType: 'zap-payment',
                    amountMsats: 21_000,
                    targetType: 'profile',
                    targetId: targetPubkey,
                    provider: 'webln',
                }),
            ]);
            expect(onRecordOptimisticZap).not.toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('handleZapIntent records localized english payment failure activity', async () => {
        const targetPubkey = 'target-a';
        const sendPayment = vi.fn().mockRejectedValue(new Error('payment rejected'));
        window.webln = {
            enable: vi.fn().mockResolvedValue(undefined),
            sendPayment,
        };
        const writeGateway = {
            publishEvent: vi.fn().mockResolvedValue({
                id: 'zap-request-a',
                pubkey: 'owner-a',
                kind: 9734,
                created_at: 1,
                tags: [],
                content: '',
            }),
        };
        const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                callback: 'https://ln.example/callback',
                allowsNostr: true,
                nostrPubkey: 'f'.repeat(64),
                minSendable: 1,
                maxSendable: 100_000,
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ pr: 'lnbc1invoice' }), { status: 200 }));
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock as typeof fetch;
        let latest: WalletZapController | undefined;

        try {
            await renderProbe(
                <ControllerProbe
                    input={{
                        ownerPubkey: 'owner-a',
                        location: { pathname: '/profile/alice', search: '' },
                        navigate: vi.fn(),
                        language: 'en',
                        profiles: {
                            [targetPubkey]: { pubkey: targetPubkey, lud16: 'alice@ln.example' },
                        },
                        relaySettingsSnapshot: {
                            relays: ['wss://relay-write.example'],
                            byType: {
                                nip65Both: ['wss://relay-write.example'],
                                nip65Read: [],
                                nip65Write: [],
                                dmInbox: [],
                                search: [],
                            },
                        },
                        writeGateway,
                    }}
                    onController={(controller) => { latest = controller; }}
                />,
            );
            await flushEffects();
            await act(async () => {
                await latest?.connectWebLnWallet();
            });
            toastSuccessMock.mockClear();

            await act(async () => {
                await latest?.handleZapIntent({ targetPubkey, amount: 21 });
            });

            expect(toastErrorMock).toHaveBeenCalledWith('Could not complete the payment.', { duration: 2200 });
            expect(latest?.walletActivity.items).toEqual([
                expect.objectContaining({
                    status: 'failed',
                    errorMessage: 'Could not complete the payment.',
                }),
            ]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('does not apply WebLN zap completion side effects after the owner scope changes while payment is pending', async () => {
        const ownerA = 'owner-a';
        const ownerB = 'owner-b';
        const targetPubkey = 'target-a';
        const payment = createDeferred<{ preimage: string }>();
        const sendPayment = vi.fn().mockReturnValue(payment.promise);
        window.webln = {
            enable: vi.fn().mockResolvedValue(undefined),
            sendPayment,
        };
        const writeGateway = {
            publishEvent: vi.fn().mockResolvedValue({
                id: 'zap-request-a',
                pubkey: ownerA,
                kind: 9734,
                created_at: 1,
                tags: [],
                content: '',
            }),
        };
        const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                callback: 'https://ln.example/callback',
                allowsNostr: true,
                nostrPubkey: 'f'.repeat(64),
                minSendable: 1,
                maxSendable: 100_000,
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ pr: 'lnbc1invoice' }), { status: 200 }));
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock as typeof fetch;
        const onRecordOptimisticZap = vi.fn();
        const navigate = vi.fn();
        let latest: WalletZapController | undefined;
        const baseInput: UseWalletZapControllerInput = {
            ownerPubkey: ownerA,
            location: { pathname: '/profile/alice', search: '' },
            navigate,
            language: 'es',
            profiles: {
                [targetPubkey]: { pubkey: targetPubkey, lud16: 'alice@ln.example' },
            },
            relaySettingsSnapshot: {
                relays: ['wss://relay-write.example'],
                byType: {
                    nip65Both: ['wss://relay-write.example'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                    search: [],
                },
            },
            writeGateway,
            onRecordOptimisticZap,
        };

        try {
            const { root } = await renderProbe(
                <ControllerProbe
                    input={baseInput}
                    onController={(controller) => { latest = controller; }}
                />,
            );
            await flushEffects();
            await act(async () => {
                await latest?.connectWebLnWallet();
            });
            toastSuccessMock.mockClear();

            let zapPromise: Promise<void> | undefined;
            await act(async () => {
                zapPromise = latest?.handleZapIntent({ targetPubkey, amount: 21, eventId: 'event-a', eventKind: 1 });
                await flushEffects();
            });
            expect(sendPayment).toHaveBeenCalledWith('lnbc1invoice');

            await act(async () => {
                root.render(
                    <ControllerProbe
                        input={{ ...baseInput, ownerPubkey: ownerB }}
                        onController={(controller) => { latest = controller; }}
                    />,
                );
            });

            await act(async () => {
                payment.resolve({ preimage: 'preimage' });
                await zapPromise;
            });
            await flushEffects();

            expect(loadWalletActivity({ ownerPubkey: ownerA }).items).toEqual([
                expect.objectContaining({
                    status: 'pending',
                    actionType: 'zap-payment',
                    targetId: 'event-a',
                }),
            ]);
            expect(loadWalletActivity({ ownerPubkey: ownerB }).items).toEqual([]);
            expect(onRecordOptimisticZap).not.toHaveBeenCalled();
            expect(toastSuccessMock).not.toHaveBeenCalled();
            expect(toastErrorMock).not.toHaveBeenCalled();
            expect(navigate).not.toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('auto-resumes a pending zap after the wallet route is ready', async () => {
        const targetPubkey = 'target-a';
        const navigate = vi.fn();
        const sendPayment = vi.fn().mockResolvedValue({ preimage: 'preimage' });
        window.webln = {
            enable: vi.fn().mockResolvedValue(undefined),
            sendPayment,
        };
        const writeGateway = {
            publishEvent: vi.fn().mockResolvedValue({
                id: 'zap-request-a',
                pubkey: 'owner-a',
                kind: 9734,
                created_at: 1,
                tags: [],
                content: '',
            }),
        };
        const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                callback: 'https://ln.example/callback',
                allowsNostr: true,
                nostrPubkey: 'f'.repeat(64),
                minSendable: 1,
                maxSendable: 100_000,
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ pr: 'lnbc1invoice' }), { status: 200 }));
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock as typeof fetch;
        let latest: WalletZapController | undefined;
        const baseInput: UseWalletZapControllerInput = {
            ownerPubkey: 'owner-a',
            location: { pathname: '/profile/alice', search: '?tab=zaps' },
            navigate,
            language: 'es',
            profiles: { [targetPubkey]: { pubkey: targetPubkey, lud16: 'alice@ln.example' } },
            relaySettingsSnapshot: {
                relays: ['wss://relay-write.example'],
                byType: {
                    nip65Both: ['wss://relay-write.example'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                    search: [],
                },
            },
            writeGateway,
        };

        try {
            const { root } = await renderProbe(
                <ControllerProbe
                    input={baseInput}
                    onController={(controller) => { latest = controller; }}
                />,
            );
            await flushEffects();
            await act(async () => {
                await latest?.handleZapIntent({ targetPubkey, amount: 21 });
            });
            await act(async () => {
                root.render(
                    <ControllerProbe
                        input={{ ...baseInput, location: { pathname: '/wallet', search: '' } }}
                        onController={(controller) => { latest = controller; }}
                    />,
                );
            });
            await act(async () => {
                await latest?.connectWebLnWallet();
            });
            await flushEffects();
            await flushEffects();

            expect(sendPayment).toHaveBeenCalledWith('lnbc1invoice');
            expect(navigate).toHaveBeenLastCalledWith('/profile/alice?tab=zaps', { replace: true });
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('does not auto-resume a pending zap after the owner scope changes', async () => {
        const targetPubkey = 'target-a';
        const navigate = vi.fn();
        const sendPayment = vi.fn().mockResolvedValue({ preimage: 'preimage' });
        window.webln = {
            enable: vi.fn().mockResolvedValue(undefined),
            sendPayment,
        };
        const writeGateway = {
            publishEvent: vi.fn().mockResolvedValue({
                id: 'zap-request-a',
                pubkey: 'owner-b',
                kind: 9734,
                created_at: 1,
                tags: [],
                content: '',
            }),
        };
        const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                callback: 'https://ln.example/callback',
                allowsNostr: true,
                nostrPubkey: 'f'.repeat(64),
                minSendable: 1,
                maxSendable: 100_000,
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ pr: 'lnbc1invoice' }), { status: 200 }));
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock as typeof fetch;
        let latest: WalletZapController | undefined;
        const ownerAInput: UseWalletZapControllerInput = {
            ownerPubkey: 'owner-a',
            location: { pathname: '/profile/alice', search: '' },
            navigate,
        };
        const ownerBInput: UseWalletZapControllerInput = {
            ownerPubkey: 'owner-b',
            location: { pathname: '/wallet', search: '' },
            navigate,
            language: 'es',
            profiles: { [targetPubkey]: { pubkey: targetPubkey, lud16: 'alice@ln.example' } },
            relaySettingsSnapshot: {
                relays: ['wss://relay-write.example'],
                byType: {
                    nip65Both: ['wss://relay-write.example'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                    search: [],
                },
            },
            writeGateway,
        };

        try {
            const { root } = await renderProbe(
                <ControllerProbe
                    input={ownerAInput}
                    onController={(controller) => { latest = controller; }}
                />,
            );
            await flushEffects();
            await act(async () => {
                await latest?.handleZapIntent({ targetPubkey, amount: 21 });
            });
            await act(async () => {
                root.render(
                    <ControllerProbe
                        input={ownerBInput}
                        onController={(controller) => { latest = controller; }}
                    />,
                );
            });
            await flushEffects();

            await act(async () => {
                await latest?.connectWebLnWallet();
            });
            await flushEffects();
            await flushEffects();

            expect(sendPayment).not.toHaveBeenCalled();
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('clears a ready pending zap when the user leaves wallet before retrying', async () => {
        const targetPubkey = 'target-a';
        const navigate = vi.fn();
        const sendPayment = vi.fn();
        window.webln = { sendPayment };
        let latest: WalletZapController | undefined;
        const baseInput: UseWalletZapControllerInput = {
            ownerPubkey: 'owner-a',
            location: { pathname: '/profile/alice', search: '' },
            navigate,
        };
        const { root } = await renderProbe(
            <ControllerProbe
                input={baseInput}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();
        await act(async () => {
            await latest?.handleZapIntent({ targetPubkey, amount: 21 });
        });
        await act(async () => {
            root.render(
                <ControllerProbe
                    input={{ ...baseInput, location: { pathname: '/wallet', search: '' } }}
                    onController={(controller) => { latest = controller; }}
                />,
            );
        });
        await flushEffects();
        await act(async () => {
            root.render(
                <ControllerProbe
                    input={{ ...baseInput, location: { pathname: '/discover', search: '' } }}
                    onController={(controller) => { latest = controller; }}
                />,
            );
        });
        await flushEffects();

        await act(async () => {
            await latest?.connectWebLnWallet();
        });
        await flushEffects();

        expect(sendPayment).not.toHaveBeenCalled();
    });

    test('connectNwcWallet makes no connection when info event kind is not 13194', async () => {
        const { nwcUri, createClient } = createNwcFixture(createSignedInfoEvent({
            secret: '1'.repeat(64),
            kind: 1,
        }));
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey: 'owner-a', createClient }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();
        await act(async () => {
            latest?.setWalletNwcUriInput(nwcUri);
        });

        await act(async () => {
            await latest?.connectNwcWallet();
        });

        expect(latest?.walletSettings.activeConnection).toBeNull();
    });

    test('connectNwcWallet makes no connection when info event pubkey is not the wallet service pubkey', async () => {
        const { nwcUri, createClient } = createNwcFixture(createSignedInfoEvent({
            secret: '3'.repeat(64),
        }));
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey: 'owner-a', createClient }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();
        await act(async () => {
            latest?.setWalletNwcUriInput(nwcUri);
        });

        await act(async () => {
            await latest?.connectNwcWallet();
        });

        expect(latest?.walletSettings.activeConnection).toBeNull();
    });

    test('connectNwcWallet storage redacts uri and secret without writing sessionStorage secrets', async () => {
        const ownerPubkey = 'owner-a';
        const { nwcUri, clientSecret, createClient } = createNwcFixture();
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey, createClient }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();
        await act(async () => {
            latest?.setWalletNwcUriInput(nwcUri);
        });

        await act(async () => {
            await latest?.connectNwcWallet();
        });

        const localPayload = JSON.parse(localStorage.getItem(buildScopedStorageKey(WALLET_SETTINGS_STORAGE_KEY, ownerPubkey)) ?? '{}') as WalletSettingsState;
        expect(latest?.walletSettings.activeConnection).toMatchObject({
            method: 'nwc',
            uri: nwcUri,
            secret: clientSecret,
            restoreState: 'connected',
        });
        expect(localPayload.activeConnection).toMatchObject({
            method: 'nwc',
            uri: '',
            secret: '',
            restoreState: 'reconnect-required',
        });
        expect(sessionStorage.getItem(buildScopedStorageKey(WALLET_SESSION_CONNECTION_STORAGE_KEY, ownerPubkey))).toBeNull();
    });

    test('disconnectWallet clears the active wallet and NWC input', async () => {
        const ownerPubkey = 'owner-a';
        const { nwcUri, createClient } = createNwcFixture();
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey, createClient }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();
        await act(async () => {
            latest?.setWalletNwcUriInput(nwcUri);
        });
        await act(async () => {
            await latest?.connectNwcWallet();
        });
        expect(sessionStorage.getItem(buildScopedStorageKey(WALLET_SESSION_CONNECTION_STORAGE_KEY, ownerPubkey))).toBeNull();

        act(() => {
            latest?.disconnectWallet();
        });

        expect(latest?.walletSettings.activeConnection).toBeNull();
        expect(latest?.walletNwcUriInput).toBe('');
        expect(sessionStorage.getItem(buildScopedStorageKey(WALLET_SESSION_CONNECTION_STORAGE_KEY, ownerPubkey))).toBeNull();
    });

    test('refreshWallet marks WebLN reconnect-required when silent revalidation fails', async () => {
        window.webln = {
            enable: vi.fn().mockResolvedValue(undefined),
            sendPayment: vi.fn().mockResolvedValue({ preimage: 'preimage' }),
        };
        let latest: WalletZapController | undefined;

        await renderProbe(
            <ControllerProbe
                input={{ ownerPubkey: 'owner-a' }}
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();
        await act(async () => {
            await latest?.connectWebLnWallet();
        });
        window.webln = {
            enable: vi.fn().mockRejectedValue(new Error('permission denied')),
            sendPayment: vi.fn().mockResolvedValue({ preimage: 'preimage' }),
        };

        await act(async () => {
            await latest?.refreshWallet();
        });

        expect(latest?.walletSettings.activeConnection).toEqual({
            method: 'webln',
            capabilities: {
                payInvoice: true,
                makeInvoice: false,
                notifications: false,
            },
            restoreState: 'reconnect-required',
        });
    });
});
