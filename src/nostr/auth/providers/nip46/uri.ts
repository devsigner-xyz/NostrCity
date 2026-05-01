const HEX64_LOWER = /^[a-f0-9]{64}$/;
const MAX_NIP46_RELAYS = 8;

export interface ParsedBunkerUri {
    type: 'bunker';
    remoteSignerPubkey: string;
    relays: string[];
    secret?: string;
}

export interface ParsedNostrConnectUri {
    type: 'nostrconnect';
    clientPubkey: string;
    relays: string[];
    secret: string;
    perms: string[];
    name?: string;
    url?: string;
    image?: string;
}

export type ParsedNip46Uri = ParsedBunkerUri | ParsedNostrConnectUri;

function parsePubkeyFromHost(url: URL): string {
    const pubkey = url.host;
    if (!HEX64_LOWER.test(pubkey)) {
        throw new Error('NIP-46 URI pubkey must be 64-char lowercase hex');
    }
    return pubkey;
}

function normalizeNip46RelayUrl(relay: string): string | null {
    try {
        const parsed = new URL(relay);
        if (parsed.protocol !== 'wss:') {
            return null;
        }
        if (parsed.username || parsed.password || parsed.hash) {
            return null;
        }

        parsed.search = '';
        const normalized = parsed.toString();
        return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    } catch {
        return null;
    }
}

function parseRelays(parsed: URL): string[] {
    if (parsed.hash) {
        throw new Error('NIP-46 URI contains invalid relay URL');
    }

    const params = parsed.searchParams;
    const relays = params.getAll('relay');
    if (relays.length === 0) {
        throw new Error('bunker uri requires at least one relay');
    }

    const normalized = relays.map((relay) => normalizeNip46RelayUrl(relay));
    if (normalized.some((value) => value === null)) {
        throw new Error('NIP-46 URI contains invalid relay URL');
    }

    return [...new Set(normalized as string[])].slice(0, MAX_NIP46_RELAYS);
}

function parsePerms(params: URLSearchParams): string[] {
    const raw = params.get('perms');
    if (!raw) {
        return [];
    }

    return raw
        .split(',')
        .map((permission) => permission.trim())
        .filter((permission) => permission.length > 0);
}

export function parseNip46Uri(input: string): ParsedNip46Uri {
    const value = input.trim();
    let parsed: URL;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error('Invalid NIP-46 URI');
    }

    if (parsed.protocol !== 'bunker:' && parsed.protocol !== 'nostrconnect:') {
        throw new Error('Unsupported NIP-46 URI scheme');
    }

    if (parsed.username || parsed.password) {
        throw new Error('NIP-46 URI must not contain credentials');
    }

    const pubkey = parsePubkeyFromHost(parsed);
    const relays = parseRelays(parsed);

    if (parsed.protocol === 'bunker:') {
        const secret = parsed.searchParams.get('secret') || undefined;
        const bunkerUri: ParsedBunkerUri = {
            type: 'bunker',
            remoteSignerPubkey: pubkey,
            relays,
        };

        if (secret !== undefined) {
            bunkerUri.secret = secret;
        }

        return bunkerUri;
    }

    const secret = parsed.searchParams.get('secret');
    if (!secret) {
        throw new Error('nostrconnect uri requires secret parameter');
    }

    const name = parsed.searchParams.get('name') || undefined;
    const url = parsed.searchParams.get('url') || undefined;
    const image = parsed.searchParams.get('image') || undefined;

    const nostrConnectUri: ParsedNostrConnectUri = {
        type: 'nostrconnect',
        clientPubkey: pubkey,
        relays,
        secret,
        perms: parsePerms(parsed.searchParams),
    };

    if (name !== undefined) {
        nostrConnectUri.name = name;
    }
    if (url !== undefined) {
        nostrConnectUri.url = url;
    }
    if (image !== undefined) {
        nostrConnectUri.image = image;
    }

    return nostrConnectUri;
}
