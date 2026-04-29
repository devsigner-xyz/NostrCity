import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { createNostrOverlayQueryClient } from '../query/query-client';
import { type SocialComposeSubmitInput, SocialComposeDialog } from './SocialComposeDialog';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(overrides: Partial<Parameters<typeof SocialComposeDialog>[0]> = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();
    const onSubmit = vi.fn(async (_input: SocialComposeSubmitInput) => {});

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <SocialComposeDialog
                    open
                    mode="post"
                    profilesByPubkey={{}}
                    onSearchUsers={vi.fn(async () => ({ pubkeys: [], profiles: {} }))}
                    onOpenChange={vi.fn()}
                    onSubmit={onSubmit}
                    {...overrides}
                />
            </QueryClientProvider>
        );
    });

    return { container, root, onSubmit } satisfies RenderResult & { onSubmit: typeof onSubmit };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    URL.createObjectURL = vi.fn(() => 'blob:test-preview');
    URL.revokeObjectURL = vi.fn();
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

describe('SocialComposeDialog', () => {
    test('renders a compact publish composer without visible title or description', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement();
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-slot="dialog-description"]')).toBeNull();
        expect(rendered.container.textContent || '').not.toContain('Write a new note for Agora.');
        expect(rendered.container.textContent || '').not.toContain('Cancel');
        expect(Array.from(rendered.container.querySelectorAll('button')).some((button) =>
            (button.textContent || '').includes('Close')
        )).toBe(true);
        const textarea = rendered.container.querySelector('textarea[aria-label="Compose note"]') as HTMLTextAreaElement | null;
        expect(textarea?.getAttribute('placeholder')).toBe('Post your note');
        expect(textarea?.className).toContain('p-0');
        expect(textarea?.className).toContain('bg-transparent');
        const content = rendered.container.querySelector('[data-slot="dialog-content"]') as HTMLElement | null;
        expect(content?.className).toContain('max-w-xl');
        const scrollBody = rendered.container.querySelector('.nostr-social-compose-scroll-body') as HTMLElement | null;
        expect(scrollBody?.className).toContain('overflow-y-auto');
        expect(scrollBody?.className).toContain('max-h-[min(560px,calc(100vh-8rem))]');
        expect(rendered.container.querySelector('.nostr-social-compose-footer')).not.toBeNull();
        const publishButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Publish')
        ) as HTMLButtonElement | undefined;
        expect(publishButton?.getAttribute('data-size')).toBe('sm');
    });

    test('shows one selected image below the composer and submits it with the draft', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement();
        mounted.push(rendered);

        const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement | null;
        expect(input?.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp,image/avif');

        const image = new File(['image-bytes'], 'city.png', { type: 'image/png' });
        await act(async () => {
            Object.defineProperty(input, 'files', {
                configurable: true,
                value: [image],
            });
            input?.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const preview = rendered.container.querySelector('img[src="blob:test-preview"]') as HTMLImageElement | null;
        expect(preview).not.toBeNull();
        expect(preview?.getAttribute('alt')).toBe('Selected image preview');

        const textarea = rendered.container.querySelector('textarea[aria-label="Compose note"]') as HTMLTextAreaElement;
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            valueSetter?.call(textarea, 'Testing image note');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const publishButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Publish')
        ) as HTMLButtonElement;

        await act(async () => {
            publishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const submitted = rendered.onSubmit.mock.calls[0]?.[0] as SocialComposeSubmitInput;
        expect(submitted.content.text).toBe('Testing image note');
        expect(submitted.image?.file).toBe(image);
    });
});
