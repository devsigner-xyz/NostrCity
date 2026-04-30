import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { CreateAccountMethodSelector } from './CreateAccountMethodSelector';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderSelector(): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSelectMethod = vi.fn();

    await act(async () => {
        root.render(<CreateAccountMethodSelector onSelectMethod={onSelectMethod} />);
    });

    (container as any).__handlers = { onSelectMethod };
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

describe('CreateAccountMethodSelector', () => {
    test('renders the two account creation branches with the new exact copy and no legacy heading', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).toContain('Usar app o extensión');
        expect(content).toContain('Conecta una extensión o un signer externo.');
        expect(content).toContain('Crear una cuenta local');
        expect(content).toContain('Crea una cuenta nueva en este dispositivo.');
        expect(content).not.toContain('Crear cuenta en esta app');
        expect(content).not.toContain('Elige si quieres conectar un signer externo o crear una identidad nueva aqui.');
        expect(rendered.container.querySelector('[data-slot="card-title"]')).toBeNull();
    });

    test('calls back with the external branch from its item button', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const handlers = (rendered.container as any).__handlers;
        const buttons = rendered.container.querySelectorAll('button');
        const externalButton = Array.from(buttons).find((button) => (button.textContent || '').includes('Usar app o extensión'));
        expect(externalButton).toBeDefined();

        await act(async () => {
            externalButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        expect(handlers.onSelectMethod).toHaveBeenCalledWith('external');
    });

    test('renders focusable item buttons for both branches', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const buttons = Array.from(rendered.container.querySelectorAll('button'));
        const externalButton = buttons.find((button) => (button.textContent || '').includes('Usar app o extensión'));
        const localButton = buttons.find((button) => (button.textContent || '').includes('Crear una cuenta local'));

        expect(externalButton).toBeDefined();
        expect(localButton).toBeDefined();

        externalButton?.focus();
        expect(document.activeElement).toBe(externalButton);

        localButton?.focus();
        expect(document.activeElement).toBe(localButton);
    });

    test('calls back with the local branch from its item button', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const handlers = (rendered.container as any).__handlers;
        const buttons = rendered.container.querySelectorAll('button');
        const localButton = Array.from(buttons).find((button) => (button.textContent || '').includes('Crear una cuenta local'));
        expect(localButton).toBeDefined();

        await act(async () => {
            localButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        expect(handlers.onSelectMethod).toHaveBeenCalledWith('local');
    });
});
