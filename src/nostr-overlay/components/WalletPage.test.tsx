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
    test('renders disconnected wallet as the connect form without empty state copy', async () => {
        const rendered = await renderElement(
            <WalletPage
                walletState={{ activeConnection: null }}
                walletActivity={{ items: [] }}
                nwcUriInput=""
                zapSettings={{
                    zapSettings: { amounts: [21, 128, 256] },
                    newZapAmountInput: '512',
                    onNewZapAmountInputChange: vi.fn(),
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

        expect(rendered.container.querySelector('[data-slot="overlay-page-header-title"]')?.textContent).toBe('Wallet');
        expect(rendered.container.textContent || '').not.toContain('Sin wallet conectada');
        expect(rendered.container.textContent || '').not.toContain('Conecta una wallet para habilitar pagos y zaps.');
        expect(rendered.container.querySelector('[data-slot="empty"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="wallet-active-section"] [data-slot="card-title"]')?.textContent).toBe('Conectar wallet');
        expect(rendered.container.querySelector('[data-testid="wallet-active-section"] [data-slot="card-description"]')).toBeNull();
        expect(rendered.container.querySelector('input[aria-label="URI NWC"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Conectar con NWC');
        expect(rendered.container.textContent || '').toContain('Conectar con WebLN');
        expect(rendered.container.textContent || '').not.toContain('Balance');
        expect(rendered.container.textContent || '').not.toContain('Recibir');
        expect(rendered.container.textContent || '').not.toContain('Zaps');
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

        const cardHeader = rendered.container.querySelector('[data-testid="wallet-active-section"] [data-slot="card-header"]') as HTMLElement | null;
        const cardContent = rendered.container.querySelector('[data-testid="wallet-active-section"] [data-slot="card-content"]') as HTMLElement | null;

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
                    zapSettings: { amounts: [21, 128, 256] },
                    newZapAmountInput: '512',
                    onNewZapAmountInputChange: vi.fn(),
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
        expect(rendered.container.querySelector('[data-slot="overlay-page-header-title"]')?.textContent).toBe('Wallet');
        expect(rendered.container.textContent || '').toContain('Refrescar');
        expect(rendered.container.textContent || '').toContain('Desconectar');
        expect(rendered.container.textContent || '').not.toContain('Conectar wallet');
        expect(rendered.container.querySelector('input[aria-label="URI NWC"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="overlay-page-header"] [data-slot="badge"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="wallet-active-section"] [data-slot="card-action"] [data-slot="badge"]')?.getAttribute('data-variant')).toBe('default');
        expect(rendered.container.querySelector('[data-testid="wallet-active-section"] [data-slot="card-title"]')?.textContent).toBe('Wallet activa');
        expect(rendered.container.querySelectorAll('[data-testid="wallet-active-section"] > [data-slot="separator"]')).toHaveLength(1);
        expect(rendered.container.querySelectorAll('[data-testid="wallet-activity-section"] > [data-slot="separator"]')).toHaveLength(1);
        expect(rendered.container.textContent || '').toContain('21 sats');
        expect(rendered.container.textContent || '').toContain('Zaps');
        expect(rendered.container.textContent || '').not.toContain('Configurar zaps');
        expect(rendered.container.textContent || '').not.toContain('Por defecto');
        expect(rendered.container.querySelector('button[data-state="on"]')).toBeNull();
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

        expect(rendered.container.querySelector('[data-slot="overlay-page-header-title"]')?.textContent).toBe('Wallet');
        expect(rendered.container.textContent || '').toContain('Conectar con WebLN');
        expect(rendered.container.textContent || '').not.toContain('Reconecta WebLN');
        expect(rendered.container.textContent || '').not.toContain('Sin wallet conectada');
        expect(rendered.container.textContent || '').not.toContain('Zaps');
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
        expect(rendered.container.querySelector('[data-slot="overlay-page-header-title"]')?.textContent).toBe('Wallet');
        expect(rendered.container.querySelector('[data-testid="wallet-active-section"] [data-slot="card-title"]')?.textContent).toBe('Connect wallet');
        expect(text).toContain('Manage the active wallet used for payments and zaps.');
        expect(text).not.toContain('No wallet connected');
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
