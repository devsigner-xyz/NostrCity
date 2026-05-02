import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DmMessage, SentIndexItem } from '../../nostr/dm-service';
import { nostrOverlayQueryKeys } from './keys';
import { createSocialQueryOptions } from './options';
import {
    createDmReadStateStorage,
    fallbackStorage,
    normalizeToEpochSeconds,
    type DmReadStateStorage,
} from './dm-storage';

export interface DirectMessageItem extends DmMessage {
    isUndecryptable?: boolean;
}

export interface DirectMessageConversationState {
    id: string;
    messages: DirectMessageItem[];
    lastReadAt: number;
    hasUnread: boolean;
}

export interface DirectMessagesService {
    subscribeInbox: (input: { ownerPubkey: string }, onMessage: (message: DirectMessageItem) => void) => (() => void) | void;
    sendDm?: (input: {
        ownerPubkey: string;
        peerPubkey: string;
        plaintext: string;
        clientMessageId: string;
    }) => Promise<DirectMessageItem>;
    loadInitialConversations?: (input: {
        ownerPubkey: string;
        mode?: 'session_start' | 'reconnect';
        sentIndex?: SentIndexItem[];
    }) => Promise<DirectMessageItem[]>;
    loadConversationMessages?: (input: {
        ownerPubkey: string;
        peerPubkey: string;
        mode?: 'session_start' | 'reconnect';
        since?: number;
        sentIndex?: SentIndexItem[];
    }) => Promise<DirectMessageItem[]>;
}

type DmBackfillMode = 'session_start' | 'reconnect';

interface UseDirectMessagesControllerOptions {
    ownerPubkey?: string;
    enabled?: boolean;
    dmService: DirectMessagesService;
    storage?: DmReadStateStorage;
    now?: () => number;
    failedRetryIntervalMs?: number;
}

const FAILED_DM_RETRY_INTERVAL_MS = 10_000;
const MAX_FAILED_RETRIES_PER_TICK = 5;
const defaultNowSeconds = (): number => Math.floor(Date.now() / 1000);

function compareMessages(left: DirectMessageItem, right: DirectMessageItem): number {
    const leftTime = normalizeToEpochSeconds(left.createdAt);
    const rightTime = normalizeToEpochSeconds(right.createdAt);
    if (leftTime !== rightTime) {
        return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
}

function normalizeMessage(message: DirectMessageItem): DirectMessageItem {
    return {
        ...message,
        createdAt: normalizeToEpochSeconds(message.createdAt),
    };
}

function mergeMessages(existing: DirectMessageItem[], incoming: DirectMessageItem[]): DirectMessageItem[] {
    const byId = new Map<string, DirectMessageItem>();
    for (const message of existing) {
        byId.set(message.id, message);
    }

    for (const message of incoming) {
        byId.set(message.id, message);
    }

    return [...byId.values()].sort(compareMessages);
}

function computeConversationUnread(conversation: DirectMessageConversationState): boolean {
    return conversation.messages.some(
        (message) => message.direction === 'incoming' && normalizeToEpochSeconds(message.createdAt) > conversation.lastReadAt
    );
}

function buildClientMessageId(now: () => number): string {
    return `client-${now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function useDirectMessagesController(options: UseDirectMessagesControllerOptions) {
    const now = options.now ?? defaultNowSeconds;
    const isEnabled = options.enabled ?? true;
    const failedRetryIntervalMs = Math.max(1, Math.floor(options.failedRetryIntervalMs ?? FAILED_DM_RETRY_INTERVAL_MS));
    const [isListOpen, setIsListOpen] = useState(false);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [openedConversationIds, setOpenedConversationIds] = useState<string[]>([]);
    const [lastReadAtByConversation, setLastReadAtByConversation] = useState<Record<string, number>>({});
    const hasLoadedInitialConversationsRef = useRef(false);
    const conversationBackfillCountRef = useRef<Record<string, number>>({});
    const retryingFailedClientMessageIdsRef = useRef(new Set<string>());
    const failedPlaintextByClientMessageIdRef = useRef<Record<string, string>>({});
    const queryClient = useQueryClient();

    const storage = useMemo(() => {
        if (options.storage) {
            return options.storage;
        }

        const backingStorage = typeof window === 'undefined' ? fallbackStorage : window.localStorage;
        return createDmReadStateStorage({
            storage: backingStorage,
            now: () => Math.floor(Date.now() / 1000),
            version: 'v1',
        });
    }, [options.storage]);

    const listQueryKey = useMemo(
        () => nostrOverlayQueryKeys.directMessagesList({ ownerPubkey: options.ownerPubkey || '' }),
        [options.ownerPubkey]
    );

    const directMessagesListQuery = useQuery(createSocialQueryOptions({
        queryKey: listQueryKey,
        queryFn: async (): Promise<DirectMessageItem[]> => {
            if (!options.ownerPubkey || !isEnabled) {
                return [];
            }

            const sentIndex = storage.getSentIndex(options.ownerPubkey);
            const mode: DmBackfillMode = hasLoadedInitialConversationsRef.current ? 'reconnect' : 'session_start';
            const loaded = await options.dmService.loadInitialConversations?.({
                ownerPubkey: options.ownerPubkey,
                mode,
                sentIndex,
            }) ?? [];
            hasLoadedInitialConversationsRef.current = true;
            return mergeMessages([], loaded.map(normalizeMessage));
        },
        enabled: Boolean(options.ownerPubkey && isEnabled),
    }));

    useEffect(() => {
        setIsListOpen(false);
        setActiveConversationId(null);
        setOpenedConversationIds([]);
        setLastReadAtByConversation({});
        hasLoadedInitialConversationsRef.current = false;
        conversationBackfillCountRef.current = {};
        failedPlaintextByClientMessageIdRef.current = {};
    }, [options.ownerPubkey]);

    useEffect(() => {
        if (!options.ownerPubkey || !isEnabled) {
            return;
        }

        return options.dmService.subscribeInbox({ ownerPubkey: options.ownerPubkey }, (message) => {
            queryClient.setQueryData<DirectMessageItem[]>(listQueryKey, (current = []) =>
                mergeMessages(current, [normalizeMessage(message)])
            );
        });
    }, [isEnabled, options.dmService, options.ownerPubkey, queryClient, listQueryKey]);

    const activeConversationBackfillQuery = useQuery(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.directMessagesConversation({
            ownerPubkey: options.ownerPubkey || '',
            conversationId: activeConversationId || '__none__',
        }),
        queryFn: async (): Promise<DirectMessageItem[]> => {
            if (!options.ownerPubkey || !activeConversationId) {
                return [];
            }

            const currentMessages = queryClient.getQueryData<DirectMessageItem[]>(listQueryKey) ?? [];
            const currentConversationMessages = currentMessages.filter((message) => message.conversationId === activeConversationId);
            const firstConversationMessage = currentConversationMessages[0];
            const oldestCreatedAt = currentConversationMessages.length > 0
                ? normalizeToEpochSeconds(firstConversationMessage?.createdAt ?? 0)
                : 0;
            const sentIndex = storage.getSentIndex(options.ownerPubkey);
            const existingCount = conversationBackfillCountRef.current[activeConversationId] ?? 0;
            const mode: DmBackfillMode = existingCount > 0 ? 'reconnect' : 'session_start';

            const loaded = await options.dmService.loadConversationMessages?.({
                ownerPubkey: options.ownerPubkey,
                peerPubkey: activeConversationId,
                mode,
                since: oldestCreatedAt > 0 ? Math.max(0, oldestCreatedAt - 1) : 0,
                sentIndex,
            }) ?? [];
            conversationBackfillCountRef.current = {
                ...conversationBackfillCountRef.current,
                [activeConversationId]: existingCount + 1,
            };
            return mergeMessages([], loaded.map(normalizeMessage));
        },
        enabled: Boolean(options.ownerPubkey && isEnabled && activeConversationId && options.dmService.loadConversationMessages),
    }));

    useEffect(() => {
        if (!activeConversationBackfillQuery.data || activeConversationBackfillQuery.data.length === 0) {
            return;
        }

        queryClient.setQueryData<DirectMessageItem[]>(listQueryKey, (current = []) =>
            mergeMessages(current, activeConversationBackfillQuery.data || [])
        );
    }, [activeConversationBackfillQuery.data, queryClient, listQueryKey]);

    const allMessages = directMessagesListQuery.data ?? [];

    const markConversationRead = useCallback((conversationId: string, timestampSec?: number) => {
        if (!options.ownerPubkey) {
            return;
        }

        const conversationMessages = allMessages.filter((message) => message.conversationId === conversationId);
        const maxVisibleCreatedAt = conversationMessages.reduce(
            (maxValue, message) => Math.max(maxValue, normalizeToEpochSeconds(message.createdAt)),
            0
        );

        setLastReadAtByConversation((current) => {
            const currentValue = current[conversationId] ?? storage.getLastReadAt(options.ownerPubkey!, conversationId);
            const nextValue = Math.max(currentValue, timestampSec ?? maxVisibleCreatedAt);
            if (nextValue === currentValue) {
                return current;
            }

            storage.setLastReadAt(options.ownerPubkey!, conversationId, nextValue);
            return {
                ...current,
                [conversationId]: nextValue,
            };
        });
    }, [allMessages, options.ownerPubkey, storage]);

    useEffect(() => {
        if (!activeConversationId) {
            return;
        }

        markConversationRead(activeConversationId);
    }, [activeConversationId, allMessages, markConversationRead]);

    const sendDmMutation = useMutation({
        mutationKey: nostrOverlayQueryKeys.directMessagesSendMutation(),
        mutationFn: async (input: {
            ownerPubkey: string;
            peerPubkey: string;
            plaintext: string;
            clientMessageId: string;
        }) => {
            if (!options.dmService.sendDm) {
                throw new Error('No DM send service available');
            }

            return options.dmService.sendDm(input);
        },
        onMutate: async (input) => {
            const optimisticMessage: DirectMessageItem = {
                id: `client:${input.clientMessageId}`,
                clientMessageId: input.clientMessageId,
                conversationId: input.peerPubkey,
                peerPubkey: input.peerPubkey,
                direction: 'outgoing',
                createdAt: normalizeToEpochSeconds(now()),
                plaintext: input.plaintext,
                deliveryState: 'pending',
            };

            setOpenedConversationIds((current) => (current.includes(input.peerPubkey) ? current : [...current, input.peerPubkey]));

            queryClient.setQueryData<DirectMessageItem[]>(listQueryKey, (current = []) =>
                mergeMessages(current, [optimisticMessage])
            );

            return {
                optimisticId: optimisticMessage.id,
                conversationId: input.peerPubkey,
                clientMessageId: input.clientMessageId,
            };
        },
        onSuccess: (result, _input, context) => {
            if (!context) {
                return;
            }

            const normalized = normalizeMessage(result);
            queryClient.setQueryData<DirectMessageItem[]>(listQueryKey, (current = []) => {
                const filtered = current.filter((message) => message.id !== context.optimisticId);
                return mergeMessages(filtered, [normalized]);
            });
            delete failedPlaintextByClientMessageIdRef.current[context.clientMessageId];

            if (options.ownerPubkey) {
                const sentIndex = storage
                    .getSentIndex(options.ownerPubkey)
                    .filter((item) => item.clientMessageId !== (normalized.clientMessageId || context.clientMessageId));
                const nextIndex: SentIndexItem = {
                    clientMessageId: normalized.clientMessageId || context.clientMessageId,
                    conversationId: normalized.conversationId,
                    ...(normalized.rumorEventId ? { rumorEventId: normalized.rumorEventId } : {}),
                    ...(normalized.sealEventId ? { sealEventId: normalized.sealEventId } : {}),
                    ...(normalized.giftWrapEventId ? { giftWrapEventId: normalized.giftWrapEventId } : {}),
                    createdAtSec: normalizeToEpochSeconds(normalized.createdAt),
                    deliveryState: normalized.deliveryState,
                    targetRelays: [],
                };
                storage.setSentIndex(options.ownerPubkey, [nextIndex, ...sentIndex]);
            }
        },
        onError: (_error, input, context) => {
            if (!context) {
                return;
            }

            queryClient.setQueryData<DirectMessageItem[]>(listQueryKey, (current = []) =>
                current.map((message) => {
                    if (message.id !== context.optimisticId) {
                        return message;
                    }

                    return {
                        ...message,
                        deliveryState: 'failed',
                    };
                })
            );

            if (options.ownerPubkey) {
                failedPlaintextByClientMessageIdRef.current[context.clientMessageId] = input.plaintext;
                const sentIndex = storage
                    .getSentIndex(options.ownerPubkey)
                    .filter((item) => item.clientMessageId !== context.clientMessageId);
                storage.setSentIndex(options.ownerPubkey, [
                    {
                        clientMessageId: context.clientMessageId,
                        conversationId: input.peerPubkey,
                        createdAtSec: normalizeToEpochSeconds(now()),
                        deliveryState: 'failed',
                        targetRelays: [],
                    },
                    ...sentIndex,
                ]);
            }
        },
    });

    const retryMutateAsyncRef = useRef(sendDmMutation.mutateAsync);
    useEffect(() => {
        retryMutateAsyncRef.current = sendDmMutation.mutateAsync;
    }, [sendDmMutation.mutateAsync]);

    useEffect(() => {
        if (!isEnabled || !options.ownerPubkey || !options.dmService.sendDm) {
            return;
        }

        let cancelled = false;
        let running = false;

        const retryFailedDeliveries = async (): Promise<void> => {
            if (cancelled || running) {
                return;
            }

            running = true;
            try {
                const sentIndex = storage.getSentIndex(options.ownerPubkey!);
                const failedItems = sentIndex
                    .flatMap((item) => {
                        const plaintext = failedPlaintextByClientMessageIdRef.current[item.clientMessageId];
                        if (item.deliveryState !== 'failed' || typeof plaintext !== 'string' || plaintext.trim().length === 0) {
                            return [];
                        }

                        return [{ item, plaintext }];
                    })
                    .slice(0, MAX_FAILED_RETRIES_PER_TICK);

                for (const { item, plaintext } of failedItems) {
                    if (cancelled) {
                        break;
                    }

                    if (retryingFailedClientMessageIdsRef.current.has(item.clientMessageId)) {
                        continue;
                    }

                    retryingFailedClientMessageIdsRef.current.add(item.clientMessageId);
                    try {
                        await retryMutateAsyncRef.current({
                            ownerPubkey: options.ownerPubkey!,
                            peerPubkey: item.conversationId,
                            plaintext,
                            clientMessageId: item.clientMessageId,
                        });
                    } catch {
                        // Keep failed entry for later retry tick.
                    } finally {
                        retryingFailedClientMessageIdsRef.current.delete(item.clientMessageId);
                    }
                }
            } finally {
                running = false;
            }
        };

        void retryFailedDeliveries();
        const timer = window.setInterval(() => {
            void retryFailedDeliveries();
        }, failedRetryIntervalMs);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
            retryingFailedClientMessageIdsRef.current.clear();
            failedPlaintextByClientMessageIdRef.current = {};
        };
    }, [failedRetryIntervalMs, isEnabled, now, options.dmService.sendDm, options.ownerPubkey, storage]);

    const conversations = useMemo<Record<string, DirectMessageConversationState>>(() => {
        const grouped: Record<string, DirectMessageConversationState> = {};

        for (const message of allMessages) {
            const currentConversation = grouped[message.conversationId] || {
                id: message.conversationId,
                messages: [],
                lastReadAt: options.ownerPubkey
                    ? lastReadAtByConversation[message.conversationId] ?? storage.getLastReadAt(options.ownerPubkey, message.conversationId)
                    : 0,
                hasUnread: false,
            };

            currentConversation.messages.push(message);
            grouped[message.conversationId] = currentConversation;
        }

        for (const conversationId of openedConversationIds) {
            if (grouped[conversationId]) {
                continue;
            }

            grouped[conversationId] = {
                id: conversationId,
                messages: [],
                lastReadAt: options.ownerPubkey
                    ? lastReadAtByConversation[conversationId] ?? storage.getLastReadAt(options.ownerPubkey, conversationId)
                    : 0,
                hasUnread: false,
            };
        }

        for (const conversation of Object.values(grouped)) {
            conversation.messages.sort(compareMessages);
            conversation.hasUnread = computeConversationUnread(conversation);
        }

        return grouped;
    }, [allMessages, lastReadAtByConversation, openedConversationIds, options.ownerPubkey, storage]);

    const hasUnreadGlobal = useMemo(
        () => Object.values(conversations).some((conversation) => conversation.hasUnread),
        [conversations]
    );

    const openList = useCallback(() => {
        setIsListOpen(true);
        setActiveConversationId(null);
    }, []);

    const openConversation = useCallback((conversationId: string) => {
        if (!conversationId) {
            return;
        }

        setOpenedConversationIds((current) => (current.includes(conversationId) ? current : [...current, conversationId]));
        setIsListOpen(false);
        setActiveConversationId(conversationId);
        markConversationRead(conversationId);
    }, [markConversationRead]);

    const sendMessage = useCallback(async (peerPubkey: string, plaintext: string): Promise<DirectMessageItem | null> => {
        if (!isEnabled || !options.ownerPubkey || !peerPubkey || !options.dmService.sendDm) {
            return null;
        }

        const normalizedPlaintext = plaintext.trim();
        if (!normalizedPlaintext) {
            return null;
        }

        try {
            const sent = await sendDmMutation.mutateAsync({
                ownerPubkey: options.ownerPubkey,
                peerPubkey,
                plaintext: normalizedPlaintext,
                clientMessageId: buildClientMessageId(now),
            });
            return normalizeMessage(sent);
        } catch {
            return null;
        }
    }, [isEnabled, now, options.dmService.sendDm, options.ownerPubkey, sendDmMutation]);

    return {
        isListOpen,
        activeConversationId,
        conversations,
        hasUnreadGlobal,
        isBootstrapping: directMessagesListQuery.isPending,
        bootstrapError: directMessagesListQuery.error instanceof Error
            ? directMessagesListQuery.error.message
            : directMessagesListQuery.error
                ? 'No se pudieron cargar las conversaciones'
                : null,
        openList,
        openConversation,
        markConversationRead,
        sendMessage,
        isSendingMessage: sendDmMutation.isPending,
    };
}
