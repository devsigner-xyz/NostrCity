import { act, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../../nostr/ui-settings';
import { ProfileImageCropDialog } from './ProfileImageCropDialog';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    onApply: ReturnType<typeof vi.fn>;
}

function renderDialog(kind: 'avatar' | 'banner' = 'avatar'): RenderResult {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onApply = vi.fn();

    function Harness() {
        const [open, setOpen] = useState(true);
        const triggerRef = useRef<HTMLButtonElement | null>(null);

        useEffect(() => {
            triggerRef.current?.focus();
        }, []);

        return (
            <>
                <button ref={triggerRef} type="button">Trigger</button>
                <ProfileImageCropDialog
                    open={open}
                    kind={kind}
                    previewUrl="blob:profile-preview"
                    fileName="profile.png"
                    returnFocusRef={triggerRef}
                    onOpenChange={setOpen}
                    onApply={onApply}
                />
            </>
        );
    }

    act(() => {
        root.render(<Harness />);
    });

    return { container, root, onApply };
}

describe('ProfileImageCropDialog', () => {
    beforeAll(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(() => {
        window.localStorage.clear();
        document.body.replaceChildren();
    });

    test('has accessible title and instructions', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = renderDialog('banner');

        expect(document.body.textContent).toContain('Crop banner image');
        expect(document.body.textContent).toContain('Use a wide 3:1 crop for your profile banner.');
        expect(document.body.querySelector('img[alt="Selected profile image preview"]')).not.toBeNull();

        act(() => {
            rendered.root.unmount();
        });
    });

    test('Escape cancels and returns focus to the trigger', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = renderDialog();
        const content = document.body.querySelector('[data-slot="dialog-content"]') as HTMLElement;

        act(() => {
            content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });

        expect(document.body.textContent).not.toContain('Crop avatar image');
        expect(document.activeElement?.textContent).toBe('Trigger');

        act(() => {
            rendered.root.unmount();
        });
    });

    test('exposes keyboard reachable apply, cancel, reset, and zoom controls', () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = renderDialog();
        const controls = Array.from(document.body.querySelectorAll('button')).map((button) => button.textContent || button.getAttribute('aria-label'));

        expect(controls).toContain('Apply crop');
        expect(controls).toContain('Cancel');
        expect(controls).toContain('Reset crop');
        expect(document.body.querySelector('button[aria-label="Zoom in"]')).not.toBeNull();
        expect(document.body.querySelector('button[aria-label="Zoom out"]')).not.toBeNull();
        expect(document.body.querySelector('[role="slider"][aria-label="Zoom"]')).not.toBeNull();

        act(() => {
            rendered.root.unmount();
        });
    });
});
