/** @vitest-environment jsdom */

import { act, createElement, useEffect, useMemo, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createNostrOverlayQueryClient } from './query-client';
import { createDmReadStateStorage, fallbackStorage } from './dm-storage';
import { useDirectMessagesController, type DirectMessagesService } from './direct-messages.query';
import { nostrOverlayQueryKeys } from './keys';

const OWNER = 'a'.repeat(64);
const FIXED_NOW = () => 100;

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    queryClient: QueryClient;
}

interface ProbeProps {
    ownerPubkey?: string;
    enabled?: boolean;
    failedRetryIntervalMs?: number;
    storageBackend?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    dmService: DirectMessagesService;
    onUpdate: (next: ReturnType<typeof useDirectMessagesController>) => void;
}

function DirectMessagesProbe({ ownerPubkey, enabled, failedRetryIntervalMs, storageBackend, dmService, onUpdate }: ProbeProps): null {
    const readStateStorage = useMemo(() => createDmReadStateStorage({
        storage: storageBackend ?? fallbackStorage,
        now: FIXED_NOW,
        version: 'v1',
    }), [storageBackend]);

    const controllerOptions = {
        dmService,
        storage: readStateStorage,
        now: FIXED_NOW,
        ...(ownerPubkey === undefined ? {} : { ownerPubkey }),
        ...(enabled === undefined ? {} : { enabled }),
        ...(failedRetryIntervalMs === undefined ? {} : { failedRetryIntervalMs }),
    };

    const state = useDirectMessagesController(controllerOptions);

    useEffect(() => {
        onUpdate(state);
    }, [onUpdate, state]);

    return null;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(createElement(QueryClientProvider, { client: queryClient }, element));
    });

    return {
        container,
        root,
        queryClient,
    };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let index = 0; index < 50; index += 1) {
        if (condition()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    throw new Error('Condition was not met in time');
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe('useDirectMessagesController', () => {
    test('does not subscribe or load when disabled', async () => {
        const dmService: DirectMessagesService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
        };

        const rendered = await renderElement(createElement(DirectMessagesProbe, {
            ownerPubkey: OWNER,
            enabled: false,
            dmService,
            onUpdate: () => {},
        }));
        mounted.push(rendered);

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(dmService.loadInitialConversations).not.toHaveBeenCalled();
        expect(dmService.subscribeInbox).not.toHaveBeenCalled();
    });

    test('subscribes and loads initial conversations when enabled', async () => {
        const dmService: DirectMessagesService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
        };

        const rendered = await renderElement(createElement(DirectMessagesProbe, {
            ownerPubkey: OWNER,
            enabled: true,
            dmService,
            onUpdate: () => {},
        }));
        mounted.push(rendered);

        await waitFor(() =>
            (dmService.loadInitialConversations as ReturnType<typeof vi.fn>).mock.calls.length > 0
            && (dmService.subscribeInbox as ReturnType<typeof vi.fn>).mock.calls.length > 0
        );

        expect(dmService.loadInitialConversations).toHaveBeenCalledWith({
            ownerPubkey: OWNER,
            mode: 'session_start',
            sentIndex: [],
        });
        expect(dmService.subscribeInbox).toHaveBeenCalledWith({ ownerPubkey: OWNER }, expect.any(Function));
    });

    test('uses reconnect mode for later bootstrap refetches', async () => {
        const dmService: DirectMessagesService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
        };

        const rendered = await renderElement(createElement(DirectMessagesProbe, {
            ownerPubkey: OWNER,
            enabled: true,
            dmService,
            onUpdate: () => {},
        }));
        mounted.push(rendered);

        await waitFor(() =>
            (dmService.loadInitialConversations as ReturnType<typeof vi.fn>).mock.calls.length > 0
        );

        expect(dmService.loadInitialConversations).toHaveBeenNthCalledWith(1, {
            ownerPubkey: OWNER,
            mode: 'session_start',
            sentIndex: [],
        });

        await act(async () => {
            await rendered.queryClient.invalidateQueries({
                queryKey: nostrOverlayQueryKeys.invalidation.directMessages(),
            });
        });

        await waitFor(() =>
            (dmService.loadInitialConversations as ReturnType<typeof vi.fn>).mock.calls.length > 1
        );

        expect(dmService.loadInitialConversations).toHaveBeenNthCalledWith(2, {
            ownerPubkey: OWNER,
            mode: 'reconnect',
            sentIndex: [],
        });
    });

    test('retries failed outgoing dm deliveries from persisted sent index', async () => {
        const memory = new Map<string, string>();
        const storageBackend: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
            getItem(key: string) {
                return memory.get(key) ?? null;
            },
            setItem(key: string, value: string) {
                memory.set(key, value);
            },
            removeItem(key: string) {
                memory.delete(key);
            },
        };

        const peerPubkey = 'b'.repeat(64);
        const sendDm = vi
            .fn()
            .mockRejectedValueOnce(new Error('relay timeout'))
            .mockImplementationOnce(async (input: {
                ownerPubkey: string;
                peerPubkey: string;
                plaintext: string;
                clientMessageId: string;
            }) => ({
                id: 'sent-1',
                clientMessageId: input.clientMessageId,
                conversationId: input.peerPubkey,
                peerPubkey: input.peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 101,
                plaintext: input.plaintext,
                deliveryState: 'sent' as const,
            }));

        const dmService: DirectMessagesService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
            sendDm,
        };

        let latestState: ReturnType<typeof useDirectMessagesController> | undefined;

        const rendered = await renderElement(createElement(DirectMessagesProbe, {
            ownerPubkey: OWNER,
            enabled: true,
            failedRetryIntervalMs: 1,
            storageBackend,
            dmService,
            onUpdate: (next) => {
                latestState = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => typeof latestState?.sendMessage === 'function');

        await act(async () => {
            await latestState?.sendMessage(peerPubkey, 'hola retry');
        });

        expect(sendDm.mock.calls.length).toBeGreaterThanOrEqual(1);

        await waitFor(() => sendDm.mock.calls.length >= 2);
        const firstCallInput = sendDm.mock.calls[0]?.[0] as {
            ownerPubkey: string;
            peerPubkey: string;
            plaintext: string;
            clientMessageId: string;
        };
        const secondCallInput = sendDm.mock.calls[1]?.[0] as {
            ownerPubkey: string;
            peerPubkey: string;
            plaintext: string;
            clientMessageId: string;
        };

        expect(secondCallInput.ownerPubkey).toBe(OWNER);
        expect(secondCallInput.peerPubkey).toBe(peerPubkey);
        expect(secondCallInput.plaintext).toBe('hola retry');
        expect(secondCallInput.clientMessageId).toBe(firstCallInput.clientMessageId);
    });

    test('does not retry failed outgoing dm deliveries after reload from persisted sent index', async () => {
        const memory = new Map<string, string>();
        const storageBackend: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
            getItem(key: string) {
                return memory.get(key) ?? null;
            },
            setItem(key: string, value: string) {
                memory.set(key, value);
            },
            removeItem(key: string) {
                memory.delete(key);
            },
        };

        const key = `nostr-overlay:dm:v1:sent-index:${OWNER}`;
        memory.set(key, JSON.stringify([
            {
                clientMessageId: 'client-reload',
                conversationId: 'b'.repeat(64),
                createdAtSec: 99,
                deliveryState: 'failed',
                targetRelays: [],
                plaintext: 'should not retry after reload',
            },
        ]));

        const sendDm = vi.fn();
        const dmService: DirectMessagesService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
            sendDm,
        };

        const rendered = await renderElement(createElement(DirectMessagesProbe, {
            ownerPubkey: OWNER,
            enabled: true,
            failedRetryIntervalMs: 1,
            storageBackend,
            dmService,
            onUpdate: () => {},
        }));
        mounted.push(rendered);

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(sendDm).not.toHaveBeenCalled();
        expect(memory.get(key)).not.toContain('plaintext');
        expect(memory.get(key)).not.toContain('should not retry after reload');
    });
});
