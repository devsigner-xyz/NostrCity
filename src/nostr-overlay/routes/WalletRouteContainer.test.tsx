import type { ComponentProps } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { WalletActivityState, WalletSettingsState } from '../../nostr/wallet-types';
import { WalletPage } from '../components/WalletPage';
import { WalletRouteContainer, type WalletRouteContainerProps } from './WalletRouteContainer';

vi.mock('../components/WalletPage', () => ({
    WalletPage: vi.fn(() => null),
}));

type WalletPageProps = ComponentProps<typeof WalletPage>;

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const mountedRoots: RenderResult[] = [];

const walletSettings: WalletSettingsState = {
    activeConnection: {
        method: 'nwc',
        uri: 'nostr+walletconnect://wallet.example',
        walletServicePubkey: 'wallet-service-pubkey',
        relays: ['wss://relay.example'],
        secret: 'secret',
        encryption: 'nip44_v2',
        capabilities: {
            payInvoice: true,
            makeInvoice: false,
            notifications: true,
        },
        restoreState: 'connected',
    },
};

const walletActivity: WalletActivityState = {
    items: [
        {
            id: 'activity-1',
            status: 'succeeded',
            actionType: 'zap-payment',
            amountMsats: 21_000,
            createdAt: 123,
            targetType: 'profile',
            targetId: 'f'.repeat(64),
            provider: 'nwc',
        },
    ],
};

function buildProps(overrides: Partial<WalletRouteContainerProps> = {}): WalletRouteContainerProps {
    return {
        canWrite: true,
        ownerPubkey: 'f'.repeat(64),
        walletSettings,
        walletActivity,
        walletNwcUriInput: 'nostr+walletconnect://input.example',
        setWalletNwcUriInput: vi.fn(),
        connectNwcWallet: vi.fn(async () => undefined),
        connectWebLnWallet: vi.fn(async () => true),
        disconnectWallet: vi.fn(),
        refreshWallet: vi.fn(async () => undefined),
        zapSettings: { amounts: [21, 128, 256] },
        onZapSettingsChange: vi.fn(),
        ...overrides,
    };
}

async function renderRoute(props: WalletRouteContainerProps): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<WalletRouteContainer {...props} />);
    });

    const result = { container, root };
    mountedRoots.push(result);
    return result;
}

function getLatestWalletPageProps(): WalletPageProps {
    const calls = vi.mocked(WalletPage).mock.calls;
    const latestCall = calls[calls.length - 1];

    if (!latestCall) {
        throw new Error('WalletPage was not rendered');
    }

    return latestCall[0];
}

beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

beforeEach(() => {
    vi.mocked(WalletPage).mockClear();
});

afterEach(() => {
    for (const { root, container } of mountedRoots.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
});

describe('WalletRouteContainer', () => {
    test('passes wallet state, activity, and NWC input through to WalletPage', async () => {
        const props = buildProps();

        await renderRoute(props);

        const walletPageProps = getLatestWalletPageProps();
        expect(walletPageProps.walletState).toBe(props.walletSettings);
        expect(walletPageProps.walletActivity).toBe(props.walletActivity);
        expect(walletPageProps.nwcUriInput).toBe(props.walletNwcUriInput);
    });

    test('wraps connect NWC, connect WebLN, and refresh handlers without returning promises to WalletPage', async () => {
        const connectNwcWallet = vi.fn<WalletRouteContainerProps['connectNwcWallet']>(async () => undefined);
        const connectWebLnWallet = vi.fn<WalletRouteContainerProps['connectWebLnWallet']>(async () => true);
        const refreshWallet = vi.fn<WalletRouteContainerProps['refreshWallet']>(async () => undefined);
        const props = buildProps({ connectNwcWallet, connectWebLnWallet, refreshWallet });

        await renderRoute(props);

        const walletPageProps = getLatestWalletPageProps();
        expect(walletPageProps.onConnectNwc()).toBeUndefined();
        expect(walletPageProps.onConnectWebLn()).toBeUndefined();
        expect(walletPageProps.onRefresh()).toBeUndefined();
        expect(connectNwcWallet).toHaveBeenCalledTimes(1);
        expect(connectWebLnWallet).toHaveBeenCalledTimes(1);
        expect(refreshWallet).toHaveBeenCalledTimes(1);
    });

    test('passes disconnect and NWC input change handlers through unchanged', async () => {
        const setWalletNwcUriInput = vi.fn<WalletRouteContainerProps['setWalletNwcUriInput']>();
        const disconnectWallet = vi.fn<WalletRouteContainerProps['disconnectWallet']>();
        const props = buildProps({ setWalletNwcUriInput, disconnectWallet });

        await renderRoute(props);

        const walletPageProps = getLatestWalletPageProps();
        expect(walletPageProps.onNwcUriInputChange).toBe(setWalletNwcUriInput);
        expect(walletPageProps.onDisconnect).toBe(disconnectWallet);
    });

    test('passes zap settings controls through when the wallet is connected', async () => {
        const onZapSettingsChange = vi.fn<WalletRouteContainerProps['onZapSettingsChange']>();
        const props = buildProps({ onZapSettingsChange });

        await renderRoute(props);

        const walletPageProps = getLatestWalletPageProps();
        expect(walletPageProps.zapSettings?.zapSettings).toEqual(props.zapSettings);

        await act(async () => {
            walletPageProps.zapSettings?.onRemoveZapAmount(1);
        });

        expect(onZapSettingsChange).toHaveBeenCalledWith({ amounts: [21, 256] });
    });

    test('hides zap settings controls when the wallet is not connected', async () => {
        const props = buildProps({ walletSettings: { activeConnection: null } });

        await renderRoute(props);

        expect(getLatestWalletPageProps().zapSettings).toBeUndefined();
    });
});
