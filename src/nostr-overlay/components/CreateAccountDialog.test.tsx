import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { getDefaultRelaySettings } from '../../nostr/relay-settings';
import { CreateAccountDialog } from './CreateAccountDialog';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderDialog(options: {
    initialMethod?: 'local' | 'external';
    hasNip07?: boolean;
} = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onBack = vi.fn();
    const onStartSession = vi.fn().mockResolvedValue(undefined);
    const onCreateLocalAccount = vi.fn().mockResolvedValue(undefined);
    const secretKey = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));

    await act(async () => {
        root.render(
            <CreateAccountDialog
                initialMethod={options.initialMethod ?? 'local'}
                hasNip07={options.hasNip07 ?? true}
                onBack={onBack}
                onStartSession={onStartSession}
                onCreateLocalAccount={onCreateLocalAccount}
                secretKeyFactory={() => secretKey}
                defaultRelaySettings={getDefaultRelaySettings()}
            />
        );
    });

    (container as any).__handlers = {
        onBack,
        onStartSession,
        onCreateLocalAccount,
        secretKey,
    };

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('CreateAccountDialog', () => {
    test('renders the external flow copy with a footer-only back action and no nested card shell', async () => {
        const rendered = await renderDialog({ initialMethod: 'external', hasNip07: true });
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        const footer = rendered.container.querySelector('[data-testid="auth-flow-footer"]');
        const footerButtons = Array.from(footer?.querySelectorAll('button') ?? []);

        expect(content).toContain('Usar app o extensión');
        expect(content).toContain('Elige cómo conectar una cuenta que ya controlas.');
        expect(rendered.container.querySelector('[data-testid="create-account-external-form"]')).not.toBeNull();
        expect(content).not.toContain('Crear cuenta con app o extensión');
        expect(content).not.toContain('Conecta un signer externo para seguir usando tu identidad fuera del navegador.');
        expect(footerButtons).toHaveLength(1);
        expect(footerButtons[0]?.textContent || '').toContain('Volver');
        expect(rendered.container.querySelectorAll('[data-slot="card"]')).toHaveLength(0);
    });

    test('renders the local flow copy with left back action, right primary action, and no nested card shell', async () => {
        const rendered = await renderDialog({ initialMethod: 'local' });
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        const footer = rendered.container.querySelector('[data-testid="auth-flow-footer"]');
        const footerButtons = Array.from(footer?.querySelectorAll('button') ?? []);
        const backupStep = rendered.container.querySelector('[data-testid="create-account-step-backup"]');

        expect(content).toContain('Crear cuenta local');
        expect(content).toContain('Genera una cuenta nueva y guarda tu clave antes de continuar.');
        expect(rendered.container.querySelector('[data-testid="create-account-step-intro"]')).toBeNull();
        expect(backupStep).not.toBeNull();
        expect(rendered.container.querySelector('textarea#generated-nsec')).not.toBeNull();
        expect(rendered.container.querySelector('textarea#generated-npub-backup')).not.toBeNull();
        expect(content).toContain('Copiar nsec');
        expect(content).toContain('Copiar npub');
        expect(content).toContain('Descargar copia de seguridad');
        expect(backupStep?.querySelector('[data-slot="separator"]')).toBeNull();
        expect(backupStep?.querySelector('label input[name="confirm-backup"]')).not.toBeNull();
        expect(content).not.toContain('Crear cuenta en esta app');
        expect(content).not.toContain('Crea una identidad Nostr local con firma y cifrado NIP-44, y guardala de forma segura en este dispositivo.');
        expect(footerButtons).toHaveLength(2);
        expect(footerButtons[0]?.textContent || '').toContain('Volver');
        expect(footerButtons[1]?.textContent || '').toContain('Continuar');
        expect(rendered.container.querySelectorAll('[data-slot="card"]')).toHaveLength(0);
    });

    test('requires backup confirmation before finishing local account creation', async () => {
        const rendered = await renderDialog({ initialMethod: 'local' });
        mounted.push(rendered);

        const next = async (label: string) => {
            const button = Array.from(rendered.container.querySelectorAll('button')).find((candidate) =>
                (candidate.textContent || '').includes(label)
            ) as HTMLButtonElement | undefined;
            expect(button).toBeDefined();
            await act(async () => {
                button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
        };

        const continueButtonBefore = Array.from(rendered.container.querySelectorAll('button')).find((candidate) =>
            (candidate.textContent || '').includes('Continuar')
        ) as HTMLButtonElement | undefined;
        expect(continueButtonBefore?.disabled).toBe(true);
        expect(rendered.container.querySelector('[data-testid="create-account-step-backup"]')).not.toBeNull();

        const backupCheckbox = rendered.container.querySelector('input[name="confirm-backup"]') as HTMLInputElement;
        expect(backupCheckbox).toBeDefined();
        await act(async () => {
            backupCheckbox.click();
        });

        await next('Continuar');
        await next('Continuar');

        const finishButton = Array.from(rendered.container.querySelectorAll('button')).find((candidate) =>
            (candidate.textContent || '').includes('Crear cuenta ahora')
        ) as HTMLButtonElement | undefined;
        expect(finishButton?.disabled).toBe(false);
    });

    test('submits local account bootstrap payload with profile and optional passphrase', async () => {
        const rendered = await renderDialog({ initialMethod: 'local' });
        mounted.push(rendered);
        const handlers = (rendered.container as any).__handlers;

        const clickByLabel = async (label: string) => {
            const button = Array.from(rendered.container.querySelectorAll('button')).find((candidate) =>
                (candidate.textContent || '').includes(label)
            ) as HTMLButtonElement | undefined;
            expect(button).toBeDefined();
            await act(async () => {
                button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
        };

        const fillInput = async (selector: string, value: string) => {
            const input = rendered.container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
            expect(input).toBeDefined();
            await act(async () => {
                const prototype = Object.getPrototypeOf(input);
                const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                valueSetter?.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        };

        const backupCheckbox = rendered.container.querySelector('input[name="confirm-backup"]') as HTMLInputElement;
        await act(async () => {
            backupCheckbox.click();
        });
        await clickByLabel('Continuar');

        expect(rendered.container.querySelector('[data-testid="create-account-step-profile"]')).not.toBeNull();
        await fillInput('input[name="profile-name"]', 'Pablo');
        await fillInput('textarea[name="profile-about"]', 'Mapa y nostr');
        await fillInput('input[name="profile-picture"]', 'https://example.com/avatar.png');
        await clickByLabel('Continuar');

        expect(rendered.container.querySelector('[data-testid="create-account-step-relays"]')).not.toBeNull();
        await fillInput('input[name="device-passphrase"]', 'mi-passphrase');
        await clickByLabel('Crear cuenta ahora');

        expect(handlers.onCreateLocalAccount).toHaveBeenCalledWith({
            secretKey: handlers.secretKey,
            passphrase: 'mi-passphrase',
            profile: {
                name: 'Pablo',
                about: 'Mapa y nostr',
                picture: 'https://example.com/avatar.png',
            },
            relaySettings: getDefaultRelaySettings(),
        });
    });

    test('renders relay json in a textarea with max height and scroll', async () => {
        const rendered = await renderDialog({ initialMethod: 'local' });
        mounted.push(rendered);

        const clickByLabel = async (label: string) => {
            const button = Array.from(rendered.container.querySelectorAll('button')).find((candidate) =>
                (candidate.textContent || '').includes(label)
            ) as HTMLButtonElement | undefined;
            expect(button).toBeDefined();
            await act(async () => {
                button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
        };

        const backupCheckbox = rendered.container.querySelector('input[name="confirm-backup"]') as HTMLInputElement;
        expect(backupCheckbox).toBeDefined();
        expect(rendered.container.querySelector('[data-testid="create-account-step-backup"]')).not.toBeNull();
        await act(async () => {
            backupCheckbox.click();
        });

        await clickByLabel('Continuar');
        await clickByLabel('Continuar');

        expect(rendered.container.querySelector('[data-testid="create-account-step-relays"]')).not.toBeNull();
        const relayJsonTextarea = rendered.container.querySelector('textarea[data-slot="textarea"][readonly]') as HTMLTextAreaElement | null;
        expect(relayJsonTextarea).not.toBeNull();
        expect(relayJsonTextarea?.className).toContain('field-sizing-fixed');
        expect(relayJsonTextarea?.className).toContain('max-h-56');
        expect(relayJsonTextarea?.className).toContain('overflow-auto');
    });

    test('supports external branch with extension and bunker login', async () => {
        const rendered = await renderDialog({ initialMethod: 'external', hasNip07: true });
        mounted.push(rendered);
        const handlers = (rendered.container as any).__handlers;

        const extensionButton = Array.from(rendered.container.querySelectorAll('button')).find((candidate) =>
            (candidate.textContent || '').includes('Continuar con extensión')
        ) as HTMLButtonElement | undefined;
        expect(extensionButton).toBeDefined();

        await act(async () => {
            extensionButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(handlers.onStartSession).toHaveBeenCalledWith('nip07', {});

        const bunkerInput = rendered.container.querySelector('input[name="bunker-uri"]') as HTMLInputElement;
        expect(bunkerInput).toBeDefined();
        expect(rendered.container.querySelector('[data-testid="create-account-external-form"]')).not.toBeNull();
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(bunkerInput, `bunker://${'a'.repeat(64)}?relay=wss://relay.example.com`);
            bunkerInput.dispatchEvent(new Event('input', { bubbles: true }));
            bunkerInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const bunkerForm = bunkerInput.closest('form');
        await act(async () => {
            bunkerForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(handlers.onStartSession).toHaveBeenCalledWith('nip46', {
            bunkerUri: `bunker://${'a'.repeat(64)}?relay=wss://relay.example.com`,
        });
    });

    test('keeps the local primary action on the right as the flow advances', async () => {
        const rendered = await renderDialog({ initialMethod: 'local' });
        mounted.push(rendered);

        const clickByLabel = async (label: string) => {
            const button = Array.from(rendered.container.querySelectorAll('button')).find((candidate) =>
                (candidate.textContent || '').includes(label)
            ) as HTMLButtonElement | undefined;
            expect(button).toBeDefined();
            await act(async () => {
                button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
        };

        const backupCheckbox = rendered.container.querySelector('input[name="confirm-backup"]') as HTMLInputElement;
        await act(async () => {
            backupCheckbox.click();
        });

        await clickByLabel('Continuar');
        await clickByLabel('Continuar');

        expect(rendered.container.querySelector('[data-testid="create-account-step-relays"]')).not.toBeNull();
        const footer = rendered.container.querySelector('[data-testid="auth-flow-footer"]');
        const footerButtons = Array.from(footer?.querySelectorAll('button') ?? []);

        expect(footerButtons).toHaveLength(2);
        expect(footerButtons[0]?.textContent || '').toContain('Volver');
        expect(footerButtons[1]?.textContent || '').toContain('Crear cuenta ahora');
    });

    test('does not generate local key material for the external branch', async () => {
        const secretKeyFactory = vi.fn(() => new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1)));
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <CreateAccountDialog
                    initialMethod="external"
                    hasNip07
                    onBack={vi.fn()}
                    onStartSession={vi.fn()}
                    onCreateLocalAccount={vi.fn()}
                    secretKeyFactory={secretKeyFactory}
                    defaultRelaySettings={getDefaultRelaySettings()}
                />
            );
        });

        mounted.push({ container, root });
        expect(secretKeyFactory).not.toHaveBeenCalled();
    });
});
