import type { PublishResult } from './dm-types';
import type { NostrEvent, NostrFilter } from './types';

export interface GroupRelayInfo {
    self?: string;
}

export interface GroupsTransport {
    fetchRelayInfo(relay: string): Promise<GroupRelayInfo>;
    fetchGroupEvents(relay: string, filters: NostrFilter[]): Promise<NostrEvent[]>;
}

interface FetchNip11RelayInfoOptions {
    fetch?: (input: string, init: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
    timeoutMs?: number;
}

export type GroupRelayErrorCode = 'pending' | 'restricted' | 'blocked' | 'duplicate' | 'unknown';

export interface GroupRelayError {
    code: GroupRelayErrorCode;
    message: string;
}

export interface GroupRelayFailure {
    relay: string;
    error: GroupRelayError;
}

export interface GroupRelayPublishResult {
    ackedRelays: string[];
    failedRelays: GroupRelayFailure[];
    timeoutRelays: string[];
}

const RELAY_ERROR_MESSAGES: Record<GroupRelayErrorCode, string> = {
    pending: 'Your request is awaiting approval.',
    restricted: 'This group is restricted.',
    blocked: 'The relay blocked this action.',
    duplicate: 'This event was already published.',
    unknown: 'The relay rejected this action.',
};

function relayHttpEndpoint(relayUrl: string): string | null {
    try {
        const parsed = new URL(relayUrl);
        if (parsed.protocol === 'wss:') {
            parsed.protocol = 'https:';
        } else if (parsed.protocol === 'ws:') {
            parsed.protocol = 'http:';
        } else {
            return null;
        }

        return parsed.toString();
    } catch {
        return null;
    }
}

export async function fetchNip11RelayInfo(relayUrl: string, options: FetchNip11RelayInfoOptions = {}): Promise<GroupRelayInfo> {
    const endpoint = relayHttpEndpoint(relayUrl);
    const fetchFn = options.fetch ?? globalThis.fetch;
    if (!endpoint || typeof fetchFn !== 'function') {
        return {};
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, options.timeoutMs ?? 3500);

    try {
        const response = await fetchFn(endpoint, {
            method: 'GET',
            headers: {
                Accept: 'application/nostr+json, application/json;q=0.9',
            },
            signal: controller.signal,
        });
        if (!response.ok) {
            return {};
        }

        const payload = await response.json() as unknown;
        if (!payload || typeof payload !== 'object') {
            return {};
        }

        const self = (payload as { self?: unknown }).self;
        return typeof self === 'string' && self.length > 0 ? { self } : {};
    } catch {
        return {};
    } finally {
        clearTimeout(timeout);
    }
}

export function mapGroupRelayError(reason: string): GroupRelayError {
    const normalizedReason = reason.toLowerCase();
    if (normalizedReason.includes('pending') || normalizedReason.includes('approval') || normalizedReason.includes('review')) {
        return { code: 'pending', message: RELAY_ERROR_MESSAGES.pending };
    }

    if (reason.startsWith('restricted:')) {
        return { code: 'restricted', message: RELAY_ERROR_MESSAGES.restricted };
    }

    if (reason.startsWith('blocked:')) {
        return { code: 'blocked', message: RELAY_ERROR_MESSAGES.blocked };
    }

    if (reason.startsWith('duplicate:')) {
        return { code: 'duplicate', message: RELAY_ERROR_MESSAGES.duplicate };
    }

    return { code: 'unknown', message: RELAY_ERROR_MESSAGES.unknown };
}

export function normalizeGroupRelayPublishResult(result: PublishResult): GroupRelayPublishResult {
    return {
        ackedRelays: result.ackedRelays,
        failedRelays: result.failedRelays.map((failure) => ({
            relay: failure.relay,
            error: mapGroupRelayError(failure.reason),
        })),
        timeoutRelays: result.timeoutRelays,
    };
}
