import type { RelaySettingsByType } from './relay-settings';
import {
    dmInboxRelayListFromKind10050Event,
    relaySuggestionsByTypeFromKind10002Event,
} from './relay-policy';
import type { NostrClient } from './types';

const DEFAULT_PROFILE_RELAY_METADATA_TIMEOUT_MS = 10_000;

export interface ProfileRelayDiscoveryInput {
    pubkey: string;
    primaryClient: NostrClient;
    fallbackClient?: NostrClient;
    timeoutMs?: number;
}

function emptyRelaySettingsByType(): RelaySettingsByType {
    return {
        nip65Both: [],
        nip65Read: [],
        nip65Write: [],
        dmInbox: [],
        search: [],
        groups: [],
    };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(message));
        }, timeoutMs);

        void promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

function hasNip65Relay(settings: RelaySettingsByType): boolean {
    return settings.nip65Both.length > 0
        || settings.nip65Read.length > 0
        || settings.nip65Write.length > 0;
}

async function loadFromClient(input: { pubkey: string; client: NostrClient; timeoutMs: number }): Promise<RelaySettingsByType> {
    await input.client.connect();

    const [relayListResult, dmRelayListResult] = await Promise.allSettled([
        withTimeout(
            input.client.fetchLatestReplaceableEvent(input.pubkey, 10002),
            input.timeoutMs,
            'Relay timeout while fetching profile relay list (kind 10002)'
        ),
        withTimeout(
            input.client.fetchLatestReplaceableEvent(input.pubkey, 10050),
            input.timeoutMs,
            'Relay timeout while fetching profile DM relay list (kind 10050)'
        ),
    ]);

    const relayListEvent = relayListResult.status === 'fulfilled' ? relayListResult.value : null;
    const dmRelayListEvent = dmRelayListResult.status === 'fulfilled' ? dmRelayListResult.value : null;

    return {
        ...relaySuggestionsByTypeFromKind10002Event(relayListEvent),
        dmInbox: dmInboxRelayListFromKind10050Event(dmRelayListEvent),
        search: [],
        groups: [],
    };
}

export async function loadProfileRelaySuggestions(input: ProfileRelayDiscoveryInput): Promise<RelaySettingsByType> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_PROFILE_RELAY_METADATA_TIMEOUT_MS;
    const primary = await loadFromClient({ pubkey: input.pubkey, client: input.primaryClient, timeoutMs })
        .catch(() => emptyRelaySettingsByType());

    if (hasNip65Relay(primary) || !input.fallbackClient) {
        return primary;
    }

    const fallback = await loadFromClient({ pubkey: input.pubkey, client: input.fallbackClient, timeoutMs })
        .catch(() => emptyRelaySettingsByType());

    return {
        nip65Both: fallback.nip65Both,
        nip65Read: fallback.nip65Read,
        nip65Write: fallback.nip65Write,
        dmInbox: primary.dmInbox.length > 0 ? primary.dmInbox : fallback.dmInbox,
        search: [],
        groups: [],
    };
}
