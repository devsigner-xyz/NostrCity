import type { AuthProvider } from './auth/providers/types';
import type { NostrEvent } from './types';

function normalizeHexPubkey(value: string): string | null {
    const normalized = value.trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function dedupePubkeys(pubkeys: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const pubkey of pubkeys) {
        const normalized = normalizeHexPubkey(pubkey);
        if (!normalized || seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        result.push(normalized);
    }

    return result;
}

function isLegacyNip04Ciphertext(content: string): boolean {
    return content.includes('?iv=');
}

function normalizeMuteTag(tag: string[]): string[] | null {
    if (tag.length === 0 || typeof tag[0] !== 'string') {
        return null;
    }

    if (tag[0] === 'p') {
        const normalizedPubkey = typeof tag[1] === 'string' ? normalizeHexPubkey(tag[1]) : null;
        return normalizedPubkey ? ['p', normalizedPubkey] : null;
    }

    return tag.every((item) => typeof item === 'string') ? [...tag] : null;
}

function dedupeMuteTags(tags: string[][]): string[][] {
    const seen = new Set<string>();
    const result: string[][] = [];
    for (const tag of tags) {
        const normalized = normalizeMuteTag(tag);
        if (!normalized) {
            continue;
        }

        const key = JSON.stringify(normalized);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(normalized);
    }

    return result;
}

function parseMuteTags(value: unknown): string[][] {
    if (!Array.isArray(value)) {
        return [];
    }

    return dedupeMuteTags(value.filter((tag): tag is string[] => Array.isArray(tag) && tag.every((item) => typeof item === 'string')));
}

export function parseMutedPubkeysFromTags(tags: string[][]): string[] {
    return dedupePubkeys(
        tags
            .filter((tag) => tag[0] === 'p' && typeof tag[1] === 'string')
            .map((tag) => tag[1] as string)
    );
}

export async function extractMutedPubkeys(input: {
    event: NostrEvent | null | undefined;
    provider?: AuthProvider;
    ownerPubkey: string;
    strict?: boolean;
}): Promise<string[]> {
    return parseMutedPubkeysFromTags(await extractMuteListTags(input));
}

export async function extractMuteListTags(input: {
    event: NostrEvent | null | undefined;
    provider?: AuthProvider;
    ownerPubkey: string;
    strict?: boolean;
}): Promise<string[][]> {
    if (!input.event) {
        return [];
    }

    const publicTags = parseMuteTags(input.event.tags);
    if (!input.event.content || !input.provider) {
        if (input.strict && input.event.content) {
            throw new Error('No se pudo leer la mute list cifrada actual');
        }
        return publicTags;
    }

    try {
        const scheme = isLegacyNip04Ciphertext(input.event.content) ? 'nip04' : 'nip44';
        const decrypted = await input.provider.decrypt(input.ownerPubkey, input.event.content, scheme);
        return dedupeMuteTags([...publicTags, ...parseMuteTags(JSON.parse(decrypted) as unknown)]);
    } catch {
        if (input.strict) {
            throw new Error('No se pudo preservar la mute list cifrada actual');
        }
        return publicTags;
    }
}

export async function buildEncryptedMuteListContent(input: {
    mutedPubkeys?: string[];
    tags?: string[][];
    provider: AuthProvider;
    ownerPubkey: string;
}): Promise<string> {
    const privateTags = input.tags
        ? dedupeMuteTags(input.tags)
        : dedupePubkeys(input.mutedPubkeys ?? []).map((pubkey) => ['p', pubkey]);
    return input.provider.encrypt(input.ownerPubkey, JSON.stringify(privateTags), 'nip44');
}
