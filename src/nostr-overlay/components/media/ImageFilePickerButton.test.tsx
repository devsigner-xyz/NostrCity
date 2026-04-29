import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { ImageFilePickerButton } from './ImageFilePickerButton';
import type { ImageFileRejectionReason } from '../../media/image-file-policy';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    onSelect: ReturnType<typeof vi.fn>;
    onReject: ReturnType<typeof vi.fn>;
}

function renderPicker(overrides: Partial<Parameters<typeof ImageFilePickerButton>[0]> = {}): RenderResult {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSelect = vi.fn();
    const onReject = vi.fn<(reason: ImageFileRejectionReason) => void>();

    act(() => {
        root.render(
            <ImageFilePickerButton
                ariaLabel="Upload image"
                onSelect={onSelect}
                onReject={onReject}
                {...overrides}
            >
                Pick image
            </ImageFilePickerButton>
        );
    });

    return { container, root, onSelect, onReject };
}

function setInputFile(input: HTMLInputElement, file: File) {
    Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file],
    });
}

describe('ImageFilePickerButton', () => {
    beforeAll(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders a keyboard-accessible button with the supplied accessible name', () => {
        const rendered = renderPicker({ ariaLabel: 'Upload avatar' });
        const button = rendered.container.querySelector('button[aria-label="Upload avatar"]') as HTMLButtonElement | null;

        expect(button).not.toBeNull();
        expect(button?.type).toBe('button');
        expect(rendered.container.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp,image/avif');

        act(() => {
            rendered.root.unmount();
        });
        rendered.container.remove();
    });

    test('opens the hidden file input from the button', () => {
        const rendered = renderPicker();
        const button = rendered.container.querySelector('button') as HTMLButtonElement;
        const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement;
        const clickInput = vi.spyOn(input, 'click').mockImplementation(() => undefined);

        act(() => {
            button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(clickInput).toHaveBeenCalledTimes(1);

        act(() => {
            rendered.root.unmount();
        });
        rendered.container.remove();
    });

    test('selects valid images and clears the input value', async () => {
        const rendered = renderPicker();
        const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File([PNG_BYTES], 'city.png', { type: 'image/png' });
        Object.defineProperty(input, 'value', {
            configurable: true,
            writable: true,
            value: 'C:\\fakepath\\city.png',
        });
        setInputFile(input, file);

        await act(async () => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(rendered.onSelect).toHaveBeenCalledWith(file);
        expect(rendered.onReject).not.toHaveBeenCalled();
        expect(input.value).toBe('');

        act(() => {
            rendered.root.unmount();
        });
        rendered.container.remove();
    });

    test('rejects invalid images instead of silently doing nothing', async () => {
        const rendered = renderPicker();
        const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement;
        setInputFile(input, new File(['<svg></svg>'], 'vector.svg', { type: 'image/svg+xml' }));

        await act(async () => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(rendered.onSelect).not.toHaveBeenCalled();
        expect(rendered.onReject).toHaveBeenCalledWith('unsupported-type');

        act(() => {
            rendered.root.unmount();
        });
        rendered.container.remove();
    });

    test('respects disabled state', async () => {
        const rendered = renderPicker({ disabled: true });
        const button = rendered.container.querySelector('button') as HTMLButtonElement;
        const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement;
        const clickInput = vi.spyOn(input, 'click').mockImplementation(() => undefined);

        expect(button.disabled).toBe(true);
        await act(async () => {
            button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(clickInput).not.toHaveBeenCalled();

        act(() => {
            rendered.root.unmount();
        });
        rendered.container.remove();
    });
});
