import { canonicalizeGroupAddress } from './groups';
import { normalizeRelayUrl } from './relay-policy';

export interface ParsedGroupInviteLink {
    relay: string;
    group: string;
    code?: string;
}

export function parseGroupInviteLink(input: string, inviteCode?: string): ParsedGroupInviteLink | null {
    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    const rawAddress = parseGroupAddress(trimmed, inviteCode);
    if (rawAddress) {
        return rawAddress;
    }

    try {
        const url = parseInviteUrl(trimmed);
        const rawRelay = url.searchParams.get('relay');
        const group = url.searchParams.get('group');
        if (!rawRelay || !group) {
            return null;
        }

        const relay = normalizeRelayUrl(rawRelay.includes('://') ? rawRelay : `wss://${rawRelay}`);
        if (!relay) {
            return null;
        }

        const address = canonicalizeGroupAddress({ relay, id: group });
        const code = inviteCode?.trim() || url.searchParams.get('code')?.trim();
        return {
            relay: address.relay,
            group: address.id,
            ...(code ? { code } : {}),
        };
    } catch {
        return null;
    }
}

function parseGroupAddress(input: string, inviteCode?: string): ParsedGroupInviteLink | null {
    const [rawRelay, group, extra] = input.split("'");
    if (!rawRelay || !group || extra !== undefined) {
        return null;
    }

    const relay = normalizeRelayUrl(rawRelay.includes('://') ? rawRelay : `wss://${rawRelay}`);
    if (!relay) {
        return null;
    }

    try {
        const address = canonicalizeGroupAddress({ relay, id: group });
        const code = inviteCode?.trim();
        return {
            relay: address.relay,
            group: address.id,
            ...(code ? { code } : {}),
        };
    } catch {
        return null;
    }
}

function parseInviteUrl(input: string): URL {
    if (input.startsWith('/')) {
        return new URL(input, 'https://nostr.city');
    }

    return new URL(input);
}
