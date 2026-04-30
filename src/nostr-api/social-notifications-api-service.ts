import type {
    SocialNotificationEvent,
    SocialNotificationsPage,
    SocialNotificationsService,
} from '../nostr/social-notifications-service';
import { clampApiLimit } from './api-limits';
import { createHttpClient, type HttpClient } from './http-client';

interface NotificationEventDto {
    id: string;
    pubkey: string;
    kind: number;
    createdAt: number;
    content: string;
    tags: string[][];
}

interface NotificationItemDto {
    id: string;
    kind: number;
    actorPubkey: string;
    createdAt: number;
    targetEventId: string | null;
    targetPubkey: string | null;
    rawEvent: NotificationEventDto;
}

interface NotificationsResponseDto {
    items: NotificationItemDto[];
    hasMore: boolean;
    nextSince: number | null;
}

interface NotificationSsePayload {
    type?: string;
    item?: NotificationItemDto;
}

export interface CreateSocialNotificationsApiServiceOptions {
    client?: HttpClient;
    reconnectDelayMs?: number;
}

function mapNotificationEvent(dto: NotificationEventDto): SocialNotificationEvent {
    return {
        id: dto.id,
        pubkey: dto.pubkey,
        kind: dto.kind,
        created_at: dto.createdAt,
        tags: dto.tags,
        content: dto.content,
    };
}

function toStreamEvent(payload: unknown): SocialNotificationEvent | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const parsed = payload as NotificationSsePayload;
    if (!parsed.item || !parsed.item.rawEvent) {
        return null;
    }

    return mapNotificationEvent(parsed.item.rawEvent);
}

function parseSseEventData(block: string): string | null {
    const lines = block.split('\n');
    const dataLines = lines
        .map((line) => line.replace(/\r$/, ''))
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) {
        return null;
    }

    return dataLines.join('\n');
}

export function createSocialNotificationsApiService(
    options: CreateSocialNotificationsApiServiceOptions = {},
): SocialNotificationsService {
    const client = options.client ?? createHttpClient();
    const reconnectDelayMs = Math.max(250, Math.floor(options.reconnectDelayMs ?? 1_500));

    return {
        subscribeSocial(input, onEvent) {
            let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
            let activeConnectionAbort: AbortController | null = null;
            let active = true;

            const clearReconnectTimer = () => {
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
            };

            const scheduleReconnect = () => {
                if (!active) {
                    return;
                }

                clearReconnectTimer();
                reconnectTimer = setTimeout(() => {
                    void connect();
                }, reconnectDelayMs);
            };

            const connect = async (): Promise<void> => {
                const connectionAbort = new AbortController();
                activeConnectionAbort?.abort();
                activeConnectionAbort = connectionAbort;

                try {
                    const response = await client.requestRaw('GET', '/notifications/stream', {
                        includeAuth: true,
                        query: {
                            ownerPubkey: input.ownerPubkey,
                        },
                        timeoutMs: 0,
                        signal: connectionAbort.signal,
                    });

                    const reader = response.body?.getReader();
                    if (!reader) {
                        scheduleReconnect();
                        return;
                    }

                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (active) {
                        const chunk = await reader.read();
                        if (chunk.done) {
                            break;
                        }

                        buffer += decoder.decode(chunk.value, { stream: true });

                        let separatorIndex = buffer.indexOf('\n\n');
                        while (separatorIndex >= 0) {
                            const block = buffer.slice(0, separatorIndex);
                            buffer = buffer.slice(separatorIndex + 2);

                            const data = parseSseEventData(block);
                            if (data) {
                                try {
                                    const parsed = JSON.parse(data);
                                    const event = toStreamEvent(parsed);
                                    if (event) {
                                        onEvent(event);
                                    }
                                } catch {
                                    // Ignore malformed stream payload chunks.
                                }
                            }

                            separatorIndex = buffer.indexOf('\n\n');
                        }
                    }
                } catch {
                    // Best effort stream: retry while subscription is active.
                } finally {
                    connectionAbort.abort();
                    if (activeConnectionAbort === connectionAbort) {
                        activeConnectionAbort = null;
                    }
                    if (active) {
                        scheduleReconnect();
                    }
                }
            };

            void connect();

            return () => {
                active = false;
                clearReconnectTimer();
                activeConnectionAbort?.abort();
            };
        },

        async loadInitialSocial(input): Promise<SocialNotificationsPage> {
            const response = await client.getJson<NotificationsResponseDto>('/notifications', {
                includeAuth: true,
                query: {
                    ownerPubkey: input.ownerPubkey,
                    limit: clampApiLimit(input.limit ?? 120),
                    since: input.since ?? Math.floor(Date.now() / 1000),
                },
            });

            return {
                items: response.items.map((item) => mapNotificationEvent(item.rawEvent)),
                hasMore: response.hasMore,
                nextSince: response.nextSince,
            };
        },
    };
}
