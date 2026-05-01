import { useQuery } from '@tanstack/react-query';
import { GROUP_METADATA_KIND, parseGroupMetadataEvent } from '../../nostr/groups';
import { fetchNip11RelayInfo, type GroupRelayInfo } from '../../nostr/groups-transport';
import { createLazyNdkClient } from '../../nostr/lazy-ndk-client';
import { isHexKey } from '../../nostr/npub';
import type { NostrClient, NostrEvent } from '../../nostr/types';
import { nostrOverlayQueryKeys } from './keys';
import { createMetadataQueryOptions } from './options';
import { verifyEvent } from 'nostr-tools/pure';

export interface RelayGroupSummary {
    relay: string;
    id: string;
    name?: string;
    description?: string;
}

export type RelayGroupsState =
    | { status: 'idle'; groups: RelayGroupSummary[] }
    | { status: 'loading'; groups: RelayGroupSummary[] }
    | { status: 'ready'; groups: RelayGroupSummary[] }
    | { status: 'error'; groups: RelayGroupSummary[] };

interface FetchRelayGroupsForRelayInput {
    relayUrl: string;
    fetchRelayInfo?: (relayUrl: string) => Promise<GroupRelayInfo>;
    createClient?: (relayUrls: string[]) => NostrClient;
    verifyEvent?: (event: NostrEvent) => boolean;
}

interface UseRelayGroupsByRelayQueryInput {
    relayUrl: string;
    enabled: boolean;
}

function isTrustedRelayMetadataEvent(event: NostrEvent, relaySelf: string, verify: (event: NostrEvent) => boolean): boolean {
    if (event.kind !== GROUP_METADATA_KIND || event.pubkey !== relaySelf) {
        return false;
    }

    try {
        return verify(event);
    } catch {
        return false;
    }
}

function toRelayGroupSummary(relay: string, event: NostrEvent): RelayGroupSummary | null {
    const metadata = parseGroupMetadataEvent(event);
    if (!metadata) {
        return null;
    }

    return {
        relay,
        id: metadata.id,
        ...(metadata.name ? { name: metadata.name } : {}),
        ...(metadata.about ? { description: metadata.about } : {}),
    };
}

function dedupeGroups(groups: RelayGroupSummary[]): RelayGroupSummary[] {
    const byId = new Map<string, RelayGroupSummary>();
    for (const group of groups) {
        if (!byId.has(group.id)) {
            byId.set(group.id, group);
        }
    }

    return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export async function fetchRelayGroupsForRelay(input: FetchRelayGroupsForRelayInput): Promise<RelayGroupSummary[]> {
    const relayInfo = await (input.fetchRelayInfo ?? fetchNip11RelayInfo)(input.relayUrl);
    const self = relayInfo.self;
    if (!self || !isHexKey(self)) {
        return [];
    }

    const client = (input.createClient ?? ((relayUrls: string[]) => createLazyNdkClient({ relays: relayUrls })))([input.relayUrl]);
    await client.connect();
    const events = await client.fetchEvents({ kinds: [GROUP_METADATA_KIND], authors: [self] });
    const verify = input.verifyEvent ?? ((event: NostrEvent) => verifyEvent(event as Parameters<typeof verifyEvent>[0]));

    return dedupeGroups(events.flatMap((event) => {
        if (!isTrustedRelayMetadataEvent(event, self, verify)) {
            return [];
        }

        const summary = toRelayGroupSummary(input.relayUrl, event);
        return summary ? [summary] : [];
    }));
}

export function useRelayGroupsByRelayQuery(input: UseRelayGroupsByRelayQueryInput): RelayGroupsState {
    const query = useQuery(createMetadataQueryOptions({
        queryKey: nostrOverlayQueryKeys.relayGroups({ relayUrl: input.relayUrl }),
        queryFn: () => fetchRelayGroupsForRelay({ relayUrl: input.relayUrl }),
        enabled: input.enabled && input.relayUrl.trim().length > 0,
    }));

    if (!input.enabled) {
        return { status: 'idle', groups: [] };
    }

    if (query.error) {
        return { status: 'error', groups: [] };
    }

    if (query.data) {
        return { status: 'ready', groups: query.data };
    }

    if (query.isPending || query.isFetching) {
        return { status: 'loading', groups: [] };
    }

    return { status: 'idle', groups: [] };
}
