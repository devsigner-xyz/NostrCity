import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { I18nProvider } from '@/i18n/I18nProvider';
import type { AppLocale } from '@/i18n/types';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import type { LoginMethod } from '../../nostr/auth/session';
import { LoginMethodSelector } from './LoginMethodSelector';

type StartSessionHandler = (method: LoginMethod, input: ProviderResolveInput) => Promise<void> | void;

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface RenderSelectorInput {
    disabled?: boolean;
    initialMethod?: 'npub' | 'nip07' | 'nip46';
    locale?: AppLocale;
    loadingText?: string;
    onStartSession?: StartSessionHandler;
    restrictToNpubOnly?: boolean;
}

async function renderSelector(input: RenderSelectorInput = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onStartSession = input.onStartSession ?? vi.fn<StartSessionHandler>().mockResolvedValue(undefined);
    const selectorProps = {
        disabled: input.disabled ?? false,
        onStartSession,
        ...(input.loadingText === undefined ? {} : { loadingText: input.loadingText }),
        ...(input.initialMethod === undefined ? {} : { initialMethod: input.initialMethod }),
        ...(input.restrictToNpubOnly === undefined ? {} : { restrictToNpubOnly: input.restrictToNpubOnly }),
    };

    await act(async () => {
        root.render(
            <I18nProvider initialLocale={input.locale ?? 'es'}>
                <LoginMethodSelector {...selectorProps} />
            </I18nProvider>
        );
    });

    (container as any).__handlers = {
        onStartSession,
    };

    return { container, root };
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes(text));
    if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Button with text "${text}" was not found`);
    }

    return button;
}

function fillInput(input: HTMLInputElement, value: string): void {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
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
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('LoginMethodSelector', () => {
    test('renders shadcn select and npub input by default', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        const npubInput = rendered.container.querySelector('input[name="npub"]');
        const methodSelectTrigger = rendered.container.querySelector('[data-testid="login-method-trigger"]');

        expect(content).not.toContain('Accede o explora');
        expect(content).toContain('npub (solo lectura)');
        expect(content).toContain('Método de acceso');
        expect(content).toContain('Clave pública');
        expect(content).toContain('Acceder');
        expect(rendered.container.querySelector('[data-testid="login-method-selector"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="login-method-form-npub"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="login-method-submit-npub"]')).not.toBeNull();
        expect(methodSelectTrigger).not.toBeNull();
        expect(npubInput).not.toBeNull();
        expect(methodSelectTrigger?.classList.contains('w-full')).toBe(true);
    });

    test('exposes npub, nip07, and nip46 by default in production', async () => {
        vi.stubEnv('PROD', true);

        const rendered = await renderSelector();
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

    test('renders stable test ids for the default login flow', async () => {
        const rendered = await renderSelector({ initialMethod: 'npub' });
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="login-method-selector"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="login-method-form-npub"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="login-method-submit-npub"]')).not.toBeNull();
    });

    test('temporarily exposes only npub in the disabled login method select', async () => {
        const rendered = await renderSelector({ restrictToNpubOnly: true });
        mounted.push(rendered);

        const methodSelectTrigger = rendered.container.querySelector('[data-testid="login-method-trigger"]') as HTMLButtonElement;
        expect(methodSelectTrigger).toBeDefined();
        expect(methodSelectTrigger.disabled).toBe(true);

        await act(async () => {
            methodSelectTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            methodSelectTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const options = Array.from(document.body.querySelectorAll('[data-slot="select-item"]'));
        expect(options.some((option) => (option.textContent || '').trim() === 'nsec')).toBe(false);
        expect(options.some((option) => (option.textContent || '').trim() === 'Extensión (NIP-07)')).toBe(false);
        expect(options.some((option) => (option.textContent || '').trim() === 'Búnker (NIP-46)')).toBe(false);
        expect(rendered.container.textContent || '').not.toContain('Extensión (NIP-07)');
        expect(rendered.container.textContent || '').not.toContain('Búnker (NIP-46)');
    });

    test('submits npub login through startSession handler', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const handlers = (rendered.container as any).__handlers;
        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('[data-testid="login-method-form-npub"]');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(handlers.onStartSession).toHaveBeenCalledWith('npub', {
            credential: 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw',
        });
    });

    test('keeps selector focused on access methods only', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).not.toContain('Sesion activa');
        expect(content).not.toContain('Bloquear sesion');
        expect(content).not.toContain('Crear cuenta');
        expect(content).not.toContain('Crear cuenta en esta app');
    });

    test('shows loading state on npub submit while parent loading is active', async () => {
        const rendered = await renderSelector({ disabled: true });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('[data-testid="login-method-submit-npub"]') as HTMLButtonElement;
        expect(submitButton).toBeDefined();
        expect(submitButton.textContent || '').toContain('Cargando');
        const spinner = submitButton.querySelector('[aria-label="Loading"]');
        expect(spinner).toBeDefined();
    });

    test('falls back to generic loading copy when loading text is blank', async () => {
        const rendered = await renderSelector({ disabled: true, loadingText: '   ' });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('[data-testid="login-method-submit-npub"]') as HTMLButtonElement;
        expect(submitButton).toBeDefined();
        expect(submitButton.textContent || '').toContain('Cargando...');
    });

    test('shows specific progress copy on npub submit when loading text is provided', async () => {
        const rendered = await renderSelector({ disabled: true, loadingText: 'Construyendo mapa...' });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('button[type="submit"]') as HTMLButtonElement;
        expect(submitButton).toBeDefined();
        expect(submitButton.textContent || '').toContain('Construyendo mapa...');
        expect(submitButton.textContent || '').not.toContain('Cargando...');
    });

    test('falls back to npub when an unavailable nip07 initial method is provided', async () => {
        const rendered = await renderSelector({ disabled: true, initialMethod: 'nip07', loadingText: 'Conectando a relays...', restrictToNpubOnly: true });
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="login-method-submit-nip07"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="login-method-submit-npub"]')).not.toBeNull();
    });

    test('falls back to npub when an unavailable nip46 initial method is provided', async () => {
        const rendered = await renderSelector({ disabled: true, initialMethod: 'nip46', loadingText: 'Conectando a relays...', restrictToNpubOnly: true });
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="login-method-submit-nip46"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="login-method-submit-npub"]')).not.toBeNull();
    });

    test('exposes a stable npub submit test id', async () => {
        const rendered = await renderSelector({ initialMethod: 'npub' });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('[data-testid="login-method-submit-npub"]') as HTMLButtonElement | null;

        expect(submitButton).not.toBeNull();
        expect(submitButton?.classList.contains('mt-2')).toBe(true);
        expect(submitButton?.classList.contains('w-full')).toBe(true);
    });

    test('exposes a stable nip07 submit test id in development mode', async () => {
        const rendered = await renderSelector({ initialMethod: 'nip07' });
        mounted.push(rendered);

        const primaryButton = rendered.container.querySelector('[data-testid="login-method-submit-nip07"]') as HTMLButtonElement | null;

        expect(primaryButton).not.toBeNull();
        expect(primaryButton?.classList.contains('mt-2')).toBe(true);
        expect(primaryButton?.classList.contains('w-full')).toBe(true);
        expect(rendered.container.textContent || '').not.toContain('Usa tu extensión Nostr para firmar sin exponer tu clave privada.');
    });

    test('exposes a stable nip46 submit test id in development mode', async () => {
        const rendered = await renderSelector({ initialMethod: 'nip46' });
        mounted.push(rendered);

        const submitButton = rendered.container.querySelector('[data-testid="login-method-submit-nip46"]') as HTMLButtonElement | null;

        expect(submitButton).not.toBeNull();
        expect(submitButton?.classList.contains('mt-2')).toBe(true);
        expect(submitButton?.classList.contains('w-full')).toBe(true);
        expect(rendered.container.querySelector('[data-testid="login-method-form-nip46"]')).not.toBeNull();
    });

    test('renders localized nip46 paste and nostrconnect actions', async () => {
        const spanish = await renderSelector({ initialMethod: 'nip46', locale: 'es' });
        mounted.push(spanish);

        expect(spanish.container.querySelector('[data-slot="toggle-group"]')).not.toBeNull();
        expect(spanish.container.querySelectorAll('[data-slot="toggle-group-item"]')).toHaveLength(2);
        expect(spanish.container.textContent || '').toContain('Pegar URI bunker://');
        expect(spanish.container.textContent || '').toContain('Generar QR nostrconnect://');
        expect(spanish.container.textContent || '').toContain('Pega un URI bunker:// de tu signer remoto.');

        const english = await renderSelector({ initialMethod: 'nip46', locale: 'en' });
        mounted.push(english);

        expect(english.container.textContent || '').toContain('Paste bunker:// URI');
        expect(english.container.textContent || '').toContain('Generate nostrconnect:// QR');
        expect(english.container.textContent || '').toContain('Paste a bunker:// URI from your remote signer.');
    });

    test('submits pasted bunker uri through the nip46 paste action', async () => {
        const rendered = await renderSelector({ initialMethod: 'nip46' });
        mounted.push(rendered);

        const handlers = (rendered.container as any).__handlers;
        const bunkerInput = rendered.container.querySelector('input[name="bunker-uri"]') as HTMLInputElement;
        const form = rendered.container.querySelector('[data-testid="login-method-form-nip46"]');

        await act(async () => {
            fillInput(bunkerInput, `bunker://${'a'.repeat(64)}?relay=wss://relay.example.com`);
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(handlers.onStartSession).toHaveBeenCalledWith('nip46', {
            bunkerUri: `bunker://${'a'.repeat(64)}?relay=wss://relay.example.com`,
        });
    });

    test('generates a nostrconnect QR, copies the uri, and redacts the secret while pairing', async () => {
        const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: clipboardWriteText },
        });
        const onStartSession = vi.fn<StartSessionHandler>(() => new Promise<void>(() => {}));
        const rendered = await renderSelector({ initialMethod: 'nip46', onStartSession });
        mounted.push(rendered);

        await act(async () => {
            findButtonByText(rendered.container, 'Generar QR nostrconnect://').click();
        });

        const qrContainer = rendered.container.querySelector('[data-testid="nip46-nostrconnect-qr"]');
        expect(qrContainer?.querySelector('svg')).not.toBeNull();
        const copyButton = rendered.container.querySelector('[aria-label="Copiar URI nostrconnect://"]') as HTMLButtonElement | null;
        expect(copyButton).not.toBeNull();

        await act(async () => {
            copyButton?.click();
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        const generatedUri = clipboardWriteText.mock.calls[0]?.[0] as string;
        expect(generatedUri.startsWith('nostrconnect://')).toBe(true);
        const generatedSecret = new URL(generatedUri).searchParams.get('secret');
        expect(generatedSecret).toBeTruthy();

        await act(async () => {
            findButtonByText(rendered.container, 'Esperar conexión').click();
        });

        expect(onStartSession).toHaveBeenCalledWith('nip46', expect.objectContaining({
            bunkerUri: generatedUri,
            clientSecretKey: expect.any(Uint8Array),
        }));
        const startInput = onStartSession.mock.calls[0]?.[1] as { clientSecretKey?: Uint8Array } | undefined;
        expect(startInput?.clientSecretKey).toHaveLength(32);
        expect(rendered.container.textContent || '').toContain('Esperando al signer remoto...');
        expect(rendered.container.innerHTML).not.toContain(generatedUri);
        expect(rendered.container.innerHTML).not.toContain(generatedSecret!);
    });

    test('shows timed-out state when nostrconnect pairing start times out', async () => {
        const onStartSession = vi.fn<StartSessionHandler>(async () => {
            throw new Error('NIP-46 pairing timed out');
        });
        const rendered = await renderSelector({ initialMethod: 'nip46', onStartSession });
        mounted.push(rendered);

        await act(async () => {
            findButtonByText(rendered.container, 'Generar QR nostrconnect://').click();
        });

        await act(async () => {
            findButtonByText(rendered.container, 'Esperar conexión').click();
        });

        expect(rendered.container.textContent || '').toContain('La solicitud de emparejamiento caducó');
        expect(rendered.container.textContent || '').not.toContain('No se pudo conectar el signer remoto');
    });

    test('submits bunker uri through nip46 method in development mode', async () => {
        const rendered = await renderSelector({ initialMethod: 'nip46' });
        mounted.push(rendered);

        const handlers = (rendered.container as any).__handlers;
        const bunkerInput = rendered.container.querySelector('input[name="bunker-uri"]') as HTMLInputElement;
        const form = rendered.container.querySelector('[data-testid="login-method-form-nip46"]');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(bunkerInput, `bunker://${'a'.repeat(64)}?relay=wss://relay.example.com`);
            bunkerInput.dispatchEvent(new Event('input', { bubbles: true }));
            bunkerInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(handlers.onStartSession).toHaveBeenCalledWith('nip46', {
            bunkerUri: `bunker://${'a'.repeat(64)}?relay=wss://relay.example.com`,
        });
    });
});
