import type { ReactElement } from 'react';
import { encodeHexToNpub, isHexKey } from '../../../../nostr/npub';
import { normalizeRelayUrl } from '../../../../nostr/relay-policy';
import { RELAY_TYPES, type RelayType } from '../../../../nostr/relay-settings';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import type { RelayConnectionStatus } from '../../../hooks/useRelayConnectionSummary';
import type { RelayDetails, RelayFee, RelayInformationDocument, RelayRow, RelaySource } from '../../settings-pages/types';

export const EMPTY_RELAYS: string[] = [];

export const RELAY_TYPE_LABELS: Record<RelayType, string> = {
    nip65Both: 'NIP-65 lectura+escritura',
    nip65Read: 'NIP-65 lectura',
    nip65Write: 'NIP-65 escritura',
    dmInbox: 'NIP-17 buzón DM',
    search: 'Búsqueda NIP-50',
    groups: 'NIP-29',
};

export function buildRelayRowsByUrl(byType: Partial<Record<RelayType, string[]>>): RelayRow[] {
    const relayTypesByUrl = new Map<string, Set<RelayType>>();

    for (const relayType of RELAY_TYPES) {
        for (const relayUrl of byType[relayType] ?? EMPTY_RELAYS) {
            const relayTypes = relayTypesByUrl.get(relayUrl) ?? new Set<RelayType>();
            relayTypes.add(relayType);
            relayTypesByUrl.set(relayUrl, relayTypes);
        }
    }

    return [...relayTypesByUrl.entries()]
        .map(([relayUrl, relayTypes]) => {
            const sortedRelayTypes = RELAY_TYPES.filter((relayType) => relayTypes.has(relayType));
            return {
                relayUrl,
                relayTypes: sortedRelayTypes,
                primaryRelayType: sortedRelayTypes[0] ?? 'nip65Both',
            };
        })
        .sort((left, right) => left.relayUrl.localeCompare(right.relayUrl));
}

export function describeRelay(relayUrl: string, source: RelaySource): RelayDetails {
    try {
        const parsed = new URL(relayUrl);
        return {
            relayUrl,
            source,
            host: parsed.hostname || 'unknown',
        };
    } catch {
        return {
            relayUrl,
            source,
            host: 'unknown',
        };
    }
}

export function relayAvatarFallback(details: RelayDetails, document?: RelayInformationDocument): string {
    const source = document?.name || details.host || details.relayUrl;
    const parts = source.split(/[^a-zA-Z0-9]+/).filter((part) => part.length > 0);
    if (parts.length >= 2) {
        return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
    }

    return source.slice(0, 2).toUpperCase();
}

export function formatRelayFee(fee: RelayFee): string {
    const amount = typeof fee.amount === 'number' ? `${fee.amount} ${fee.unit || ''}`.trim() : 'unknown amount';
    if (typeof fee.period === 'number') {
        return `${amount} / ${fee.period}s`;
    }

    if (Array.isArray(fee.kinds) && fee.kinds.length > 0) {
        return `${amount} (kinds ${fee.kinds.join(', ')})`;
    }

    return amount;
}

export function toAdminIdentity(pubkey?: string): string | null {
    if (typeof pubkey !== 'string') {
        return null;
    }

    const normalized = pubkey.trim().toLowerCase();
    if (!isHexKey(normalized)) {
        return null;
    }

    try {
        return encodeHexToNpub(normalized);
    } catch {
        return null;
    }
}

export function hasNip11Metadata(document?: RelayInformationDocument): boolean {
    if (!document) {
        return false;
    }

    return Object.keys(document).length > 0;
}

export function relayConnectionBadge(status: RelayConnectionStatus | undefined): ReactElement {
    if (status === 'connected') {
        return <Badge>Conectado</Badge>;
    }

    if (status === 'disconnected') {
        return <Badge variant="destructive">Sin conexión</Badge>;
    }

    return (
        <Badge variant="secondary">
            <Spinner data-icon="inline-start" />
            Comprobando
        </Badge>
    );
}

export function normalizeRelayInput(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const candidate = trimmed.startsWith('ws://') || trimmed.startsWith('wss://')
        ? trimmed
        : `wss://${trimmed}`;
    const normalized = normalizeRelayUrl(candidate);
    if (!normalized) {
        return null;
    }

    try {
        const parsed = new URL(normalized);
        const host = parsed.hostname.toLowerCase();
        if (!host || host.length > 253) {
            return null;
        }

        const isIpv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host)
            && host.split('.').every((segment) => {
                const current = Number(segment);
                return Number.isInteger(current) && current >= 0 && current <= 255;
            });
        const isIpv6 = host.includes(':') && /^[0-9a-f:]+$/i.test(host);
        const isLocalhost = host === 'localhost';
        const isDomain = host.includes('.')
            && host.split('.').every((label) => /^[a-z0-9-]+$/i.test(label) && !label.startsWith('-') && !label.endsWith('-'));

        if (!isIpv4 && !isIpv6 && !isLocalhost && !isDomain) {
            return null;
        }

        return normalized;
    } catch {
        return null;
    }
}
