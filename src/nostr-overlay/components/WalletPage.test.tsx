import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { WalletPage } from './WalletPage';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    window.localStorage.clear();
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('WalletPage', () => {
    test('renders disconnected empty states with connect actions', async () => {
        const rendered = await renderElement(
            <WalletPage
                walletState={{ activeConnection: null }}
                walletActivity={{ items: [] }}
                nwcUriInput=""
                zapSettings={{
                    zapSettings: { amounts: [21, 128, 256], defaultAmount: 128 },
                    newZapAmountInput: '512',
                    defaultZapAmountInput: '128',
                    onNewZapAmountInputChange: vi.fn(),
                    onDefaultZapAmountInputChange: vi.fn(),
                    onUpdateZapAmount: vi.fn(),
                    onRemoveZapAmount: vi.fn(),
                    onAddZapAmount: vi.fn(),
                }}
                onNwcUriInputChange={vi.fn()}
                onConnectNwc={vi.fn()}
                onConnectWebLn={vi.fn()}
                onDisconnect={vi.fn()}
                onRefresh={vi.fn()}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Wallet');
        expect(rendered.container.textContent || '').toContain('Sin wallet conectada');
        expect(rendered.container.querySelector('input[aria-label="URI NWC"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Conectar con NWC');
        expect(rendered.container.textContent || '').toContain('Conectar con WebLN');
        expect(rendered.container.textContent || '').not.toContain('Balance');
        expect(rendered.container.textContent || '').not.toContain('Recibir');
        expect(rendered.container.textContent || '').not.toContain('Configurar zaps');
    });

    test('aligns card headers with card content padding', async () => {
        const rendered = await renderElement(
            <WalletPage
                walletState={{ activeConnection: null }}
                walletActivity={{ items: [] }}
                nwcUriInput=""
                onNwcUriInputChange={vi.fn()}
                onConnectNwc={vi.fn()}
                onConnectWebLn={vi.fn()}
                onDisconnect={vi.fn()}
                onRefresh={vi.fn()}
            />
        );
        mounted.push(rendered);

        const cardHeader = rendered.container.querySelector('[data-slot="card-header"]') as HTMLElement | null;
        const cardContent = rendered.container.querySelector('[data-slot="card-content"]') as HTMLElement | null;

        expect(cardHeader?.className).toContain('px-4');
        expect(cardContent?.className).toContain('px-4');
    });

    test('renders connected wallet details and activity', async () => {
        const rendered = await renderElement(
            <WalletPage
                walletState={{
                    activeConnection: {
                        method: 'webln',
                        capabilities: {
                            payInvoice: true,
                            makeInvoice: false,
                            notifications: false,
                        },
                        restoreState: 'connected',
                    },
                }}
                walletActivity={{
                    items: [{
                        id: 'zap-1',
                        status: 'succeeded',
                        actionType: 'zap-payment',
                        amountMsats: 21_000,
                        createdAt: 100,
                        targetType: 'profile',
                        targetId: 'f'.repeat(64),
                        provider: 'nwc',
                    }],
                }}
                nwcUriInput="nostr+walletconnect://demo"
                zapSettings={{
                    zapSettings: { amounts: [21, 128, 256], defaultAmount: 128 },
                    newZapAmountInput: '512',
                    defaultZapAmountInput: '128',
                    onNewZapAmountInputChange: vi.fn(),
                    onDefaultZapAmountInputChange: vi.fn(),
                    onUpdateZapAmount: vi.fn(),
                    onRemoveZapAmount: vi.fn(),
                    onAddZapAmount: vi.fn(),
                }}
                onNwcUriInputChange={vi.fn()}
                onConnectNwc={vi.fn()}
                onConnectWebLn={vi.fn()}
                onDisconnect={vi.fn()}
                onRefresh={vi.fn()}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Conectada por WebLN');
        expect(rendered.container.textContent || '').toContain('Refrescar');
        expect(rendered.container.textContent || '').toContain('Desconectar');
        expect(rendered.container.textContent || '').not.toContain('Conectar wallet');
        expect(rendered.container.querySelector('input[aria-label="URI NWC"]')).toBeNull();
        expect(rendered.container.textContent || '').toContain('21 sats');
        expect(rendered.container.textContent || '').toContain('Configurar zaps');
        expect(rendered.container.querySelector('input[aria-label="Cantidad por defecto de zap"]')).not.toBeNull();
    });

    test('renders remembered wallet without falling back to disconnected empty state', async () => {
        const rendered = await renderElement(
            <WalletPage
                walletState={{
                    activeConnection: {
                        method: 'webln',
                        capabilities: {
                            payInvoice: true,
                            makeInvoice: false,
                            notifications: false,
                        },
                        restoreState: 'reconnect-required',
                    },
                }}
                walletActivity={{ items: [] }}
                nwcUriInput=""
                onNwcUriInputChange={vi.fn()}
                onConnectNwc={vi.fn()}
                onConnectWebLn={vi.fn()}
                onDisconnect={vi.fn()}
                onRefresh={vi.fn()}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Reconecta WebLN');
        expect(rendered.container.textContent || '').not.toContain('Sin wallet conectada');
        expect(rendered.container.textContent || '').not.toContain('Configurar zaps');
    });

    test('renders english wallet copy when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <WalletPage
                walletState={{ activeConnection: null }}
                walletActivity={{ items: [] }}
                nwcUriInput=""
                onNwcUriInputChange={vi.fn()}
                onConnectNwc={vi.fn()}
                onConnectWebLn={vi.fn()}
                onDisconnect={vi.fn()}
                onRefresh={vi.fn()}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Manage the active wallet used for payments and zaps.');
        expect(text).toContain('No wallet connected');
        expect(text).toContain('Connect with NWC');
        expect(text).toContain('Connect with WebLN');
    });

    test('renders english refresh action when connected and ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <WalletPage
                walletState={{
                    activeConnection: {
                        method: 'webln',
                        capabilities: {
                            payInvoice: true,
                            makeInvoice: false,
                            notifications: false,
                        },
                        restoreState: 'connected',
                    },
                }}
                walletActivity={{ items: [] }}
                nwcUriInput=""
                onNwcUriInputChange={vi.fn()}
                onConnectNwc={vi.fn()}
                onConnectWebLn={vi.fn()}
                onDisconnect={vi.fn()}
                onRefresh={vi.fn()}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Refresh');
    });
});
