import { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { LoginGateScreen } from './LoginGateScreen';
import type { AuthSessionState } from '../../nostr/auth/session';

const overlayStyles = readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderScreen(options: {
    disabled?: boolean;
    authSession?: AuthSessionState;
    savedLocalAccount?: { pubkey: string; mode: 'device' | 'passphrase' };
    mapLoaderText?: string;
    overlayTheme?: 'light' | 'dark';
    restoringSession?: boolean;
    publicDemoMode?: boolean;
} = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            <LoginGateScreen
                {...(options.authSession === undefined ? {} : { authSession: options.authSession })}
                {...(options.savedLocalAccount === undefined ? {} : { savedLocalAccount: options.savedLocalAccount })}
                disabled={options.disabled ?? false}
                {...(options.mapLoaderText === undefined ? {} : { mapLoaderText: options.mapLoaderText })}
                overlayTheme={options.overlayTheme ?? 'light'}
                restoringSession={options.restoringSession ?? false}
                publicDemoMode={options.publicDemoMode ?? false}
                onStartSession={vi.fn()}
            />
        );
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
    }

    const htmlElementPrototype = HTMLElement.prototype as HTMLElement & {
        hasPointerCapture?: (pointerId: number) => boolean;
        setPointerCapture?: (pointerId: number) => void;
        releasePointerCapture?: (pointerId: number) => void;
    };

    if (!htmlElementPrototype.hasPointerCapture) {
        htmlElementPrototype.hasPointerCapture = () => false;
    }

    if (!htmlElementPrototype.setPointerCapture) {
        htmlElementPrototype.setPointerCapture = () => {};
    }

    if (!htmlElementPrototype.releasePointerCapture) {
        htmlElementPrototype.releasePointerCapture = () => {};
    }
});

afterEach(async () => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('LoginGateScreen', () => {
    test('uses the elevated shared card surface without the legacy content padding hook', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const shellCard = rendered.container.querySelector('.nostr-login-screen-card');
        const shellContent = rendered.container.querySelector('[data-slot="card-content"]');

        expect(shellCard?.getAttribute('data-variant')).toBe('elevated');
        expect(shellCard?.className).toContain('w-full');
        expect(shellCard?.className).toContain('max-w-[448px]');
        expect(shellCard?.className).toContain('py-0');
        expect(shellCard?.className).toContain('gap-0');
        expect(shellContent?.classList.contains('nostr-login-screen-content')).toBe(false);
    });

    test('keeps the main login view without a footer back action', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const footer = rendered.container.querySelector('[data-testid="auth-flow-footer"]');
        expect(footer).toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Volver al login');
    });

    test('shows a visible create account entry point', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).toContain('Crear cuenta');
    });

    test('does not show a desktop-only notice on the main login view', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="login-desktop-notice"]')).toBeNull();
    });

    test('renders the light logo in the default theme', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const logo = rendered.container.querySelector('img.nostr-login-cover') as HTMLImageElement | null;
        expect(logo?.getAttribute('src')).toBe('/logo-v2-light.png');
    });

    test('keeps the logo from reserving a full-width rectangular box', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const content = rendered.container.querySelector('[data-slot="card-content"]');
        const logo = rendered.container.querySelector('img.nostr-login-cover') as HTMLImageElement | null;

        expect(content?.className).toContain('gap-4');
        expect(rendered.container.querySelector('.nostr-login-cover-wrap')).toBeNull();
        expect(logo?.parentElement).toBe(content);
        expect(logo?.className).toContain('h-auto');
        expect(logo?.className).toContain('max-w-full');
        expect(overlayStyles).toMatch(/\.nostr-login-cover\s*\{[^}]*width:\s*min\(100%,\s*400px\);[^}]*max-height:\s*min\(28vh,\s*160px\)/s);
    });

    test('renders the dark logo when the overlay theme is dark', async () => {
        const rendered = await renderScreen({ overlayTheme: 'dark' });
        mounted.push(rendered);

        const logo = rendered.container.querySelector('img.nostr-login-cover') as HTMLImageElement | null;
        expect(logo?.getAttribute('src')).toBe('/logo-v2-dark.png');
    });

    test('renders english logo alt text when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderScreen();
        mounted.push(rendered);

        const cover = rendered.container.querySelector('img.nostr-login-cover') as HTMLImageElement | null;
        expect(cover?.getAttribute('alt')).toBe('Nostr City logo');
    });

    test('renders spanish logo alt text by default', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const cover = rendered.container.querySelector('img.nostr-login-cover') as HTMLImageElement | null;
        expect(cover?.getAttribute('alt')).toBe('Logotipo de Nostr City');
    });

    test('groups login selector and create account entry point in the main login container', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const selectorSection = rendered.container.querySelector('section[aria-label="Selector de acceso de Nostr"]');
        const actionGroup = rendered.container.querySelector('[data-testid="login-gate-actions"]');

        expect(selectorSection).not.toBeNull();
        expect(actionGroup).not.toBeNull();
        expect(selectorSection?.parentElement).toBe(actionGroup);
    });

    test('keeps signed login methods available on the production login gate', async () => {
        vi.stubEnv('PROD', true);

        const rendered = await renderScreen();
        mounted.push(rendered);

        const methodSelectTrigger = rendered.container.querySelector('[data-testid="login-method-trigger"]') as HTMLButtonElement;
        expect(methodSelectTrigger).toBeDefined();
        expect(methodSelectTrigger.disabled).toBe(false);

        await act(async () => {
            methodSelectTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            methodSelectTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const options = Array.from(document.body.querySelectorAll('[data-slot="select-item"]')).map((option) => (option.textContent || '').trim());
        expect(options).toContain('npub (solo lectura)');
        expect(options).toContain('Extensión (NIP-07)');
        expect(options).toContain('Búnker (NIP-46)');
    });

    test('shows public demo notice and npub-only login in public demo mode', async () => {
        const rendered = await renderScreen({ publicDemoMode: true });
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="public-demo-login-notice"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Demo pública de solo lectura');
        expect(rendered.container.textContent || '').toContain('npub (solo lectura)');
        expect(rendered.container.textContent || '').toContain('Ver repositorio en GitHub');
        expect(rendered.container.textContent || '').not.toContain('Crear cuenta');

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement | null;
        expect(npubInput?.value).toBe('npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m');

        const link = rendered.container.querySelector('[data-testid="public-demo-login-notice"] a') as HTMLAnchorElement | null;
        expect(link?.getAttribute('href')).toBe('https://github.com/devsigner-xyz/NostrCity');
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toBe('noreferrer');
    });

    test('keeps signer login methods hidden in public demo mode', async () => {
        const rendered = await renderScreen({ publicDemoMode: true });
        mounted.push(rendered);

        const methodSelectTrigger = rendered.container.querySelector('[data-testid="login-method-trigger"]') as HTMLButtonElement;
        expect(methodSelectTrigger).toBeDefined();
        expect(methodSelectTrigger.disabled).toBe(true);
        expect(methodSelectTrigger.textContent || '').toContain('npub (solo lectura)');
    });

    test('hides saved local account actions in public demo mode', async () => {
        const rendered = await renderScreen({
            publicDemoMode: true,
            savedLocalAccount: { pubkey: 'f'.repeat(64), mode: 'device' },
        });
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Continuar con cuenta local guardada');
        expect(rendered.container.textContent || '').not.toContain('Crear cuenta');
    });

    test('disables create account entry point when login gate is disabled', async () => {
        const rendered = await renderScreen({ disabled: true });
        mounted.push(rendered);

        const createAccountButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        ) as HTMLButtonElement | undefined;

        expect(createAccountButton).toBeDefined();
        expect(createAccountButton?.disabled).toBe(true);
    });

    test('moves the create-account-selector back action into the shell footer without a nested selector card', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const createAccountButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        ) as HTMLButtonElement | undefined;
        expect(createAccountButton).toBeDefined();

        await act(async () => {
            createAccountButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const footer = rendered.container.querySelector('[data-testid="auth-flow-footer"]');
        const footerButtons = Array.from(footer?.querySelectorAll('button') ?? []);

        expect(footer).not.toBeNull();
        expect(footerButtons).toHaveLength(1);
        expect(footerButtons[0]?.textContent || '').toContain('Volver');
        expect(rendered.container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    });

    test('returns from the create-account-selector footer to the main login view', async () => {
        const rendered = await renderScreen();
        mounted.push(rendered);

        const createAccountButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        ) as HTMLButtonElement | undefined;
        expect(createAccountButton).toBeDefined();

        await act(async () => {
            createAccountButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const backButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Volver')
        ) as HTMLButtonElement | undefined;
        expect(backButton).toBeDefined();

        await act(async () => {
            backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        expect(rendered.container.querySelector('[data-testid="auth-flow-footer"]')).toBeNull();
        expect(rendered.container.textContent || '').toContain('Método de acceso');
    });

    test('shows unlock form for locked local sessions and submits passphrase unlock', async () => {
        const lockedSession: AuthSessionState = {
            method: 'local',
            pubkey: 'f'.repeat(64),
            readonly: false,
            locked: true,
            createdAt: 1,
            capabilities: {
                canSign: true,
                canEncrypt: true,
                encryptionSchemes: ['nip44'],
            },
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const onStartSession = vi.fn().mockResolvedValue(undefined);

        await act(async () => {
            root.render(
                <LoginGateScreen
                    authSession={lockedSession}
                    overlayTheme="light"
                    onStartSession={onStartSession}
                />
            );
        });

        mounted.push({ container, root });

        const passphraseInput = container.querySelector('input[name="unlock-passphrase"]') as HTMLInputElement;
        expect(passphraseInput).toBeDefined();
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(passphraseInput, 'local-passphrase');
            passphraseInput.dispatchEvent(new Event('input', { bubbles: true }));
            passphraseInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const form = container.querySelector('form[data-testid="unlock-local-account-form"]');
        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(onStartSession).toHaveBeenCalledWith('local', {
            pubkey: lockedSession.pubkey,
            passphrase: 'local-passphrase',
        });
    });

    test('shows quick continue action for saved device-protected local accounts', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const onStartSession = vi.fn().mockResolvedValue(undefined);

        await act(async () => {
            root.render(
                <LoginGateScreen
                    savedLocalAccount={{ pubkey: 'f'.repeat(64), mode: 'device' }}
                    overlayTheme="light"
                    onStartSession={onStartSession}
                />
            );
        });

        mounted.push({ container, root });

        const continueButton = Array.from(container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Continuar con cuenta local guardada')
        ) as HTMLButtonElement | undefined;
        expect(continueButton).toBeDefined();

        await act(async () => {
            continueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onStartSession).toHaveBeenCalledWith('local', {
            pubkey: 'f'.repeat(64),
        });
    });

    test('keeps saved local account layout outside the normal main login grouping', async () => {
        const rendered = await renderScreen({
            savedLocalAccount: { pubkey: 'f'.repeat(64), mode: 'device' },
        });
        mounted.push(rendered);

        const createAccountButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        );

        expect(createAccountButton?.closest('[data-testid="login-gate-actions"]')).toBeNull();
    });

    test('shows passphrase re-entry form for saved passphrase-protected local accounts', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const onStartSession = vi.fn().mockResolvedValue(undefined);

        await act(async () => {
            root.render(
                <LoginGateScreen
                    savedLocalAccount={{ pubkey: 'f'.repeat(64), mode: 'passphrase' }}
                    overlayTheme="light"
                    onStartSession={onStartSession}
                />
            );
        });

        mounted.push({ container, root });

        const passphraseInput = container.querySelector('input[name="saved-local-passphrase"]') as HTMLInputElement;
        expect(passphraseInput).toBeDefined();
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(passphraseInput, 'local-passphrase');
            passphraseInput.dispatchEvent(new Event('input', { bubbles: true }));
            passphraseInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const form = passphraseInput.closest('form');
        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(onStartSession).toHaveBeenCalledWith('local', {
            pubkey: 'f'.repeat(64),
            passphrase: 'local-passphrase',
        });
    });

    test('does not render a logout action inside the login gate', async () => {
        const activeSession: AuthSessionState = {
            method: 'npub',
            pubkey: 'f'.repeat(64),
            readonly: true,
            locked: false,
            createdAt: 1,
            capabilities: {
                canSign: false,
                canEncrypt: false,
                encryptionSchemes: [],
            },
        };
        const rendered = await renderScreen({ authSession: activeSession });
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Cerrar sesion');
    });

    test('does not render map loader text above the login form', async () => {
        const rendered = await renderScreen({ mapLoaderText: 'Construyendo mapa...' });
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Construyendo mapa...');
    });

    test('shows only the restoration state while restoring a session', async () => {
        const rendered = await renderScreen({ restoringSession: true });
        mounted.push(rendered);

        const empty = rendered.container.querySelector('[data-slot="empty"]') as HTMLElement | null;
        const content = rendered.container.textContent || '';
        expect(empty).not.toBeNull();
        expect(empty?.className).toContain('min-h-36');
        expect(empty?.className).not.toContain('min-h-48');
        expect(content).toContain('Recuperando sesión');
        expect(content).toContain('Preparando acceso...');
        expect(content).not.toContain('Restaurando sesion');
        expect(content).not.toContain('Método de acceso');
        expect(rendered.container.querySelector('input[name="npub"]')).toBeNull();
        expect(rendered.container.querySelector('[data-slot="empty-icon"] [aria-label="Loading"]')).not.toBeNull();
    });

    test('shows devsigner attribution link while restoring a session', async () => {
        const rendered = await renderScreen({ restoringSession: true });
        mounted.push(rendered);

        const link = rendered.container.querySelector('[data-testid="devsigner-attribution-link"]') as HTMLAnchorElement | null;
        const avatar = link?.querySelector('img') as HTMLImageElement | null;

        expect(link).not.toBeNull();
        expect(link?.textContent || '').toContain('Hecho con ❤️ por devsigner');
        expect(link?.getAttribute('href')).toBe('https://github.com/devsigner-xyz');
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toBe('noreferrer');
        expect(avatar?.getAttribute('src')).toBe('/devsigner.png');
        expect(avatar?.getAttribute('alt')).toBe('');
    });

    test('shows dynamic restoration subtitle from map loader text', async () => {
        const rendered = await renderScreen({ restoringSession: true, mapLoaderText: 'Construyendo mapa...' });
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).toContain('Recuperando sesión');
        expect(content).toContain('Construyendo mapa...');
        expect(content).not.toContain('Preparando acceso...');
    });
});
