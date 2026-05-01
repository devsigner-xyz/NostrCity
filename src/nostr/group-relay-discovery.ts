import { canonicalizeGroupAddress, GROUP_METADATA_KIND, type GroupAddressInput } from './groups';
import type { GroupRelayInfo } from './groups-transport';
import { isHexKey } from './npub';
import { mergeRelaySets } from './relay-policy';
import type { NostrEvent } from './types';
import { verifyEvent } from 'nostr-tools/pure';

interface ResolveNip29GroupDiscoveryRelaysInput {
    configuredGroupRelays: string[];
    savedGroups: GroupAddressInput[];
    publicRelayTags: string[];
}

interface DiscoverNip29GroupsFromRelaysInput {
    relays: string[];
    fetchRelayInfo: (relay: string) => Promise<GroupRelayInfo>;
    fetchMetadataEvents: (relay: string, author: string) => Promise<NostrEvent[]>;
}

function firstTagValue(tags: string[][], name: string): string | undefined {
    return tags.find((tag) => tag[0] === name && Boolean(tag[1]))?.[1];
}

function dedupeGroups(groups: GroupAddressInput[]): GroupAddressInput[] {
    const byKey = new Map<string, GroupAddressInput>();
    for (const group of groups) {
        try {
            byKey.set(canonicalizeGroupAddress(group).key, group);
        } catch {
            // Malformed relay-authored metadata should not fail discovery for other groups.
        }
    }

    return [...byKey.values()];
}

export function resolveNip29GroupDiscoveryRelays(input: ResolveNip29GroupDiscoveryRelaysInput): string[] {
    return mergeRelaySets(
        input.configuredGroupRelays,
        input.savedGroups.map((group) => group.relay),
        input.publicRelayTags,
    );
}

export function verifiedDiscoveredGroups(relay: string, relayInfo: GroupRelayInfo, events: NostrEvent[]): GroupAddressInput[] {
    if (!relayInfo.self || !isHexKey(relayInfo.self)) {
        return [];
    }

    return events.flatMap((event) => {
        if (event.kind !== GROUP_METADATA_KIND || event.pubkey !== relayInfo.self || !verifyEvent(event as Parameters<typeof verifyEvent>[0])) {
            return [];
        }

        const id = firstTagValue(event.tags, 'd');
        if (!id) {
            return [];
        }

        const group = { relay, id };
        try {
            canonicalizeGroupAddress(group);
            return [group];
        } catch {
            return [];
        }
    });
}

export async function discoverNip29GroupsFromRelays(input: DiscoverNip29GroupsFromRelaysInput): Promise<GroupAddressInput[]> {
    const results = await Promise.all(input.relays.map(async (relay): Promise<GroupAddressInput[]> => {
        try {
            const relayInfo = await input.fetchRelayInfo(relay);
            if (!relayInfo.self || !isHexKey(relayInfo.self)) {
                return [];
            }

            const events = await input.fetchMetadataEvents(relay, relayInfo.self);
            return verifiedDiscoveredGroups(relay, relayInfo, events);
        } catch {
            return [];
        }
    }));

    return dedupeGroups(results.flat());
}
