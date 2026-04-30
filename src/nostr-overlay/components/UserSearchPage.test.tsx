import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import { createNostrOverlayQueryClient } from '../query/query-client';
import { UserSearchPage } from './UserSearchPage';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                {element}
            </QueryClientProvider>
        );
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return {
        promise,
        resolve,
        reject,
    };
}

async function typeSearchValue(input: HTMLInputElement, value: string): Promise<void> {
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

async function flushDebounce(): Promise<void> {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
    });
}

async function waitForAssertion(assertion: () => void): Promise<void> {
    let lastError: unknown = null;
    for (let index = 0; index < 20; index += 1) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await act(async () => {
                if (vi.isFakeTimers()) {
                    await vi.advanceTimersByTimeAsync(0);
                }
                await Promise.resolve();
            });
        }
    }

    throw lastError;
}

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

describe('UserSearchPage', () => {
    test('debounces search calls by 300ms', async () => {
        vi.useFakeTimers();
        const onSearch = vi.fn(async () => ({ pubkeys: [], profiles: {} }));

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;
            expect(input).toBeDefined();

            await typeSearchValue(input, 'alice');

            expect(onSearch).not.toHaveBeenCalled();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(299);
            });

            expect(onSearch).not.toHaveBeenCalled();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(1);
            });

            expect(onSearch).toHaveBeenCalledTimes(1);
            expect(onSearch).toHaveBeenCalledWith('alice');
        } finally {
            vi.useRealTimers();
        }
    });

    test('renders search result rows', async () => {
        vi.useFakeTimers();
        const pubkey = 'a'.repeat(64);
        const profiles: Record<string, NostrProfile> = {
            [pubkey]: {
                pubkey,
                displayName: 'Alice',
            },
        };
        const onSearch = vi.fn(async () => ({
            pubkeys: [pubkey],
            profiles,
        }));

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;

            await typeSearchValue(input, 'alice');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Alice');
            });

            expect(rendered.container.querySelector('[data-slot="overlay-page-header"]')).not.toBeNull();
            expect(rendered.container.querySelector('[data-slot="item"]')).not.toBeNull();
            expect(rendered.container.querySelector(`[data-testid="person-actions-${pubkey}"]`)).not.toBeNull();
            expect(rendered.container.textContent || '').toContain(encodeHexToNpub(pubkey));
        } finally {
            vi.useRealTimers();
        }
    });

    test('renders verified badge inside large avatar for verified search results', async () => {
        vi.useFakeTimers();
        const pubkey = 'e'.repeat(64);
        const onSearch = vi.fn(async () => ({
            pubkeys: [pubkey],
            profiles: {
                [pubkey]: {
                    pubkey,
                    displayName: 'Elena',
                    nip05: '_@example.com',
                },
            },
        }));

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                    verificationByPubkey={{
                        [pubkey]: {
                            status: 'verified',
                            identifier: '_@example.com',
                            displayIdentifier: 'example.com',
                            checkedAt: Date.now(),
                        },
                    }}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;

            await typeSearchValue(input, 'elena');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Elena');
            });

            const row = Array.from(rendered.container.querySelectorAll('[data-slot="item"]')).find((item) =>
                (item.textContent || '').includes('Elena')
            ) as HTMLElement;
            expect(row).toBeDefined();

            const avatar = row.querySelector('[data-slot="avatar"]') as HTMLElement;
            expect(avatar).toBeDefined();
            expect(avatar.getAttribute('data-size')).toBe('lg');

            const verifiedBadge = row.querySelector('[data-slot="avatar-badge"][aria-label="NIP-05 verificado por DNS: example.com"]') as HTMLElement;
            expect(verifiedBadge).toBeDefined();
            expect(verifiedBadge.className).toContain('bg-green-600');
            expect(verifiedBadge.querySelector('.lucide-circle-check')).toBeDefined();
        } finally {
            vi.useRealTimers();
        }
    });

    test('shows warning avatar badge for non-verified search results', async () => {
        vi.useFakeTimers();
        const pubkey = 'f'.repeat(64);
        const onSearch = vi.fn(async () => ({
            pubkeys: [pubkey],
            profiles: {
                [pubkey]: {
                    pubkey,
                    displayName: 'Felix',
                    nip05: '_@example.com',
                },
            },
        }));

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;

            await typeSearchValue(input, 'felix');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Felix');
            });

            const row = Array.from(rendered.container.querySelectorAll('[data-slot="item"]')).find((item) =>
                (item.textContent || '').includes('Felix')
            ) as HTMLElement;
            expect(row).toBeDefined();
            expect(row.querySelector('.nostr-nip05-status-icon')).toBeNull();
            const warningBadge = row.querySelector('[data-slot="avatar-badge"][aria-label="NIP-05 pendiente de verificación DNS: example.com"]') as HTMLElement;
            expect(warningBadge).toBeDefined();
            expect(warningBadge.querySelector('.lucide-triangle-alert')).toBeDefined();
        } finally {
            vi.useRealTimers();
        }
    });

    test('calls onSelectUser when user row action is clicked', async () => {
        vi.useFakeTimers();
        const pubkey = 'b'.repeat(64);
        const onSelectUser = vi.fn();
        const onSearch = vi.fn(async () => ({
            pubkeys: [pubkey],
            profiles: {
                [pubkey]: { pubkey, name: 'Bob' },
            },
        }));

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={onSelectUser}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;

            await typeSearchValue(input, 'bob');
            await flushDebounce();

            let userRow: HTMLElement | null = null;
            await waitForAssertion(() => {
                const row = Array.from(rendered.container.querySelectorAll('[data-slot="item"]')).find((item) =>
                    (item.textContent || '').includes('Bob')
                ) as HTMLElement | null;
                userRow = row?.querySelector('button[aria-pressed]') as HTMLElement | null;
                expect(userRow).toBeDefined();
            });

            await act(async () => {
                userRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            expect(onSelectUser).toHaveBeenCalledTimes(1);
            expect(onSelectUser).toHaveBeenCalledWith(pubkey);
        } finally {
            vi.useRealTimers();
        }
    });

    test('renders message and follow actions in search results and toggles follow state', async () => {
        vi.useFakeTimers();
        const pubkey = 'd'.repeat(64);
        const onClose = vi.fn();
        const onMessageUser = vi.fn();
        const onFollowUser = vi.fn(() => new Promise<void>(() => {}));
        const onSearch = vi.fn(async () => ({
            pubkeys: [pubkey],
            profiles: {
                [pubkey]: { pubkey, displayName: 'Dora' },
            },
        }));

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={onClose}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                    onMessageUser={onMessageUser}
                    onFollowUser={onFollowUser}
                    followedPubkeys={[pubkey]}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;
            await typeSearchValue(input, 'dora');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Dora');
            });

            const actionsButton = rendered.container.querySelector(`[data-testid="person-actions-${pubkey}"]`) as HTMLButtonElement;
            const followButton = rendered.container.querySelector('button[aria-label="Dejar de seguir a Dora"]') as HTMLButtonElement;
            expect(actionsButton).toBeDefined();
            expect(followButton).toBeDefined();
            expect(followButton.disabled).toBe(false);
            expect((followButton.textContent || '').trim()).toBe('Siguiendo');

            await act(async () => {
                followButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            expect(onFollowUser).toHaveBeenCalledTimes(1);
            expect(onFollowUser).toHaveBeenCalledWith(pubkey);
            expect(onClose).not.toHaveBeenCalled();
            expect(followButton.disabled).toBe(true);
            expect((followButton.textContent || '').trim()).toBe('Siguiendo');
        } finally {
            vi.useRealTimers();
        }
    });

    test('shows loading and empty states while searching', async () => {
        vi.useFakeTimers();
        const deferred = createDeferred<{ pubkeys: string[]; profiles: Record<string, NostrProfile> }>();
        const onSearch = vi.fn(async () => deferred.promise);

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;

            await typeSearchValue(input, 'alice');
            await flushDebounce();

            expect(rendered.container.textContent || '').toContain('Buscando usuarios');

            await act(async () => {
                deferred.resolve({ pubkeys: [], profiles: {} });
                await Promise.resolve();
            });

            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Sin resultados');
            });
        } finally {
            vi.useRealTimers();
        }
    });

    test('renders english global search copy when ui language is en', async () => {
        vi.useFakeTimers();
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const onSearch = vi.fn(async () => ({ pubkeys: [], profiles: {} }));

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            expect(rendered.container.textContent || '').toContain('Search users globally');
            const input = rendered.container.querySelector('input[aria-label="Search users globally"]') as HTMLInputElement;
            expect(input?.getAttribute('placeholder')).toBe('Search by name, npub, or pubkey');

            await typeSearchValue(input, 'alice');
            await flushDebounce();

            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('No results');
            });
        } finally {
            vi.useRealTimers();
        }
    });

    test('query cache keeps per-term results isolated', async () => {
        vi.useFakeTimers();
        const alicePubkey = '1'.repeat(64);
        const bobPubkey = '2'.repeat(64);
        const onSearch = vi.fn(async (term: string) => {
            if (term === 'alice') {
                return {
                    pubkeys: [alicePubkey],
                    profiles: {
                        [alicePubkey]: { pubkey: alicePubkey, displayName: 'Alice' },
                    },
                };
            }

            return {
                pubkeys: [bobPubkey],
                profiles: {
                    [bobPubkey]: { pubkey: bobPubkey, displayName: 'Bob' },
                },
            };
        });

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;
            expect(input).toBeDefined();

            await typeSearchValue(input, 'alice');
            await flushDebounce();
            expect(onSearch).toHaveBeenCalledTimes(1);
            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Alice');
            });

            await typeSearchValue(input, 'bob');
            await flushDebounce();
            expect(onSearch).toHaveBeenCalledTimes(2);
            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Bob');
            });

            await typeSearchValue(input, 'alice');
            await flushDebounce();

            expect(onSearch).toHaveBeenCalledTimes(2);
            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Alice');
            });
        } finally {
            vi.useRealTimers();
        }
    });

    test('query state renders loading, error and data', async () => {
        vi.useFakeTimers();
        const pubkey = 'c'.repeat(64);
        const loading = createDeferred<{ pubkeys: string[]; profiles: Record<string, NostrProfile> }>();
        const onSearch = vi.fn(async (term: string) => {
            if (term === 'carol-loading') {
                return loading.promise;
            }

            if (term === 'error') {
                throw new Error('relay down');
            }

            return {
                pubkeys: [pubkey],
                profiles: {
                    [pubkey]: { pubkey, displayName: 'Carol' },
                },
            };
        });

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;
            expect(input).toBeDefined();

            await typeSearchValue(input, 'carol-loading');
            await flushDebounce();
            expect(rendered.container.textContent || '').toContain('Buscando usuarios');

            await act(async () => {
                loading.resolve({ pubkeys: [], profiles: {} });
                await Promise.resolve();
            });
            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Sin resultados');
            });

            await typeSearchValue(input, 'error');
            await flushDebounce();
            await act(async () => {
                for (let index = 0; index < 8; index += 1) {
                    vi.runOnlyPendingTimers();
                    await Promise.resolve();
                }
            });
            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('No se pudo buscar usuarios.');
            });

            await typeSearchValue(input, 'carol');
            await flushDebounce();
            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Carol');
            });
        } finally {
            vi.useRealTimers();
        }
    });

    test('race safety keeps newest query result visible', async () => {
        vi.useFakeTimers();
        const alicePubkey = 'a'.repeat(64);
        const bobPubkey = 'b'.repeat(64);
        const deferredByTerm: Record<string, Deferred<{ pubkeys: string[]; profiles: Record<string, NostrProfile> }>> = {
            alice: createDeferred(),
            bob: createDeferred(),
        };
        const onSearch = vi.fn(async (term: string) => {
            const deferred = deferredByTerm[term];
            if (!deferred) {
                throw new Error(`Missing deferred for term: ${term}`);
            }

            return deferred.promise;
        });

        try {
            const rendered = await renderElement(
                <UserSearchPage
                    onClose={() => {}}
                    onSearch={onSearch}
                    onSelectUser={() => {}}
                />
            );
            mounted.push(rendered);

            const input = rendered.container.querySelector('input[aria-label="Buscar usuarios globalmente"]') as HTMLInputElement;

            await typeSearchValue(input, 'alice');
            await flushDebounce();
            expect(onSearch).toHaveBeenCalledWith('alice');

            await typeSearchValue(input, 'bob');
            await flushDebounce();
            expect(onSearch).toHaveBeenCalledWith('bob');

            await act(async () => {
                const bobDeferred = deferredByTerm.bob;
                if (!bobDeferred) {
                    throw new Error('Missing deferred for bob');
                }

                bobDeferred.resolve({
                    pubkeys: [bobPubkey],
                    profiles: {
                        [bobPubkey]: { pubkey: bobPubkey, displayName: 'Bob' },
                    },
                });
                await Promise.resolve();
            });

            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Bob');
            });

            await act(async () => {
                const aliceDeferred = deferredByTerm.alice;
                if (!aliceDeferred) {
                    throw new Error('Missing deferred for alice');
                }

                aliceDeferred.resolve({
                    pubkeys: [alicePubkey],
                    profiles: {
                        [alicePubkey]: { pubkey: alicePubkey, displayName: 'Alice' },
                    },
                });
                await Promise.resolve();
            });

            await waitForAssertion(() => {
                expect(rendered.container.textContent || '').toContain('Bob');
                expect(rendered.container.textContent || '').not.toContain('Alice');
            });
        } finally {
            vi.useRealTimers();
        }
    });
});
