import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { WalletZapSettingsSection } from './WalletZapSettingsSection';

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

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
    const button = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes(text));
    if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Button with text "${text}" was not found`);
    }

    return button;
}

const baseProps = {
    zapSettings: { amounts: [21, 128, 256] },
    newZapAmountInput: '',
    onNewZapAmountInputChange: vi.fn(),
    onRemoveZapAmount: vi.fn(),
    onAddZapAmount: vi.fn(),
};

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
    vi.clearAllMocks();
});

describe('WalletZapSettingsSection', () => {
    test('renders quick zap presets without a default zap amount control', async () => {
        const rendered = await renderElement(<WalletZapSettingsSection {...baseProps} />);
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Zaps');
        expect(rendered.container.textContent || '').not.toContain('Configurar zaps');
        expect(rendered.container.textContent || '').toContain('Cantidades');
        expect(rendered.container.textContent || '').not.toContain('Cantidades de zaps');
        expect(rendered.container.querySelector('[data-slot="field-legend"]')?.getAttribute('data-variant')).toBe('label');
        expect(rendered.container.textContent || '').not.toContain('Cantidad por defecto');
        expect(rendered.container.textContent || '').not.toContain('Por defecto');
        expect(rendered.container.textContent || '').toContain('21 sats');
        expect(rendered.container.textContent || '').toContain('128 sats');
        expect(rendered.container.textContent || '').toContain('256 sats');
        expect(rendered.container.querySelectorAll('[data-slot="separator"]')).toHaveLength(2);
        expect(rendered.container.querySelector('button[data-state="on"]')).toBeNull();
        expect(rendered.container.querySelector('input[aria-label="Cantidad por defecto de zap"]')).toBeNull();
    });

    test('supports adding and removing quick zap presets with accessible labels', async () => {
        const onRemoveZapAmount = vi.fn();
        const onAddZapAmount = vi.fn();
        const rendered = await renderElement(
            <WalletZapSettingsSection
                {...baseProps}
                newZapAmountInput="512"
                onRemoveZapAmount={onRemoveZapAmount}
                onAddZapAmount={onAddZapAmount}
            />
        );
        mounted.push(rendered);

        await act(async () => {
            rendered.container.querySelector<HTMLButtonElement>('button[aria-label="Quitar 128 sats"]')?.click();
        });

        await act(async () => {
            findButton(rendered.container, 'Agregar cantidad').click();
        });

        expect(rendered.container.querySelector('input[aria-label="Nueva cantidad de zap"]')).not.toBeNull();
        const inputGroup = rendered.container.querySelector('[data-testid="wallet-zap-add-row"] [data-slot="input-group"]');
        const addButton = findButton(rendered.container, 'Agregar cantidad');
        expect(inputGroup?.contains(addButton)).toBe(true);
        expect(addButton.getAttribute('data-size')).toBe('xs');
        expect(rendered.container.textContent || '').toContain('sats');
        expect(onRemoveZapAmount).toHaveBeenCalledWith(1);
        expect(onAddZapAmount).toHaveBeenCalledTimes(1);
    });
});
