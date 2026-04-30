export type SocialNotificationKind = 1 | 6 | 7 | 16 | 9735;

export interface SocialNotificationEvent {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
}

export interface SocialNotificationItem {
    id: string;
    kind: SocialNotificationKind;
    actorPubkey: string;
    createdAt: number;
    content: string;
    targetEventId?: string;
    targetPubkey?: string;
    targetKind?: number;
    targetAddress?: string;
    rawEvent: SocialNotificationEvent;
}

export interface SocialNotificationsPage {
    items: SocialNotificationEvent[];
    hasMore: boolean;
    nextSince: number | null;
}

export interface SocialNotificationsService {
    subscribeSocial(
        input: { ownerPubkey: string },
        onEvent: (event: SocialNotificationEvent) => void
    ): () => void;
    loadInitialSocial(input: {
        ownerPubkey: string;
        limit?: number;
        since?: number;
    }): Promise<SocialNotificationsPage>;
}

function isValidPubkey(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function getTagEntries(tags: string[][], key: string): string[][] {
    return tags.filter((tag) => Array.isArray(tag) && tag[0] === key && typeof tag[1] === 'string' && tag[1].length > 0);
}

export function getTagValues(tags: string[][], key: string): string[] {
    return getTagEntries(tags, key)
        .map((tag) => tag[1])
        .filter((value): value is string => typeof value === 'string');
}

export function getFirstTagValue(tags: string[][], key: string): string | undefined {
    const values = getTagValues(tags, key);
    return values.length > 0 ? values[0] : undefined;
}

export function getLastTagValue(tags: string[][], key: string): string | undefined {
    const values = getTagValues(tags, key);
    return values.length > 0 ? values[values.length - 1] : undefined;
}

export function hasTagValue(tags: string[][], key: string, value: string): boolean {
    if (!value) {
        return false;
    }

    return getTagValues(tags, key).includes(value);
}

export function hasPTag(tags: string[][], pubkey: string): boolean {
    return hasTagValue(tags, 'p', pubkey);
}

export function getNumericTagValue(tags: string[][], key: string): number | undefined {
    const rawValue = getFirstTagValue(tags, key);
    if (!rawValue) {
        return undefined;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
        return undefined;
    }

    return parsed;
}

export function getZapSenderPubkey(event: SocialNotificationEvent): string | undefined {
    const descriptionValues = getTagValues(event.tags, 'description');
    const latest = descriptionValues[descriptionValues.length - 1];
    if (!latest) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(latest) as { pubkey?: unknown };
        return isValidPubkey(parsed?.pubkey) ? parsed.pubkey : undefined;
    } catch {
        return undefined;
    }
}
