import { act, type ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { OccupantProfileDialog } from './OccupantProfileDialog';

const { toastSuccessMock } = vi.hoisted(() => ({
    toastSuccessMock: vi.fn(),
}));

const overlayStyles = readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');

vi.mock('sonner', () => ({
    toast: {
        success: toastSuccessMock,
    },
}));

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

async function waitForCondition(check: () => boolean, timeoutMs: number = 2000): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (check()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
    }

    throw new Error('Condition was not met in time');
}

async function selectTab(label: string): Promise<void> {
    const tab = Array.from(document.body.querySelectorAll('[data-slot="tabs-trigger"]')).find((node) =>
        (node.textContent || '').trim() === label
        || (node.textContent || '').trim().startsWith(`${label} (`)
    ) as HTMLElement;
    expect(tab).toBeDefined();

    await act(async () => {
        tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

function buildProps(overrides: Partial<Parameters<typeof OccupantProfileDialog>[0]> = {}): Parameters<typeof OccupantProfileDialog>[0] {
    return {
        pubkey: 'a'.repeat(64),
        profile: {
            pubkey: 'a'.repeat(64),
            displayName: 'Alice',
        },
        followsCount: 2,
        followersCount: 1,
        statsLoading: false,
        posts: [],
        postsLoading: false,
        hasMorePosts: false,
        follows: ['b'.repeat(64), 'c'.repeat(64)],
        followers: ['d'.repeat(64)],
        networkProfiles: {
            ['b'.repeat(64)]: { pubkey: 'b'.repeat(64), displayName: 'Bob' },
            ['c'.repeat(64)]: { pubkey: 'c'.repeat(64), displayName: 'Carol' },
            ['d'.repeat(64)]: { pubkey: 'd'.repeat(64), displayName: 'Dave' },
        },
        profilesByPubkey: {},
        networkLoading: false,
        onLoadMorePosts: vi.fn(async () => {}),
        onRetryPosts: vi.fn(async () => {}),
        engagementByEventId: {},
        onSelectProfile: vi.fn(),
        onResolveProfiles: vi.fn(async () => {}),
        onSelectEventReference: vi.fn(),
        canWrite: true,
        reactionByEventId: {},
        repostByEventId: {},
        pendingReactionByEventId: {},
        pendingRepostByEventId: {},
        onOpenThread: vi.fn(),
        onToggleReaction: vi.fn(async () => true),
        onToggleRepost: vi.fn(async () => true),
        onOpenQuoteComposer: vi.fn(),
        onZap: vi.fn(async () => {}),
        zapAmounts: [21, 128, 256],
        onConfigureZapAmounts: vi.fn(),
        onResolveEventReferences: vi.fn(async () => {}),
        eventReferencesById: {},
        onClose: vi.fn(),
        ...overrides,
    };
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

describe('OccupantProfileDialog', () => {
    test('shows four tabs and removes legacy social stats block', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const bannerShell = document.body.querySelector('.nostr-profile-dialog-banner-shell') as HTMLElement;
        expect(bannerShell).toBeDefined();
        expect(bannerShell.classList.contains('is-placeholder')).toBe(true);

        const tabLabels = Array.from(document.body.querySelectorAll('[data-slot="tabs-trigger"]'))
            .map((node) => (node.textContent || '').trim());

        expect(tabLabels.slice(0, 4)).toEqual([
            'Información',
            'Feed',
            'Siguiendo (2)',
            'Seguidores (1)',
        ]);

        expect(document.body.textContent || '').not.toContain('Cargando estadisticas...');

        const metricLabels = Array.from(document.body.querySelectorAll('dt')).map((node) => (node.textContent || '').trim());
        expect(metricLabels).not.toContain('Siguiendo');
        expect(metricLabels).not.toContain('Seguidores');

        const subheadings = Array.from(document.body.querySelectorAll('h5')).map((node) => (node.textContent || '').trim());
        expect(subheadings).not.toContain('Sigue a');
        expect(subheadings).not.toContain('Le siguen');
    });

    test('shows lightning donation banner first in strhodler info tab', async () => {
        const strhodlerPubkey = 'd'.repeat(64);
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    pubkey: strhodlerPubkey,
                    profile: {
                        pubkey: strhodlerPubkey,
                        displayName: 'strhodler',
                        lud16: 'strhodler@getalby.com',
                    },
                    donationPubkey: strhodlerPubkey,
                    canDonateWithWallet: false,
                    onDonate: vi.fn(async () => {}),
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Información');

        const infoSection = document.body.querySelector('.nostr-profile-info');
        const rows = Array.from(infoSection?.querySelectorAll('.nostr-profile-info-row') ?? []);
        const banner = infoSection?.querySelector('[data-testid="lightning-donation-banner"]');

        expect(banner).not.toBeNull();
        expect(rows.length).toBeGreaterThan(0);
        expect(infoSection?.firstElementChild).toBe(banner);
    });

    test('renders a horizontal separator between profile header and tabs', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const header = document.body.querySelector('.nostr-dialog-header') as HTMLElement;
        const separator = document.body.querySelector('.nostr-profile-dialog-separator[data-slot="separator"]') as HTMLElement;
        const tabs = document.body.querySelector('[data-slot="tabs-list"]') as HTMLElement;
        expect(header).not.toBeNull();
        expect(separator).not.toBeNull();
        expect(tabs).not.toBeNull();
        expect(separator.getAttribute('data-orientation')).toBe('horizontal');
        expect((header.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
        expect((separator.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
        expect(overlayStyles).toMatch(/\.nostr-profile-dialog-sticky-shell \.nostr-profile-dialog-separator\s*\{[^}]*margin-inline:\s*-0\.85rem;[^}]*width:\s*calc\(100% \+ 1\.7rem\)/s);
    });

    test('uses the shared dialog close button styling', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const closeButton = document.body.querySelector('button.absolute.top-2.right-2') as HTMLButtonElement | null;
        expect(closeButton).not.toBeNull();
        expect(closeButton?.className).toContain('absolute top-2 right-2');
        expect(closeButton?.className).toContain('bg-background/95');
        expect(closeButton?.className).toContain('border-border');
        expect(closeButton?.className).toContain('shadow-md');
        expect(closeButton?.className).toContain('z-10');
        expect(closeButton?.className).not.toContain('nostr-dialog-close');
    });

    test('keeps profile dialog sizing in CSS so mobile fullscreen rules can apply', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const dialog = document.body.querySelector('.nostr-profile-dialog') as HTMLElement | null;

        expect(dialog).not.toBeNull();
        expect(dialog?.style.width).toBe('');
        expect(dialog?.style.maxWidth).toBe('');
        expect(overlayStyles).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*\.nostr-profile-dialog\s*\{[\s\S]*width:\s*100vw;[\s\S]*height:\s*100dvh;/);
    });

    test('copies the full npub when clicking the displayed npub', async () => {
        const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: clipboardWriteText,
            },
        });

        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        expect(document.body.querySelector('.nostr-dialog-copy-npub')).toBeNull();

        const copyButton = document.body.querySelector('.nostr-dialog-pubkey-copy') as HTMLButtonElement;
        expect(copyButton).toBeDefined();
        expect(copyButton.textContent || '').toContain('npub1');

        await act(async () => {
            copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect((clipboardWriteText.mock.calls[0]?.[0] as string | undefined)?.startsWith('npub1')).toBe(true);
        expect(toastSuccessMock).toHaveBeenCalledWith('npub copiada', { duration: 1600 });
    });

    test('renders primary profile tabs in english when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const tabLabels = Array.from(document.body.querySelectorAll('[data-slot="tabs-trigger"]'))
            .map((node) => (node.textContent || '').trim());

        expect(tabLabels.slice(0, 4)).toEqual([
            'Info',
            'Feed',
            'Following (2)',
            'Followers (1)',
        ]);
        expect(document.body.querySelector('button[aria-label="Copy npub"]')).not.toBeNull();
    });

    test('renders enriched about tab without avatar url row or avatar lightbox trigger', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    profile: {
                        pubkey: 'a'.repeat(64),
                        displayName: 'Alice',
                        picture: 'https://example.com/avatar.png',
                        banner: 'https://example.com/banner.png',
                        nip05: 'alice@example.com',
                        about: 'Construyendo sobre Nostr.',
                        website: 'https://alice.dev',
                        lud16: 'alice@getalby.com',
                        lud06: 'lnurl1dp68gurn8ghj7mmsw3skccnwv4uxzmtsd3jjucm0d5hkgct5v9cx7mmsxqex2atwv9ujuetcv9khqmr9xqcnqve5xqersv3nxg6ryv3h',
                        bot: true,
                        externalIdentities: ['github:alice', 'mastodon:nostr.example/@alice'],
                    },
                    verification: {
                        status: 'verified',
                        identifier: 'alice@example.com',
                        displayIdentifier: 'alice@example.com',
                        checkedAt: Date.now(),
                    },
                })}
            />
        );
        mounted.push(rendered);

        const banner = document.body.querySelector('.nostr-profile-dialog-banner') as HTMLImageElement;
        const header = document.body.querySelector('.nostr-dialog-header') as HTMLElement;
        expect(banner).toBeDefined();
        expect(header).toBeDefined();
        expect((banner.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);

        await selectTab('Información');
        await waitForCondition(() => (document.body.textContent || '').includes('Construyendo sobre Nostr.'));

        const text = document.body.textContent || '';
        const infoText = document.body.querySelector('.nostr-profile-info-list')?.textContent || '';
        expect(text).toContain('NIP-05');
        expect(text).toContain('Descripción');
        expect(text).toContain('Sitio web');
        expect(text).toContain('LUD16');
        expect(text).toContain('LUD06');
        expect(infoText).not.toContain('Bot');
        expect(text).toContain('Identidades externas');
        expect(text).not.toContain('Avatar');
        expect(text).not.toContain('https://example.com/avatar.png');
        expect(document.body.querySelector('.nostr-dialog-header [data-slot="badge"]')?.textContent || '').toBe('Bot');

        expect(document.body.querySelector('.nostr-dialog-avatar-trigger')).toBeNull();
        expect(document.body.querySelector('.nostr-dialog-header [data-slot="avatar"]')).not.toBeNull();
        expect(document.body.querySelector('.yarl__root')).toBeNull();
    });

    test('does not expose avatar lightbox trigger in english when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    profile: {
                        pubkey: 'a'.repeat(64),
                        displayName: 'Alice',
                        picture: 'https://example.com/avatar.png',
                    },
                })}
            />
        );
        mounted.push(rendered);

        expect(document.body.querySelector('.nostr-dialog-avatar-trigger')).toBeNull();
        expect(document.body.innerHTML).not.toContain('Avatar of Alice');
    });

    test('hides incomplete profile information rows in the information tab', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        await selectTab('Información');

        const text = document.body.textContent || '';
        expect(text).not.toContain('Descripcion');
        expect(text).not.toContain('NIP-05');
        expect(text).not.toContain('Sitio web');
        expect(text).not.toContain('LUD16');
        expect(text).not.toContain('LUD06');
        expect(text).not.toContain('Bot');
        expect(text).not.toContain('Identidades externas');
        expect(text).not.toContain('No declarado');
        expect(text).not.toContain('No declaradas');
        expect(text).not.toContain('Relays declarados');
    });

    test('does not show bot badge or info row for explicitly negative bot profile metadata', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    profile: {
                        pubkey: 'a'.repeat(64),
                        displayName: 'Alice',
                        bot: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Información');

        const text = document.body.textContent || '';
        expect(text).not.toContain('Bot');
    });

    test('shows bot badge beside network user names', async () => {
        const botPubkey = 'd'.repeat(64);
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    follows: [botPubkey],
                    networkProfiles: {
                        [botPubkey]: {
                            pubkey: botPubkey,
                            displayName: 'Relay Helper',
                            bot: true,
                        },
                    },
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Siguiendo (1)');

        const networkItem = Array.from(document.body.querySelectorAll('.nostr-profile-network-list [data-slot="item"]'))
            .find((item) => (item.textContent || '').includes('Relay Helper')) as HTMLElement | undefined;

        expect(networkItem).toBeDefined();
        expect(networkItem?.querySelector('[data-slot="badge"]')?.textContent || '').toBe('Bot');
    });

    test('uses shadcn empty loading state with spinner in feed tab', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    postsLoading: true,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');

        await waitForCondition(() => (document.body.textContent || '').includes('Cargando notas'));
        expect(document.body.textContent || '').not.toContain('Notas');

        const feedEmpty = document.body.querySelector('.nostr-profile-posts-empty[data-slot="empty"]') as HTMLElement | null;
        expect(feedEmpty).not.toBeNull();
        if (!feedEmpty) {
            throw new Error('Expected feed empty state to be present');
        }
        expect(feedEmpty.querySelector('[aria-label="Loading"]')).not.toBeNull();
        expect(feedEmpty.textContent || '').toContain('Cargando notas');

        const centeredLoading = document.body.querySelector('.nostr-profile-posts-empty-state') as HTMLElement | null;
        expect(centeredLoading).not.toBeNull();
        expect(centeredLoading?.contains(feedEmpty)).toBe(true);
    });

    test('renders feed and network loading states in english when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    postsLoading: true,
                    networkLoading: true,
                    followers: [],
                    follows: [],
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => (document.body.textContent || '').includes('Loading notes'));
        expect(document.body.textContent || '').toContain('Loading notes');
        expect(document.body.textContent || '').toContain('Recovering notes from Alice.');

        await selectTab('Followers');
        await waitForCondition(() => (document.body.textContent || '').includes('Loading followers'));
        expect(document.body.textContent || '').toContain('Loading followers');
        expect(document.body.textContent || '').toContain('Recovering followers of Alice.');

        await selectTab('Following');
        await waitForCondition(() => (document.body.textContent || '').includes('Loading following'));
        expect(document.body.textContent || '').toContain('Loading following');
        expect(document.body.textContent || '').toContain('Recovering people followed by Alice.');
    });

    test('uses centered shadcn empty state without spinner when feed has no posts', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    posts: [],
                    postsLoading: false,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => (document.body.textContent || '').includes('No hay publicaciones recientes disponibles.'));

        const centeredEmpty = document.body.querySelector('.nostr-profile-posts-empty-state') as HTMLElement;
        expect(centeredEmpty).toBeDefined();

        const feedEmpty = document.body.querySelector('.nostr-profile-posts-empty[data-slot="empty"]') as HTMLElement;
        expect(feedEmpty).toBeDefined();
        expect(feedEmpty.querySelector('[aria-label="Loading"]')).toBeNull();
    });

    test('shows comment emoji on profile feed posts replied to by the viewer', async () => {
        const postId = 'e'.repeat(64);
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    posts: [{
                        id: postId,
                        pubkey: 'a'.repeat(64),
                        createdAt: 1_700_000_000,
                        content: 'perfil con respuesta propia',
                    }],
                    engagementByEventId: {
                        [postId]: {
                            replies: 1,
                            reactions: 0,
                            reposts: 0,
                            zaps: 0,
                            zapSats: 0,
                        },
                    },
                    viewerReplyByEventId: {
                        [postId]: {
                            eventId: postId,
                            replyEventId: 'f'.repeat(64),
                            createdAt: 1_700_000_100,
                        },
                    },
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => Boolean(document.body.querySelector('button[aria-label="Responder (1)"]')));

        const replyButton = document.body.querySelector('button[aria-label="Responder (1)"]') as HTMLButtonElement | null;
        expect(replyButton).not.toBeNull();
        expect(replyButton?.textContent || '').toContain('💬');
    });

    test('uses shadcn empty loading state with spinner in followers/following tabs', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    follows: [],
                    followers: [],
                    networkLoading: true,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Seguidores');
        await waitForCondition(() => (document.body.textContent || '').includes('Cargando seguidores'));

        const followersEmpty = document.body.querySelector('[data-slot="empty"]') as HTMLElement;
        expect(followersEmpty).toBeDefined();
        expect(followersEmpty.querySelector('[aria-label="Loading"]')).not.toBeNull();

        await selectTab('Siguiendo');
        await waitForCondition(() => (document.body.textContent || '').includes('Cargando seguidos'));

        const followingEmpty = document.body.querySelector('[data-slot="empty"]') as HTMLElement;
        expect(followingEmpty).toBeDefined();
        expect(followingEmpty.querySelector('[aria-label="Loading"]')).not.toBeNull();
    });

    test('uses centered shadcn empty state without spinner in followers/following tabs', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    follows: [],
                    followers: [],
                    networkLoading: false,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Seguidores');
        await waitForCondition(() => (document.body.textContent || '').includes('Sin seguidores visibles.'));

        const followersCenteredEmpty = document.body.querySelector('.nostr-profile-network-empty-state') as HTMLElement;
        expect(followersCenteredEmpty).toBeDefined();

        const followersEmpty = document.body.querySelector('.nostr-profile-network-empty[data-slot="empty"]') as HTMLElement;
        expect(followersEmpty).toBeDefined();
        expect(followersEmpty.querySelector('[aria-label="Loading"]')).toBeNull();

        await selectTab('Siguiendo');
        await waitForCondition(() => (document.body.textContent || '').includes('Sin seguidos visibles.'));

        const followingCenteredEmpty = document.body.querySelector('.nostr-profile-network-empty-state') as HTMLElement;
        expect(followingCenteredEmpty).toBeDefined();

        const followingEmpty = document.body.querySelector('.nostr-profile-network-empty[data-slot="empty"]') as HTMLElement;
        expect(followingEmpty).toBeDefined();
        expect(followingEmpty.querySelector('[aria-label="Loading"]')).toBeNull();
    });

    test('shows followers and following lists under their own tabs', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        await selectTab('Seguidores');

        await waitForCondition(() => (document.body.textContent || '').includes('Dave'));
        const activeFollowersPanel = document.body.querySelector('[data-slot="tabs-content"][data-state="active"]') as HTMLElement;
        const followerItems = activeFollowersPanel.querySelectorAll('.nostr-profile-network-list [data-slot="item"]');
        expect(followerItems.length).toBeGreaterThan(0);
        expect(activeFollowersPanel.querySelectorAll('.nostr-profile-network-list [data-slot="separator"]')).toHaveLength(0);
        expect(Array.from(followerItems).every((item) => item.getAttribute('data-variant') === 'outline')).toBe(true);
        const followerDescriptions = Array.from(document.body.querySelectorAll('.nostr-profile-network-list [data-slot="item-description"]'))
            .map((node) => (node.textContent || '').trim())
            .filter((value) => value.length > 0);
        expect(followerDescriptions.some((value) => value.startsWith('npub1'))).toBe(true);

        await selectTab('Siguiendo');

        await waitForCondition(() => {
            const text = document.body.textContent || '';
            return text.includes('Bob') && text.includes('Carol');
        });
        const activeFollowingPanel = document.body.querySelector('[data-slot="tabs-content"][data-state="active"]') as HTMLElement;
        const followingItems = activeFollowingPanel.querySelectorAll('.nostr-profile-network-list [data-slot="item"]');
        expect(followingItems.length).toBeGreaterThan(0);
        expect(activeFollowingPanel.querySelectorAll('.nostr-profile-network-list [data-slot="separator"]')).toHaveLength(0);
        expect(Array.from(followingItems).every((item) => item.getAttribute('data-variant') === 'outline')).toBe(true);
        const followingDescriptions = Array.from(document.body.querySelectorAll('.nostr-profile-network-list [data-slot="item-description"]'))
            .map((node) => (node.textContent || '').trim())
            .filter((value) => value.length > 0);
        expect(followingDescriptions.some((value) => value.startsWith('npub1'))).toBe(true);
    });

    test('shows active profile relay suggestions in information tab', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    relaySuggestionsByType: {
                        nip65Both: ['wss://relay.both.example'],
                        nip65Read: ['wss://relay.read.example'],
                        nip65Write: ['wss://relay.write.example'],
                        dmInbox: ['wss://relay.dm.example'],
                        search: [],
                    },
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Información');
        await waitForCondition(() => (document.body.textContent || '').includes('wss://relay.both.example'));

        const text = document.body.textContent || '';
        expect(text).toContain('Relays declarados');
        expect(text).toContain('wss://relay.both.example');
        expect(text).toContain('wss://relay.read.example');
        expect(text).toContain('wss://relay.write.example');
        expect(text).toContain('wss://relay.dm.example');
        expect(text).toContain('NIP-65 read+write');
        expect(text).toContain('NIP-65 read');
        expect(text).toContain('NIP-65 write');
        expect(text).toContain('NIP-17 DM inbox');

        const relaySectionTitle = Array.from(document.body.querySelectorAll('.nostr-profile-info-section h5'))
            .find((node) => (node.textContent || '').trim() === 'Relays declarados') as HTMLElement | undefined;
        expect(relaySectionTitle?.className).toContain('nostr-profile-info-section-title');

        const relayUrlTitle = Array.from(document.body.querySelectorAll('.nostr-profile-info-section [data-slot="item-title"]'))
            .find((node) => (node.textContent || '').includes('wss://relay.both.example')) as HTMLElement | undefined;
        expect(relayUrlTitle?.className).toContain('nostr-profile-info-section-value');
    });

    test('keeps declared relay section typography aligned with information rows', () => {
        expect(overlayStyles).toMatch(/\.nostr-profile-info\s+\.nostr-profile-info-section-title\s*\{[^}]*font-size:\s*0\.75rem;[^}]*font-weight:\s*500;[^}]*color:\s*var\(--muted-foreground\)/s);
        expect(overlayStyles).toMatch(/\.nostr-profile-info\s+\.nostr-profile-info-section-value\s*\{[^}]*font-size:\s*0\.82rem;[^}]*font-weight:\s*400;[^}]*line-height:\s*1\.45;[^}]*color:\s*var\(--card-foreground\)/s);
    });

    test('keeps profile information section backgrounds without visible borders', () => {
        expect(overlayStyles).toMatch(/\.nostr-profile-info-row,\s*\.nostr-profile-info-section\s*\{[^}]*border:\s*none;[^}]*background:\s*color-mix\(in oklab, var\(--card\) 94%, transparent\)/s);
    });

    test('uses the profile editor preview surface color for the profile dialog', () => {
        expect(overlayStyles).toMatch(/\.nostr-profile-dialog\s*\{[^}]*background:\s*color-mix\(in oklab, var\(--muted\) 30%, var\(--background\)\)/s);
        expect(overlayStyles).toMatch(/\.nostr-profile-dialog-sticky-shell\s*\{[^}]*background:\s*color-mix\(in oklab, var\(--muted\) 30%, var\(--background\)\)/s);
    });

    test('fires callbacks to add one relay or all relay suggestions', async () => {
        const onAddRelaySuggestion = vi.fn();
        const onAddAllRelaySuggestions = vi.fn();
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    relaySuggestionsByType: {
                        nip65Both: ['wss://relay.both.example'],
                        nip65Read: ['wss://relay.both.example', 'wss://relay.read.example'],
                        nip65Write: ['wss://relay.both.example'],
                        dmInbox: ['wss://relay.dm.example'],
                        search: [],
                    },
                    onAddRelaySuggestion,
                    onAddAllRelaySuggestions,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Información');
        await waitForCondition(() => document.body.querySelector('button[aria-label="Añadir relay wss://relay.both.example"]') !== null);

        const addSingleButton = document.body.querySelector('button[aria-label="Añadir relay wss://relay.both.example"]') as HTMLButtonElement;
        expect(addSingleButton).toBeDefined();

        await act(async () => {
            addSingleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onAddRelaySuggestion).toHaveBeenCalledTimes(1);
        expect(onAddRelaySuggestion).toHaveBeenCalledWith('wss://relay.both.example', ['nip65Both', 'nip65Read', 'nip65Write']);

        const addAllButton = document.body.querySelector('button[aria-label="Añadir todos los relays declarados"]') as HTMLButtonElement;
        expect(addAllButton).toBeDefined();

        await act(async () => {
            addAllButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onAddAllRelaySuggestions).toHaveBeenCalledTimes(1);
        const payload = onAddAllRelaySuggestions.mock.calls[0]?.[0] as Array<{ relayUrl: string }>;
        expect(payload.map((entry) => entry.relayUrl)).toEqual([
            'wss://relay.both.example',
            'wss://relay.dm.example',
            'wss://relay.read.example',
        ]);
    });

    test('shows follow action in network tabs and allows unfollow from following state', async () => {
        const onFollowProfile = vi.fn(() => new Promise<void>(() => {}));
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    ownerPubkey: 'f'.repeat(64),
                    ownerFollows: ['b'.repeat(64)],
                    onFollowProfile,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Seguidores');
        await waitForCondition(() => (document.body.textContent || '').includes('Dave'));

        const followDaveButton = document.body.querySelector('button[aria-label="Seguir a Dave"]') as HTMLButtonElement;
        expect(followDaveButton).toBeDefined();
        expect(followDaveButton.disabled).toBe(false);
        expect((followDaveButton.textContent || '').trim()).toBe('Seguir');

        await act(async () => {
            followDaveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onFollowProfile).toHaveBeenCalledTimes(1);
        expect(onFollowProfile).toHaveBeenCalledWith('d'.repeat(64));
        expect(followDaveButton.disabled).toBe(true);
        expect((followDaveButton.textContent || '').trim()).toBe('Siguiendo');

        await selectTab('Siguiendo');
        await waitForCondition(() => {
            const text = document.body.textContent || '';
            return text.includes('Bob') && text.includes('Carol');
        });

        const followedBobButton = document.body.querySelector('button[aria-label="Dejar de seguir a Bob"]') as HTMLButtonElement;
        const followCarolButton = document.body.querySelector('button[aria-label="Seguir a Carol"]') as HTMLButtonElement;
        expect(followedBobButton).toBeDefined();
        expect(followedBobButton.disabled).toBe(false);
        expect((followedBobButton.textContent || '').trim()).toBe('Siguiendo');
        expect(followCarolButton).toBeDefined();
        expect(followCarolButton.disabled).toBe(false);
        expect((followCarolButton.textContent || '').trim()).toBe('Seguir');

        await act(async () => {
            followedBobButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onFollowProfile).toHaveBeenCalledTimes(2);
        expect(onFollowProfile).toHaveBeenLastCalledWith('b'.repeat(64));
        expect(followedBobButton.disabled).toBe(true);
        expect((followedBobButton.textContent || '').trim()).toBe('Siguiendo');
    });

    test('shows follow action in header for the active profile and allows unfollow', async () => {
        const onFollowProfile = vi.fn(() => new Promise<void>(() => {}));
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    ownerPubkey: 'f'.repeat(64),
                    onFollowProfile,
                })}
            />
        );
        mounted.push(rendered);

        const followAliceButton = document.body.querySelector('button[aria-label="Seguir a Alice"]') as HTMLButtonElement;
        expect(followAliceButton).toBeDefined();
        expect(followAliceButton.disabled).toBe(false);
        expect((followAliceButton.textContent || '').trim()).toBe('Seguir');

        await act(async () => {
            followAliceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onFollowProfile).toHaveBeenCalledTimes(1);
        expect(onFollowProfile).toHaveBeenCalledWith('a'.repeat(64));
        expect(followAliceButton.disabled).toBe(true);
        expect((followAliceButton.textContent || '').trim()).toBe('Siguiendo');

        const rerendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    ownerPubkey: 'f'.repeat(64),
                    ownerFollows: ['a'.repeat(64)],
                    onFollowProfile,
                })}
            />
        );
        mounted.push(rerendered);

        const followingAliceButton = rerendered.container.querySelector('button[aria-label="Dejar de seguir a Alice"]') as HTMLButtonElement;
        expect(followingAliceButton).toBeDefined();
        expect(followingAliceButton.disabled).toBe(false);
        expect(followingAliceButton.getAttribute('data-variant')).toBe('outline');
        expect(followingAliceButton.getAttribute('data-size')).toBe('xs');

        await act(async () => {
            followingAliceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onFollowProfile).toHaveBeenCalledTimes(2);
        expect(onFollowProfile).toHaveBeenLastCalledWith('a'.repeat(64));
        expect(followingAliceButton.disabled).toBe(true);
        expect((followingAliceButton.textContent || '').trim()).toBe('Siguiendo');
    });

    test('shows icon-only send message action in header when direct messages are available', async () => {
        const onSendMessage = vi.fn();
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    ownerPubkey: 'f'.repeat(64),
                    onSendMessage,
                })}
            />
        );
        mounted.push(rendered);

        const messageAliceButton = document.body.querySelector('button[aria-label="Enviar mensaje a Alice"]') as HTMLButtonElement;
        expect(messageAliceButton).not.toBeNull();
        expect((messageAliceButton.textContent || '').trim()).toBe('');
        expect(messageAliceButton.getAttribute('data-variant')).toBe('outline');
        expect(messageAliceButton.getAttribute('data-size')).toBe('icon-xs');

        await act(async () => {
            messageAliceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSendMessage).toHaveBeenCalledTimes(1);
        expect(onSendMessage).toHaveBeenCalledWith('a'.repeat(64));

        const ownProfile = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    ownerPubkey: 'a'.repeat(64),
                    onSendMessage,
                })}
            />
        );
        mounted.push(ownProfile);

        expect(ownProfile.container.querySelector('button[aria-label="Enviar mensaje a Alice"]')).toBeNull();
    });

    test('shows action menu in network tabs and executes copy, message, and details actions', async () => {
        const onSelectProfile = vi.fn();
        const onCopyNpub = vi.fn();
        const onSendMessage = vi.fn();
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    onSelectProfile,
                    onCopyNpub,
                    onSendMessage,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Seguidores');
        await waitForCondition(() => (document.body.textContent || '').includes('Dave'));

        const actionsButton = document.body.querySelector('button[aria-label="Abrir acciones para Dave"]') as HTMLButtonElement;
        expect(actionsButton).toBeDefined();

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitForCondition(() => (document.body.textContent || '').includes('Copiar npub'));
        const menuItems = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]'));
        const copyItem = menuItems.find((item) => (item.textContent || '').trim() === 'Copiar npub') as HTMLElement;
        const messageItem = menuItems.find((item) => (item.textContent || '').trim() === 'Enviar mensaje') as HTMLElement;
        const detailsItem = menuItems.find((item) => (item.textContent || '').trim() === 'Ver detalles') as HTMLElement;

        expect(copyItem).toBeDefined();
        expect(messageItem).toBeDefined();
        expect(detailsItem).toBeDefined();

        await act(async () => {
            copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const copiedNpub = onCopyNpub.mock.calls[0]?.[0] as string;
        expect(copiedNpub.startsWith('npub1')).toBe(true);

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitForCondition(() => (document.body.textContent || '').includes('Enviar mensaje'));
        const messageMenuItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Enviar mensaje'
        ) as HTMLElement;
        await act(async () => {
            messageMenuItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onSendMessage).toHaveBeenCalledWith('d'.repeat(64));

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitForCondition(() => (document.body.textContent || '').includes('Ver detalles'));
        const detailsMenuItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Ver detalles'
        ) as HTMLElement;
        await act(async () => {
            detailsMenuItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onSelectProfile).toHaveBeenCalledWith('d'.repeat(64));
    });

    test('keeps banner in the active scroll area and pins identity with tabs', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const scrollPanel = document.body.querySelector('.nostr-profile-tab-panel-scroll') as HTMLElement;
        const bannerShell = document.body.querySelector('.nostr-profile-dialog-banner-shell') as HTMLElement;
        const stickyShell = document.body.querySelector('.nostr-profile-dialog-sticky-shell') as HTMLElement;
        const header = document.body.querySelector('.nostr-dialog-header') as HTMLElement;
        const tabsList = document.body.querySelector('[data-slot="tabs-list"]') as HTMLElement;

        expect(scrollPanel).toBeDefined();
        expect(scrollPanel.style.scrollbarGutter).toBe('stable');
        expect(scrollPanel.style.height).toBe('100%');
        expect(bannerShell).toBeDefined();
        expect(stickyShell).toBeDefined();
        expect(header).toBeDefined();
        expect(tabsList).toBeDefined();
        expect(scrollPanel.contains(bannerShell)).toBe(true);
        expect(scrollPanel.contains(stickyShell)).toBe(true);
        expect(stickyShell.contains(header)).toBe(true);
        expect(stickyShell.contains(tabsList)).toBe(true);
        expect((bannerShell.compareDocumentPosition(stickyShell) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
        expect(overlayStyles).toMatch(/\.nostr-profile-dialog-sticky-shell\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*z-index:\s*2/s);
        expect(overlayStyles).toMatch(/\.nostr-profile-tab-panel-scroll\s*\{[^}]*overflow-y:\s*auto/s);

        await selectTab('Feed');
        expect(document.body.querySelector('.nostr-profile-tab-panel-scroll')).toBe(scrollPanel);
        await selectTab('Seguidores');
        expect(document.body.querySelector('.nostr-profile-tab-panel-scroll')).toBe(scrollPanel);
        await selectTab('Siguiendo');
        expect(document.body.querySelector('.nostr-profile-tab-panel-scroll')).toBe(scrollPanel);
    });

    test('restores the previous scroll position when returning to a profile tab', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const scrollPanel = document.body.querySelector('.nostr-profile-tab-panel-scroll') as HTMLElement;
        expect(scrollPanel).toBeDefined();

        scrollPanel.scrollTop = 180;
        await act(async () => {
            scrollPanel.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        await selectTab('Feed');
        expect(scrollPanel.scrollTop).toBe(0);

        scrollPanel.scrollTop = 260;
        await act(async () => {
            scrollPanel.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        await selectTab('Información');
        expect(scrollPanel.scrollTop).toBe(180);

        await selectTab('Feed');
        expect(scrollPanel.scrollTop).toBe(260);
    });

    test('resets saved tab scroll when the dialog changes profile', async () => {
        const rendered = await renderElement(<OccupantProfileDialog {...buildProps()} />);
        mounted.push(rendered);

        const scrollPanel = document.body.querySelector('.nostr-profile-tab-panel-scroll') as HTMLElement;
        expect(scrollPanel).toBeDefined();

        scrollPanel.scrollTop = 220;
        await act(async () => {
            scrollPanel.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        const nextPubkey = 'e'.repeat(64);
        await act(async () => {
            rendered.root.render(
                <OccupantProfileDialog
                    {...buildProps({
                        pubkey: nextPubkey,
                        profile: {
                            pubkey: nextPubkey,
                            displayName: 'Erin',
                        },
                    })}
                />
            );
        });

        expect(scrollPanel.scrollTop).toBe(0);

        await selectTab('Feed');
        expect(scrollPanel.scrollTop).toBe(0);
    });

    test('renders inline media previews for image and video URLs in feed posts', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    posts: [
                        {
                            id: 'post-media-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 1_700_000_000,
                            content: 'Imagen https://example.com/photo.jpg y video https://example.com/clip.mp4',
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => document.body.querySelector('article') !== null);

        expect(document.body.querySelector('time[datetime]')).not.toBeNull();

        const image = document.body.querySelector('img[src="https://example.com/photo.jpg"]');
        const video = document.body.querySelector('video[src="https://example.com/clip.mp4"]');
        const link = document.body.querySelector('a[href="https://example.com/photo.jpg"]');

        expect(image).toBeDefined();
        expect(video).toBeDefined();
        expect(link).toBeNull();
    });

    test('renders a stable load-more button for additional profile posts', async () => {
        const onLoadMorePosts = vi.fn(async () => {});
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    hasMorePosts: true,
                    onLoadMorePosts,
                    posts: [
                        {
                            id: 'post-load-more-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 1_700_000_000,
                            content: 'Primera nota',
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        const loadMoreButton = document.body.querySelector('[data-testid="profile-load-more-posts"]') as HTMLButtonElement | null;
        expect(loadMoreButton).not.toBeNull();

        await act(async () => {
            loadMoreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onLoadMorePosts).toHaveBeenCalledTimes(1);
    });

    test('shows a retry empty state instead of raw internal server errors in the feed tab', async () => {
        const onRetryPosts = vi.fn(async () => {});
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    posts: [],
                    postsLoading: false,
                    postsError: 'Internal server error',
                    onRetryPosts,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');

        const text = document.body.textContent || '';
        expect(text).not.toContain('Internal server error');
        expect(text).toContain('No se pudo cargar el feed');
        expect(text).toContain('Reintentar');

        const retryButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Reintentar')
        ) as HTMLButtonElement | undefined;
        expect(retryButton).toBeDefined();

        await act(async () => {
            retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRetryPosts).toHaveBeenCalledTimes(1);
    });

    test('keeps loaded feed posts visible and shows retry CTA instead of raw feed errors', async () => {
        const onRetryPosts = vi.fn(async () => {});
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    posts: [
                        {
                            id: 'post-with-error-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 1_700_000_000,
                            content: 'Nota ya cargada',
                        },
                    ],
                    postsLoading: false,
                    postsError: 'Request timed out after 10000ms',
                    onRetryPosts,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => (document.body.textContent || '').includes('Nota ya cargada'));

        const activePanel = document.body.querySelector('[data-slot="tabs-content"][data-state="active"]') as HTMLElement;
        expect(activePanel.textContent || '').toContain('Nota ya cargada');
        expect(activePanel.textContent || '').not.toContain('Request timed out after 10000ms');
        expect(activePanel.textContent || '').toContain('No se pudo cargar el feed');

        const retryButton = Array.from(activePanel.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Reintentar')
        ) as HTMLButtonElement | undefined;
        expect(retryButton).toBeDefined();

        await act(async () => {
            retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onRetryPosts).toHaveBeenCalledTimes(1);
    });

    test('shows a retry empty state instead of raw network errors in follower tabs', async () => {
        const onRetryNetwork = vi.fn(async () => {});
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    follows: [],
                    followers: [],
                    networkLoading: false,
                    networkError: 'Request timed out after 10000ms',
                    onRetryNetwork,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Seguidores');

        let activePanel = document.body.querySelector('[data-slot="tabs-content"][data-state="active"]') as HTMLElement;
        expect(activePanel.textContent || '').not.toContain('Request timed out after 10000ms');
        expect(activePanel.textContent || '').toContain('No se pudo cargar la red social');
        expect(activePanel.textContent || '').toContain('Reintentar');

        let retryButton = Array.from(activePanel.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Reintentar')
        ) as HTMLButtonElement | undefined;
        expect(retryButton).toBeDefined();

        await act(async () => {
            retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onRetryNetwork).toHaveBeenCalledTimes(1);

        await selectTab('Siguiendo');

        activePanel = document.body.querySelector('[data-slot="tabs-content"][data-state="active"]') as HTMLElement;
        expect(activePanel.textContent || '').not.toContain('Request timed out after 10000ms');
        expect(activePanel.textContent || '').toContain('No se pudo cargar la red social');

        retryButton = Array.from(activePanel.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Reintentar')
        ) as HTMLButtonElement | undefined;
        expect(retryButton).toBeDefined();

        await act(async () => {
            retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onRetryNetwork).toHaveBeenCalledTimes(2);
    });

    test('keeps loaded network lists visible and shows retry CTA instead of raw network errors', async () => {
        const onRetryNetwork = vi.fn(async () => {});
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    networkError: 'Request timed out after 10000ms',
                    onRetryNetwork,
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Seguidores');

        let activePanel = document.body.querySelector('[data-slot="tabs-content"][data-state="active"]') as HTMLElement;
        expect(activePanel.textContent || '').toContain('Dave');
        expect(activePanel.textContent || '').not.toContain('Request timed out after 10000ms');
        expect(activePanel.textContent || '').toContain('No se pudo cargar la red social');

        let retryButton = Array.from(activePanel.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Reintentar')
        ) as HTMLButtonElement | undefined;
        expect(retryButton).toBeDefined();

        await act(async () => {
            retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onRetryNetwork).toHaveBeenCalledTimes(1);

        await selectTab('Siguiendo');

        activePanel = document.body.querySelector('[data-slot="tabs-content"][data-state="active"]') as HTMLElement;
        expect(activePanel.textContent || '').toContain('Bob');
        expect(activePanel.textContent || '').not.toContain('Request timed out after 10000ms');
        expect(activePanel.textContent || '').toContain('No se pudo cargar la red social');

        retryButton = Array.from(activePanel.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Reintentar')
        ) as HTMLButtonElement | undefined;
        expect(retryButton).toBeDefined();

        await act(async () => {
            retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onRetryNetwork).toHaveBeenCalledTimes(2);
    });

    test('keeps a small inset around feed note cards so borders are not clipped', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    posts: [
                        {
                            id: 'post-border-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 1_700_000_000,
                            content: 'Nota con borde visible',
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        const postList = document.body.querySelector('[data-testid="profile-post-list"]') as HTMLElement | null;
        expect(postList).not.toBeNull();
        expect(postList?.className).toContain('px-1');
        expect(postList?.className).toContain('pt-1');
    });

    test('clicking a post hashtag emits callback to open agora hashtag feed', async () => {
        const onSelectHashtag = vi.fn();
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    onSelectHashtag,
                    posts: [
                        {
                            id: 'post-hashtag-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 1_700_000_000,
                            content: 'Vamos #NostrCity',
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => document.body.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') !== null);

        const hashtagButton = document.body.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') as HTMLButtonElement;
        expect(hashtagButton).toBeDefined();

        await act(async () => {
            hashtagButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectHashtag).toHaveBeenCalledWith('nostrcity');
    });

    test('renders profile mentions with resolved names and opens profile callback on click', async () => {
        const mentionPubkey = 'e'.repeat(64);
        const mentionNprofile = nip19.nprofileEncode({ pubkey: mentionPubkey });
        const onSelectProfile = vi.fn();

        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    onSelectProfile,
                    profilesByPubkey: {
                        [mentionPubkey]: {
                            pubkey: mentionPubkey,
                            displayName: 'Elena Mention',
                        },
                    },
                    posts: [
                        {
                            id: 'post-mention-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 1_700_000_000,
                            content: `hola nostr:${mentionNprofile}`,
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => document.body.querySelector('button[aria-label="Abrir perfil de Elena Mention"]') !== null);

        const mentionButton = document.body.querySelector('button[aria-label="Abrir perfil de Elena Mention"]') as HTMLButtonElement;
        expect(mentionButton).toBeDefined();

        await act(async () => {
            mentionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectProfile).toHaveBeenCalledWith(mentionPubkey);
    });

    test('renders nevent references as embedded quote cards inside profile posts', async () => {
        const referencedEventId = '9'.repeat(64);
        const referencedAuthorPubkey = '8'.repeat(64);
        const nevent = nip19.neventEncode({ id: referencedEventId, author: referencedAuthorPubkey });

        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    engagementByEventId: {
                        'post-event-ref-1': {
                            replies: 4,
                            reposts: 2,
                            reactions: 3,
                            zaps: 1,
                            zapSats: 210,
                        },
                        [referencedEventId]: {
                            replies: 1,
                            reposts: 0,
                            reactions: 7,
                            zaps: 0,
                            zapSats: 21,
                        },
                    },
                    profilesByPubkey: {
                        [referencedAuthorPubkey]: {
                            pubkey: referencedAuthorPubkey,
                            displayName: 'Nina Referencia',
                        },
                    },
                    eventReferencesById: {
                        [referencedEventId]: {
                            id: referencedEventId,
                            pubkey: referencedAuthorPubkey,
                            kind: 1,
                            created_at: 1700001000,
                            tags: [],
                            content: 'nota citada desde perfil',
                        },
                    },
                    posts: [
                        {
                            id: 'post-event-ref-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 1_700_000_000,
                            content: `cita nostr:${nevent}`,
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        await selectTab('Feed');
        await waitForCondition(() => (document.body.textContent || '').includes('Nina Referencia'));

        expect(document.body.querySelector('article')).not.toBeNull();
        expect(document.body.querySelector('time[datetime]')).not.toBeNull();
        expect(document.body.querySelectorAll('article').length).toBeGreaterThanOrEqual(2);
        expect(document.body.querySelectorAll('time[datetime]').length).toBeGreaterThanOrEqual(2);
        expect(document.body.querySelector('button[aria-label="Reaccionar (3)"]')).not.toBeNull();
        expect(document.body.querySelector('button[aria-label="Repostear (2)"]')).not.toBeNull();
        expect(document.body.querySelector('button[aria-label="Responder (4)"]')).not.toBeNull();
        expect(document.body.querySelector('[data-slot="button"][aria-label="Sats recibidos: 210"]')).not.toBeNull();
        expect(document.body.querySelector('button[aria-label="Abrir acciones para la nota post-event-ref-1"]')).not.toBeNull();
        expect(document.body.querySelector(`button[aria-label="Abrir acciones para la nota ${referencedEventId}"]`)).not.toBeNull();

        const text = document.body.textContent || '';
        expect(text).not.toContain('Nota referenciada');
        expect(text).toContain('Nina Referencia');
        expect(text).toContain('nota citada desde perfil');
    });

    test('moves full verification indicator to information tab and shows verified badge inside avatar', async () => {
        const rendered = await renderElement(
            <OccupantProfileDialog
                {...buildProps({
                    profile: {
                        pubkey: 'a'.repeat(64),
                        displayName: 'Alice',
                        nip05: 'alice@example.com',
                    },
                    verification: {
                        status: 'verified',
                        identifier: 'alice@example.com',
                        displayIdentifier: 'alice@example.com',
                        checkedAt: Date.now(),
                    },
                })}
            />
        );
        mounted.push(rendered);

        const nameRow = document.body.querySelector('.nostr-dialog-name') as HTMLElement;
        expect(nameRow).toBeDefined();
        expect(nameRow.textContent || '').not.toContain('alice@example.com');
        expect(nameRow.querySelector('.nostr-verified-badge')).toBeNull();

        const avatar = document.body.querySelector('.nostr-dialog-header [data-slot="avatar"]') as HTMLElement;
        expect(avatar).toBeDefined();
        expect(avatar.getAttribute('data-size')).toBe('lg');

        const verifiedBadge = document.body.querySelector('.nostr-dialog-header [data-slot="avatar-badge"]') as HTMLElement;
        expect(verifiedBadge).toBeDefined();
        expect(verifiedBadge.textContent || '').toBe('');

        const infoIdentifier = document.body.querySelector('.nostr-profile-info-list .nostr-nip05-text') as HTMLElement;
        expect(infoIdentifier).toBeDefined();
        expect(infoIdentifier.textContent || '').toContain('alice@example.com');
        expect(document.body.querySelector('.nostr-profile-info-list .nostr-nip05-chip')).toBeNull();
    });
});
