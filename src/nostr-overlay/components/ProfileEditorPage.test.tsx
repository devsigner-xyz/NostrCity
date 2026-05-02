import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import { ProfileEditorPage, type ProfileEditorPageProps } from './ProfileEditorPage';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        error: toastErrorMock,
        success: toastSuccessMock,
    },
}));

const OWNER_PUBKEY = 'f'.repeat(64);

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    onPublishProfileMetadata: ReturnType<typeof vi.fn>;
}

function buildProfile(overrides: Partial<NostrProfile> = {}): NostrProfile {
    return {
        pubkey: OWNER_PUBKEY,
        name: 'alice',
        displayName: 'Alice Doe',
        about: 'Building with Nostr',
        picture: 'https://example.com/avatar.jpg',
        banner: 'https://example.com/banner.jpg',
        website: 'https://example.com',
        nip05: 'alice@example.com',
        lud16: 'alice@getalby.com',
        lud06: 'lnurl1dp68gurn8ghj7',
        birthday: { month: 5, day: 9 },
        bot: true,
        ...overrides,
    };
}

async function renderPage(overrides: Partial<ProfileEditorPageProps> = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onPublishProfileMetadata = vi.fn(async (content: string): Promise<NostrEvent> => ({
        id: '1'.repeat(64),
        pubkey: OWNER_PUBKEY,
        kind: 0,
        created_at: 123,
        tags: [],
        content,
        sig: '2'.repeat(128),
    }));

    await act(async () => {
        root.render(
            <ProfileEditorPage
                ownerPubkey={OWNER_PUBKEY}
                ownerProfile={buildProfile()}
                canWrite
                onBack={vi.fn()}
                onUploadProfileImage={vi.fn(async () => 'https://example.com/uploaded.jpg')}
                onPublishProfileMetadata={onPublishProfileMetadata}
                {...overrides}
            />
        );
    });

    return { container, root, onPublishProfileMetadata };
}

function changeValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('ProfileEditorPage', () => {
    beforeAll(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        URL.createObjectURL = vi.fn(() => 'blob:profile-image');
        URL.revokeObjectURL = vi.fn();
    });

    afterEach(async () => {
        window.localStorage.clear();
        toastErrorMock.mockClear();
        toastSuccessMock.mockClear();
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    test('renders preview and editable profile metadata fields', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderPage();

        expect(rendered.container.querySelector('[data-testid="overlay-surface-content"]')).not.toBeNull();
        expect(rendered.container.textContent).toContain('Alice Doe');
        expect(rendered.container.textContent).toContain('npub1');
        expect(rendered.container.textContent).toContain('alice@example.com');
        expect(rendered.container.textContent).toContain('Building with Nostr');
        expect(rendered.container.querySelector('img[src="https://example.com/banner.jpg"]')).not.toBeNull();
        expect(rendered.container.querySelector('img[src="https://example.com/avatar.jpg"]')).not.toBeNull();

        for (const name of ['name', 'displayName', 'about', 'website', 'nip05', 'lud16', 'lud06', 'birthday', 'bot']) {
            expect(rendered.container.querySelector(`[name="${name}"]`)).not.toBeNull();
        }
        expect(rendered.container.textContent).not.toContain('Choose an avatar image. It will be cropped square.');
        expect(rendered.container.textContent).not.toContain('Choose a banner image. It will be cropped wide.');

        await act(async () => rendered.root.unmount());
    });

    test('places avatar and banner image editors directly on the preview', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderPage();

        const preview = rendered.container.querySelector('[data-testid="profile-editor-preview"]') as HTMLElement;
        const avatarInput = preview.querySelector('input[data-profile-image-kind="avatar"]');
        const bannerInput = preview.querySelector('input[data-profile-image-kind="banner"]');

        expect(avatarInput).not.toBeNull();
        expect(bannerInput).not.toBeNull();
        expect(preview.querySelector('button[aria-label="Edit avatar image"]')).not.toBeNull();
        expect(preview.querySelector('button[aria-label="Edit banner image"]')).not.toBeNull();

        await act(async () => rendered.root.unmount());
    });

    test('stacks editor preview and form until the extra-large breakpoint', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderPage();

        const preview = rendered.container.querySelector('[data-testid="profile-editor-preview"]') as HTMLElement;
        const layout = preview.closest('.grid') as HTMLElement;

        expect(layout).not.toBeNull();
        expect(layout.className).toContain('xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]');
        expect(layout.className).not.toContain('lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]');

        await act(async () => rendered.root.unmount());
    });

    test('renders preview using the occupant detail layout with only filled profile fields', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const sparseProfile = buildProfile({
            about: '',
            website: '',
            nip05: '',
            lud16: '',
            lud06: '',
            bot: false,
        });
        delete sparseProfile.birthday;
        const rendered = await renderPage({
            ownerProfile: sparseProfile,
        });

        const preview = rendered.container.querySelector('[data-testid="profile-editor-preview"]') as HTMLElement;
        expect(preview).not.toBeNull();
        expect(preview.querySelector('.nostr-profile-dialog-banner-shell img[src="https://example.com/banner.jpg"]')).not.toBeNull();
        expect(preview.querySelector('.nostr-dialog-header [data-slot="avatar"]')).not.toBeNull();
        expect(preview.querySelector('.nostr-dialog-header [data-slot="avatar-fallback"]')).toBeNull();
        expect(preview.querySelector('.nostr-dialog-header')?.textContent).toContain('Alice Doe');
        expect(preview.querySelector('.nostr-dialog-header')?.textContent).toContain('npub1');
        expect(preview.textContent).not.toContain('Website');
        expect(preview.textContent).not.toContain('Bot');

        await act(async () => rendered.root.unmount());
    });

    test('announces invalid avatar file rejection', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderPage();
        const input = rendered.container.querySelector('input[data-profile-image-kind="avatar"]') as HTMLInputElement;

        await act(async () => {
            Object.defineProperty(input, 'files', {
                configurable: true,
                value: [new File(['<svg></svg>'], 'avatar.svg', { type: 'image/svg+xml' })],
            });
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain('The selected file is not a supported image.');

        await act(async () => rendered.root.unmount());
    });

    test('publishes kind 0 content while preserving unknown metadata fields', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderPage({
            onLoadLatestProfileMetadata: vi.fn(async () => JSON.stringify({ unknown: 'keep', username: 'deprecated', about: 'old' })),
        });
        const about = rendered.container.querySelector('textarea[name="about"]') as HTMLTextAreaElement;
        await act(async () => changeValue(about, ''));

        const saveButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Save profile')
        ) as HTMLButtonElement;
        await act(async () => {
            saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const content = rendered.onPublishProfileMetadata.mock.calls[0]?.[0] as string;
        expect(JSON.parse(content)).toMatchObject({
            unknown: 'keep',
            name: 'alice',
            display_name: 'Alice Doe',
            picture: 'https://example.com/avatar.jpg',
            banner: 'https://example.com/banner.jpg',
        });
        expect(content).not.toContain('username');
        expect(content).not.toContain('about');
        expect(toastSuccessMock).toHaveBeenCalledWith('Profile metadata published.', { duration: 1800 });

        await act(async () => rendered.root.unmount());
    });

    test('shows an error toast when profile publishing fails', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderPage({
            onPublishProfileMetadata: vi.fn(async () => {
                throw new Error('publish failed');
            }),
        });
        const saveButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Save profile')
        ) as HTMLButtonElement;

        await act(async () => {
            saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(toastErrorMock).toHaveBeenCalledWith('Could not publish profile metadata.', { duration: 2200 });
        expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain('Could not publish profile metadata.');

        await act(async () => rendered.root.unmount());
    });

    test('readonly sessions cannot save and show localized feedback', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));
        const rendered = await renderPage({ canWrite: false });
        const saveButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Save profile')
        ) as HTMLButtonElement;

        expect(saveButton.disabled).toBe(true);
        expect(rendered.container.textContent).toContain('This session is read-only. Profile editing is disabled.');

        await act(async () => rendered.root.unmount());
    });
});
