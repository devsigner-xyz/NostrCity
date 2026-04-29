export interface NostrEvent {
    id: string;
    sig?: string;
    pubkey: string;
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
}

export interface NostrUnsignedEvent {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
}

export interface NostrFilter {
    ids?: string[];
    authors?: string[];
    kinds?: number[];
    search?: string;
    '#e'?: string[];
    '#p'?: string[];
    '#q'?: string[];
    '#t'?: string[];
    since?: number;
    until?: number;
    limit?: number;
}

export interface NostrClient {
    connect(): Promise<void>;
    fetchLatestReplaceableEvent(pubkey: string, kind: number): Promise<NostrEvent | null>;
    fetchEvents(filter: NostrFilter): Promise<NostrEvent[]>;
}

export interface NostrProfileBirthday {
    year?: number;
    month?: number;
    day?: number;
}

export interface NostrProfile {
    pubkey: string;
    name?: string;
    displayName?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    nip05?: string;
    lud16?: string;
    lud06?: string;
    bot?: boolean;
    birthday?: NostrProfileBirthday;
    externalIdentities?: string[];
}

export interface FollowGraphResult {
    ownerPubkey: string;
    follows: string[];
    relayHints: string[];
}
