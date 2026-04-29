import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { encodeHexToNpub } from '../../nostr/npub';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import type { NostrProfile } from '../../nostr/types';
import { PeopleListTab } from './PeopleListTab';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const WAIT_TIMEOUT_MS = 8_000;
const WAIT_INTERVAL_MS = 20;

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    await waitFor(() => container.childNodes.length > 0);

    return { container, root };
}

async function waitFor(condition: () => boolean, timeoutMs = WAIT_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (condition()) {
            return;
        }

        if (vi.isFakeTimers()) {
            await vi.advanceTimersByTimeAsync(WAIT_INTERVAL_MS);
        } else {
            await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
        }
    }

    throw new Error(`Condition was not met in ${timeoutMs}ms`);
}

function makePubkey(index: number): string {
    return index.toString(16).padStart(64, '0');
}

function makePeople(count: number): string[] {
    return Array.from({ length: count }, (_, index) => makePubkey(index + 1));
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

describe('PeopleListTab', () => {
    test('shows person names, selected style, and emits onSelectPerson', async () => {
        const alice = makePubkey(1);
        const bob = makePubkey(2);
        const onSelectPerson = vi.fn();
        const profiles: Record<string, NostrProfile> = {
            [alice]: { pubkey: alice, displayName: 'Alice' },
            [bob]: { pubkey: bob, displayName: 'Bob' },
        };

        const rendered = await renderElement(
            <PeopleListTab
                people={[alice, bob]}
                profiles={profiles}
                emptyText="No hay personas"
                loading={false}
                selectedPubkey={bob}
                onSelectPerson={onSelectPerson}
            />
        );
        mounted.push(rendered);

        const buttons = Array.from(rendered.container.querySelectorAll('button[aria-pressed]')) as HTMLButtonElement[];
        expect(buttons).toHaveLength(2);
        expect(rendered.container.textContent || '').toContain('Alice');
        expect(rendered.container.textContent || '').toContain('Bob');
        const selectedButton = buttons[1];
        const firstButton = buttons[0];
        const avatars = rendered.container.querySelectorAll('[data-slot="avatar"]');
        expect(selectedButton).toBeDefined();
        expect(firstButton).toBeDefined();
        expect(Array.from(avatars).every((avatar) => avatar.getAttribute('data-size') === 'lg')).toBe(true);
        expect(selectedButton?.getAttribute('aria-pressed')).toBe('true');
        const items = rendered.container.querySelectorAll('[data-slot="item"]');
        expect(items).toHaveLength(2);
        expect(Array.from(items).every((item) => item.getAttribute('data-variant') === 'outline')).toBe(true);
        expect(items[1]?.getAttribute('data-active')).toBe('true');

        await act(async () => {
            firstButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectPerson).toHaveBeenCalledTimes(1);
        expect(onSelectPerson).toHaveBeenCalledWith(alice);
    });

    test('shows bot badge beside bot user names only', async () => {
        const alice = makePubkey(1);
        const bob = makePubkey(2);
        const profiles: Record<string, NostrProfile> = {
            [alice]: { pubkey: alice, displayName: 'Alice Bot', bot: true },
            [bob]: { pubkey: bob, displayName: 'Bob', bot: false },
        };

        const rendered = await renderElement(
            <PeopleListTab
                people={[alice, bob]}
                profiles={profiles}
                emptyText="No hay personas"
                loading={false}
                onSelectPerson={() => {}}
            />
        );
        mounted.push(rendered);

        const items = Array.from(rendered.container.querySelectorAll('[data-slot="item"]')) as HTMLElement[];
        const aliceItem = items.find((item) => (item.textContent || '').includes('Alice Bot'));
        const bobItem = items.find((item) => (item.textContent || '').includes('Bob'));

        expect(aliceItem?.querySelector('[data-slot="badge"]')?.textContent || '').toBe('Bot');
        expect(bobItem?.querySelector('[data-slot="badge"]')).toBeNull();
    });

    test('shows loading text and supports search input with clear action', async () => {
        const onSearchQueryChange = vi.fn();
        const rendered = await renderElement(
            <PeopleListTab
                people={[]}
                profiles={{}}
                emptyText="Sin resultados"
                loadingText="Cargando..."
                loading
                searchQuery="alice"
                onSearchQueryChange={onSearchQueryChange}
                searchAriaLabel="Buscar en personas"
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Cargando...');
        expect(rendered.container.querySelector('[data-testid="people-search-row"]')).not.toBeNull();
        const input = rendered.container.querySelector('input[aria-label="Buscar en personas"]') as HTMLInputElement;
        expect(input).toBeDefined();

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(input, 'alice2');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const clearButton = rendered.container.querySelector('button[aria-label="Limpiar busqueda"]') as HTMLButtonElement;
        expect(clearButton).toBeDefined();

        await act(async () => {
            clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSearchQueryChange).toHaveBeenCalled();
        expect(onSearchQueryChange).toHaveBeenLastCalledWith('');
    });

    test('keeps clear button disabled when search query is empty', async () => {
        const rendered = await renderElement(
            <PeopleListTab
                people={[]}
                profiles={{}}
                emptyText="Sin resultados"
                loading={false}
                searchQuery=""
                onSearchQueryChange={vi.fn()}
                searchAriaLabel="Buscar en personas"
            />
        );
        mounted.push(rendered);

        const clearButton = rendered.container.querySelector('button[aria-label="Limpiar busqueda"]') as HTMLButtonElement;
        expect(clearButton).toBeDefined();
        expect(clearButton.disabled).toBe(true);
    });

    test('shows people action menu for following rows and executes actions', { timeout: 15_000 }, async () => {
        const alice = makePubkey(1);
        const onSelectPerson = vi.fn();
        const onLocatePerson = vi.fn();
        const onCopyNpub = vi.fn();
        const onSendMessage = vi.fn();
        const onViewDetails = vi.fn();
        const onConfigureZapAmounts = vi.fn();

        const rendered = await renderElement(
            <PeopleListTab
                people={[alice]}
                profiles={{
                    [alice]: { pubkey: alice, displayName: 'Alice', lud16: 'alice@getalby.com' },
                }}
                emptyText="Sin resultados"
                loading={false}
                onSelectPerson={onSelectPerson}
                onLocatePerson={onLocatePerson}
                onCopyNpub={onCopyNpub}
                onSendMessage={onSendMessage}
                onViewDetails={onViewDetails}
                zapAmounts={[21, 128, 256]}
                onConfigureZapAmounts={onConfigureZapAmounts}
            />
        );
        mounted.push(rendered);

        const actionsButton = rendered.container.querySelector('button[aria-label="Abrir acciones para Alice"]') as HTMLButtonElement;
        expect(actionsButton).toBeDefined();

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Ubicar en el mapa'));
        const locateItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Ubicar en el mapa'
        ) as HTMLElement;
        expect(locateItem).toBeDefined();

        await act(async () => {
            locateItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onLocatePerson).toHaveBeenCalledWith(alice);
        expect(onSelectPerson).not.toHaveBeenCalled();

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Copiar npub'));
        const copyItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Copiar npub'
        ) as HTMLElement;

        await act(async () => {
            copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNpub).toHaveBeenCalledTimes(1);
        expect(onSelectPerson).not.toHaveBeenCalled();
        expect((onCopyNpub.mock.calls[0]?.[0] as string | undefined)?.startsWith('npub1')).toBe(true);

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));
        const messageItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Enviar mensaje'
        ) as HTMLElement;
        const detailsItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Ver detalles'
        ) as HTMLElement;

        await act(async () => {
            messageItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onSendMessage).toHaveBeenCalledWith(alice);

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => (document.body.textContent || '').includes('Ver detalles'));
        const detailsItemRefreshed = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Ver detalles'
        ) as HTMLElement;

        await act(async () => {
            detailsItemRefreshed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(detailsItem || detailsItemRefreshed).toBeDefined();
        expect(onViewDetails).toHaveBeenCalledWith(alice);

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Zap'));
        const zapSubmenuTrigger = Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).find((item) =>
            (item.textContent || '').trim() === 'Zap'
        ) as HTMLElement;
        expect(zapSubmenuTrigger).toBeDefined();

        await act(async () => {
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Configurar cantidades'));
        expect(document.body.textContent || '').toContain('21 sats');
        expect(document.body.textContent || '').toContain('128 sats');
        expect(document.body.textContent || '').toContain('256 sats');

        const configureItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Configurar cantidades'
        ) as HTMLElement;

        await act(async () => {
            configureItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onConfigureZapAmounts).toHaveBeenCalledTimes(1);
    });

    test('shows npub label and verified avatar badge without text in list rows', async () => {
        const alice = makePubkey(1);
        const aliceNpub = encodeHexToNpub(alice);

        const rendered = await renderElement(
            <PeopleListTab
                people={[alice]}
                profiles={{
                    [alice]: { pubkey: alice, displayName: 'Alice', nip05: '_@example.com' },
                }}
                verificationByPubkey={{
                    [alice]: {
                        status: 'verified',
                        identifier: '_@example.com',
                        displayIdentifier: 'example.com',
                        checkedAt: Date.now(),
                    },
                }}
                emptyText="Sin resultados"
                loading={false}
            />
        );
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).toContain('Alice');
        expect(content).not.toContain('example.com');
        expect(content).toContain(`${aliceNpub.slice(0, 14)}...${aliceNpub.slice(-6)}`);
        expect(content).not.toContain(`${alice.slice(0, 8)}...${alice.slice(-6)}`);

        const avatar = rendered.container.querySelector('[data-slot="avatar"]') as HTMLElement;
        expect(avatar.getAttribute('data-size')).toBe('lg');

        const verifiedBadge = rendered.container.querySelector('[data-slot="avatar-badge"][aria-label="NIP-05 verificado por DNS: example.com"]') as HTMLElement;
        expect(verifiedBadge).toBeDefined();
        expect(verifiedBadge.getAttribute('title')).toBe('NIP-05 verificado por DNS: example.com');
        expect(verifiedBadge.className).toContain('bg-green-600');
        expect(verifiedBadge.querySelector('.lucide-circle-check')).toBeDefined();
        expect(rendered.container.querySelector('.nostr-nip05-status-icon')).toBeNull();
    });

    test('shows warning avatar badge when nip05 is present but verification is still pending in list rows', async () => {
        const alice = makePubkey(9);

        const rendered = await renderElement(
            <PeopleListTab
                people={[alice]}
                profiles={{
                    [alice]: { pubkey: alice, displayName: 'Alice', nip05: '_@example.com' },
                }}
                emptyText="Sin resultados"
                loading={false}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Alice');
        expect(rendered.container.querySelector('.nostr-nip05-status-icon')).toBeNull();
        const warningBadge = rendered.container.querySelector('[data-slot="avatar-badge"][aria-label="NIP-05 pendiente de verificacion DNS: example.com"]') as HTMLElement;
        expect(warningBadge).toBeDefined();
        expect(warningBadge.querySelector('.lucide-triangle-alert')).toBeDefined();
    });

    test('shows copy action and zap submenu for followers rows', { timeout: 15_000 }, async () => {
        const bob = makePubkey(2);
        const onCopyNpub = vi.fn();
        const onZapPerson = vi.fn();

        const rendered = await renderElement(
            <PeopleListTab
                people={[bob]}
                profiles={{
                    [bob]: { pubkey: bob, displayName: 'Bob', lud16: 'bob@getalby.com' },
                }}
                emptyText="Sin resultados"
                loading={false}
                onCopyNpub={onCopyNpub}
                zapAmounts={[21, 128, 256]}
                onZapPerson={onZapPerson}
            />
        );
        mounted.push(rendered);

        const actionsButton = rendered.container.querySelector('button[aria-label="Abrir acciones para Bob"]') as HTMLButtonElement;
        expect(actionsButton).toBeDefined();

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Copiar npub'));

        const locateItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Ubicar en el mapa'
        );
        const zapSubmenuTrigger = Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).find((item) =>
            (item.textContent || '').trim() === 'Zap'
        );
        const copyItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Copiar npub'
        ) as HTMLElement;

        expect(locateItem).toBeUndefined();
        expect(zapSubmenuTrigger).toBeDefined();
        expect(copyItem).toBeDefined();

        await act(async () => {
            copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNpub).toHaveBeenCalledTimes(1);
        expect((onCopyNpub.mock.calls[0]?.[0] as string | undefined)?.startsWith('npub1')).toBe(true);

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const zapSubmenuTriggerRefreshed = Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).find((item) =>
            (item.textContent || '').trim() === 'Zap'
        ) as HTMLElement;

        await act(async () => {
            zapSubmenuTriggerRefreshed.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            zapSubmenuTriggerRefreshed.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            zapSubmenuTriggerRefreshed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('21 sats'));
        const zap21 = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === '21 sats'
        ) as HTMLElement;

        await act(async () => {
            zap21.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onZapPerson).toHaveBeenCalledWith(bob, 21);
    });

    test('hides zap submenu when profile has no lightning metadata', async () => {
        const alice = makePubkey(1);
        const rendered = await renderElement(
            <PeopleListTab
                people={[alice]}
                profiles={{
                    [alice]: { pubkey: alice, displayName: 'Alice' },
                }}
                emptyText="Sin resultados"
                loading={false}
                zapAmounts={[21, 128, 256]}
                onConfigureZapAmounts={vi.fn()}
                onZapPerson={vi.fn()}
            />
        );
        mounted.push(rendered);

        const actionsButton = rendered.container.querySelector('button[aria-label="Abrir acciones para Alice"]') as HTMLButtonElement;
        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const zapSubmenuTrigger = Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).find((item) =>
            (item.textContent || '').trim() === 'Zap'
        );

        expect(zapSubmenuTrigger).toBeUndefined();
    });

    test('shows follow action and allows toggling followed rows', async () => {
        const alice = makePubkey(1);
        const bob = makePubkey(2);
        const followDeferred = new Promise<void>(() => {});
        const onFollowPerson = vi.fn(() => followDeferred);

        const rendered = await renderElement(
            <PeopleListTab
                people={[alice, bob]}
                profiles={{
                    [alice]: { pubkey: alice, displayName: 'Alice' },
                    [bob]: { pubkey: bob, displayName: 'Bob' },
                }}
                emptyText="Sin resultados"
                loading={false}
                followedPubkeys={[bob]}
                onFollowPerson={onFollowPerson}
            />
        );
        mounted.push(rendered);

        const followAliceButton = rendered.container.querySelector('button[aria-label="Seguir a Alice"]') as HTMLButtonElement;
        const followedBobButton = rendered.container.querySelector('button[aria-label="Dejar de seguir a Bob"]') as HTMLButtonElement;

        expect(followAliceButton).toBeDefined();
        expect(followAliceButton.disabled).toBe(false);
        expect((followAliceButton.textContent || '').trim()).toBe('Seguir');

        expect(followedBobButton).toBeDefined();
        expect(followedBobButton.disabled).toBe(false);
        expect((followedBobButton.textContent || '').trim()).toBe('Siguiendo');

        await act(async () => {
            followedBobButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onFollowPerson).toHaveBeenCalledTimes(1);
        expect(onFollowPerson).toHaveBeenCalledWith(bob);
        expect(followedBobButton.disabled).toBe(true);
        expect((followedBobButton.textContent || '').trim()).toBe('Siguiendo');

        await act(async () => {
            followAliceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onFollowPerson).toHaveBeenCalledTimes(2);
        expect(onFollowPerson).toHaveBeenCalledWith(alice);
        expect(followAliceButton.disabled).toBe(true);
        expect((followAliceButton.textContent || '').trim()).toBe('Siguiendo');
    });

    test('moves followed person action into the context menu when requested', async () => {
        const bob = makePubkey(2);
        const onFollowPerson = vi.fn();

        const rendered = await renderElement(
            <PeopleListTab
                people={[bob]}
                profiles={{
                    [bob]: { pubkey: bob, displayName: 'Bob' },
                }}
                emptyText="Sin resultados"
                loading={false}
                followedPubkeys={[bob]}
                onFollowPerson={onFollowPerson}
                followActionPlacement="context"
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('button[aria-label="Dejar de seguir a Bob"]')).toBeNull();

        const actionsButton = rendered.container.querySelector('button[aria-label="Abrir acciones para Bob"]') as HTMLButtonElement;
        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Dejar de seguir a Bob'));
        const unfollowItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Dejar de seguir a Bob'
        ) as HTMLElement;

        await act(async () => {
            unfollowItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onFollowPerson).toHaveBeenCalledTimes(1);
        expect(onFollowPerson).toHaveBeenCalledWith(bob);
    });

    test('renders bordered people rows without separators', async () => {
        const people = [makePubkey(1), makePubkey(2), makePubkey(3)];
        const rendered = await renderElement(
            <PeopleListTab
                people={people}
                profiles={{}}
                emptyText="Sin resultados"
                loading={false}
            />
        );
        mounted.push(rendered);

        const items = rendered.container.querySelectorAll('[data-slot="item"]');
        expect(items).toHaveLength(3);
        expect(rendered.container.querySelectorAll('[data-slot="separator"]')).toHaveLength(0);
        expect(Array.from(items).every((item) => item.getAttribute('data-variant') === 'outline')).toBe(true);
    });

    test('virtualizes large people lists', async () => {
        const people = makePeople(400);
        const profiles: Record<string, NostrProfile> = {};
        for (const pubkey of people) {
            profiles[pubkey] = { pubkey, displayName: `Person ${pubkey.slice(-4)}` };
        }

        const rendered = await renderElement(
            <div style={{ height: '520px' }}>
                <PeopleListTab
                    people={people}
                    profiles={profiles}
                    emptyText="No hay personas"
                    loading={false}
                />
            </div>
        );
        mounted.push(rendered);

        const renderedItems = rendered.container.querySelectorAll('[data-slot="item"]');
        expect(renderedItems.length).toBeGreaterThan(0);
        expect(renderedItems.length).toBeLessThan(people.length);
    });

    test('loads more people on scroll and shows spinner footer while loading', async () => {
        vi.useFakeTimers();

        const people = makePeople(45);
        const profiles: Record<string, NostrProfile> = {};
        for (const pubkey of people) {
            profiles[pubkey] = { pubkey, displayName: `Person ${pubkey.slice(-4)}` };
        }

        try {
            const rendered = await renderElement(
                <div style={{ height: '420px' }}>
                    <PeopleListTab
                        people={people}
                        profiles={profiles}
                        emptyText="No hay personas"
                        loading={false}
                    />
                </div>
            );
            mounted.push(rendered);

            const initialRows = rendered.container.querySelectorAll('[data-slot="item"]');
            expect(initialRows.length).toBeLessThan(people.length);

            const scrollContainer = rendered.container.querySelector('.nostr-people-scroll-area') as HTMLDivElement;
            expect(scrollContainer).toBeDefined();

            Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 220 });
            Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 640 });
            Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 430, writable: true });

            await act(async () => {
                scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
            });

            expect(rendered.container.textContent || '').toContain('Cargando mas');

            await act(async () => {
                await vi.advanceTimersByTimeAsync(200);
            });

            const rowsAfterLoad = rendered.container.querySelectorAll('[data-slot="item"]');
            expect(rowsAfterLoad.length).toBeGreaterThan(initialRows.length);
        } finally {
            vi.useRealTimers();
        }
    });

    test('resets scroll position when filtered people change', async () => {
        const allPeople = makePeople(180);
        const filteredPeople = allPeople.slice(0, 130);
        const profiles: Record<string, NostrProfile> = {};
        for (const pubkey of allPeople) {
            profiles[pubkey] = { pubkey, displayName: `Person ${pubkey.slice(-4)}` };
        }

        const rendered = await renderElement(
            <div style={{ height: '420px' }}>
                <PeopleListTab
                    people={allPeople}
                    profiles={profiles}
                    emptyText="No hay personas"
                    loading={false}
                    searchQuery=""
                    onSearchQueryChange={vi.fn()}
                />
            </div>
        );
        mounted.push(rendered);

        const initialScrollContainer = rendered.container.querySelector('.nostr-people-scroll-area') as HTMLDivElement;
        expect(initialScrollContainer).toBeDefined();

        initialScrollContainer.scrollTop = 260;
        expect(initialScrollContainer.scrollTop).toBe(260);

        await act(async () => {
            rendered.root.render(
                <div style={{ height: '420px' }}>
                    <PeopleListTab
                        people={filteredPeople}
                        profiles={profiles}
                        emptyText="No hay personas"
                        loading={false}
                        searchQuery="abc"
                        onSearchQueryChange={vi.fn()}
                    />
                </div>
            );
        });

        const updatedScrollContainer = rendered.container.querySelector('.nostr-people-scroll-area') as HTMLDivElement;
        expect(updatedScrollContainer).toBeDefined();
        await waitFor(() => updatedScrollContainer.scrollTop === 0);
        expect(updatedScrollContainer.scrollTop).toBe(0);
    });

    test('renders english search and follow copy when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const alice = makePubkey(1);
        const bob = makePubkey(2);
        const rendered = await renderElement(
            <PeopleListTab
                people={[alice, bob]}
                profiles={{
                    [alice]: { pubkey: alice, displayName: 'Alice' },
                    [bob]: { pubkey: bob, displayName: 'Bob' },
                }}
                emptyText="No results"
                loading={false}
                searchQuery="alice"
                onSearchQueryChange={vi.fn()}
                searchAriaLabel="Search people"
                onFollowPerson={vi.fn()}
                onLocatePerson={vi.fn()}
                onCopyNpub={vi.fn()}
                onSendMessage={vi.fn()}
                onViewDetails={vi.fn()}
            />
        );
        mounted.push(rendered);

        const input = rendered.container.querySelector('input[aria-label="Search people"]') as HTMLInputElement;
        expect(input).toBeDefined();

        const followButton = rendered.container.querySelector('button[aria-label="Follow Alice"]') as HTMLButtonElement;
        expect(followButton).toBeDefined();
        expect((followButton.textContent || '').trim()).toBe('Follow');

        const actionsButton = rendered.container.querySelector('button[aria-label="Open actions for Alice"]') as HTMLButtonElement;
        expect(actionsButton).toBeDefined();
    });
});
