import { verifyEvent } from 'nostr-tools/pure';
import { getBootstrapRelays, mergeRelaySets } from '../nostr/relay-policy';
import { getRelaySetByType, loadRelaySettings } from '../nostr/relay-settings';
import type { PublishResult } from '../nostr/dm-types';
import { buildContactListTags } from '../nostr/follows';
import { createPublishForwardApi, type PublishForwardApi, type SignedNostrEvent } from '../nostr-api/publish-forward-api';
import type { HttpClient } from '../nostr-api/http-client';
import type { PublishEventInput, PublishEventResult, WriteGatewayLike } from './query/following-feed.mutations';

type SignedPublishEventResult = PublishEventResult & { sig: string };
const MAX_SOCIAL_RELAYS = 8;
const ALLOWED_SOCIAL_RELAY_HOSTS = new Set([
    'relay.damus.io',
    'relay.primal.net',
    'nos.lol',
    'relay.nostr.band',
]);

export interface SocialPublisher extends WriteGatewayLike {
    publishEvent(event: PublishEventInput): Promise<SignedPublishEventResult>;
    publishTextNote(content: string, tags?: string[][]): Promise<SignedPublishEventResult>;
    publishProfileMetadata(content: string): Promise<SignedPublishEventResult>;
    publishContactList(follows: string[], preservedTags?: string[][]): Promise<SignedPublishEventResult>;
    publishMuteList(mutedPubkeys: string[], preservedTags?: string[][]): Promise<SignedPublishEventResult>;
}

interface SocialPublisherWriteGateway extends WriteGatewayLike {
    publishProfileMetadata?: (content: string) => Promise<PublishEventResult>;
    publishContactList?: (follows: string[], preservedTags?: string[][]) => Promise<PublishEventResult>;
    publishMuteList?: (mutedPubkeys: string[], preservedTags?: string[][]) => Promise<PublishEventResult>;
    decryptDm?: (pubkey: string, ciphertext: string, scheme?: 'nip04' | 'nip44') => Promise<string>;
}

interface CreateSocialPublisherOptions {
    writeGateway: SocialPublisherWriteGateway;
    publishForwardApi?: PublishForwardApi;
    client?: HttpClient;
    resolveOwnerPubkey?: () => string | undefined;
    resolveRelays?: () => string[];
    now?: () => number;
}

function normalizePublishRelays(relays: string[]): string[] {
    const merged = mergeRelaySets(relays);
    const allowed = merged.filter((relay) => {
        try {
            return ALLOWED_SOCIAL_RELAY_HOSTS.has(new URL(relay).hostname);
        } catch {
            return false;
        }
    });
    if (allowed.length > 0) {
        return allowed.slice(0, MAX_SOCIAL_RELAYS);
    }

    if (merged.length > 0) {
        throw new Error('No allowed social relays configured');
    }

    return getBootstrapRelays().filter((relay) => {
            try {
                return ALLOWED_SOCIAL_RELAY_HOSTS.has(new URL(relay).hostname);
            } catch {
                return false;
            }
        }).slice(0, MAX_SOCIAL_RELAYS);
}

function defaultResolveRelays(resolveOwnerPubkey?: () => string | undefined): string[] {
    const ownerPubkey = resolveOwnerPubkey?.();
    const relaySettings = loadRelaySettings(ownerPubkey ? { ownerPubkey } : undefined);
    return normalizePublishRelays([
        ...getRelaySetByType(relaySettings, 'nip65Both'),
        ...getRelaySetByType(relaySettings, 'nip65Write'),
    ]);
}

function assertPublishAck(result: PublishResult, requestedRelays: string[]): void {
    const requestedRelaySet = new Set(requestedRelays);
    if (result.ackedRelays.some((relay) => requestedRelaySet.has(relay))) {
        return;
    }

    throw new Error('No social relays acknowledged the event');
}

function assertSignedEvent(event: PublishEventResult): asserts event is SignedPublishEventResult {
    const sig = (event as Partial<SignedPublishEventResult>).sig;
    if (typeof sig !== 'string' || sig.length === 0) {
        throw new Error('Signed social event is missing sig');
    }

    try {
        if (verifyEvent(event as Parameters<typeof verifyEvent>[0])) {
            return;
        }
    } catch {
        // Fall through to a stable, non-sensitive error below.
    }

    throw new Error('Signed social event failed NIP-01 verification');
}

function tagsMatch(left: string[][], right: string[][]): boolean {
    return left.length === right.length && left.every((tag, tagIndex) => {
        const expectedTag = right[tagIndex];
        if (!expectedTag || tag.length !== expectedTag.length) {
            return false;
        }

        return tag.every((value, valueIndex) => value === expectedTag[valueIndex]);
    });
}

function assertSignedEventMatchesRequest(
    event: PublishEventResult,
    expected: Pick<PublishEventInput, 'kind' | 'content' | 'tags'> & Partial<Pick<PublishEventInput, 'created_at'>>,
    expectedPubkey?: string
): void {
    if (expectedPubkey && event.pubkey !== expectedPubkey) {
        throw new Error('Signed social event did not match the active owner');
    }

    if (
        event.kind !== expected.kind ||
        event.content !== expected.content ||
        !tagsMatch(event.tags, expected.tags) ||
        (expected.created_at !== undefined && event.created_at !== expected.created_at)
    ) {
        throw new Error('Signed social event did not match the requested write');
    }
}

function assertSignedEventMatchesOwner(event: PublishEventResult, expectedPubkey: string | undefined): void {
    if (expectedPubkey && event.pubkey !== expectedPubkey) {
        throw new Error('Signed social event did not match the active owner');
    }
}

function assertEncryptedMuteListEvent(event: PublishEventResult): void {
    if (event.kind !== 10000 || event.tags.some((tag) => tag[0] === 'p')) {
        throw new Error('Signed mute list must not expose muted pubkeys');
    }

    if (event.content.length === 0) {
        throw new Error('Signed mute list is missing encrypted content');
    }
}

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

function buildExpectedMuteListPrivateTags(mutedPubkeys: string[], preservedTags: string[][]): string[][] {
    return [
        ...preservedTags,
        ...dedupePubkeys(mutedPubkeys).map((pubkey) => ['p', pubkey]),
    ];
}

function parseDecryptedMuteListTags(decrypted: string): string[][] | null {
    try {
        const parsed = JSON.parse(decrypted) as unknown;
        if (!Array.isArray(parsed)) {
            return null;
        }

        const tags = parsed.filter((tag): tag is string[] => Array.isArray(tag) && tag.every((item) => typeof item === 'string'));
        return tags.length === parsed.length ? tags : null;
    } catch {
        return null;
    }
}

async function assertEncryptedMuteListMatchesRequest(input: {
    event: PublishEventResult;
    mutedPubkeys: string[];
    preservedTags: string[][];
    ownerPubkey: string;
    decryptDm?: SocialPublisherWriteGateway['decryptDm'];
}): Promise<void> {
    if (!input.decryptDm) {
        throw new Error('Encrypted mute list verification is unavailable');
    }

    let decrypted: string;
    try {
        decrypted = await input.decryptDm(input.ownerPubkey, input.event.content, 'nip44');
    } catch {
        throw new Error('Signed mute list did not match the requested write');
    }

    const decryptedTags = parseDecryptedMuteListTags(decrypted);
    const expectedTags = buildExpectedMuteListPrivateTags(input.mutedPubkeys, input.preservedTags);
    if (!decryptedTags || !tagsMatch(decryptedTags, expectedTags)) {
        throw new Error('Signed mute list did not match the requested write');
    }
}

export function createSocialPublisher(options: CreateSocialPublisherOptions): SocialPublisher {
    const publishForwardApi = options.publishForwardApi ?? createPublishForwardApi(
        options.client ? { client: options.client } : undefined,
    );
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));

    const resolvePublishRelays = (): string[] => (
        options.resolveRelays
            ? normalizePublishRelays(options.resolveRelays())
            : defaultResolveRelays(options.resolveOwnerPubkey)
    );
    const resolveExpectedOwnerPubkey = (): string | undefined => options.resolveOwnerPubkey?.();

    const forwardSignedEvent = async (event: PublishEventResult): Promise<SignedPublishEventResult> => {
        assertSignedEvent(event);
        const relays = resolvePublishRelays();
        const result = await publishForwardApi.forward({
            event: event as SignedNostrEvent,
            relayScope: 'social',
            relays,
        });
        assertPublishAck(result, relays);
        return event;
    };

    return {
        async publishEvent(event) {
            const signedEvent = await options.writeGateway.publishEvent(event);
            assertSignedEventMatchesRequest(signedEvent, event, resolveExpectedOwnerPubkey());
            return forwardSignedEvent(signedEvent);
        },
        async publishTextNote(content, tags = []) {
            const publishTextNote = options.writeGateway.publishTextNote;
            const signedEvent = publishTextNote
                ? await publishTextNote.call(options.writeGateway, content, tags)
                : await options.writeGateway.publishEvent({
                    kind: 1,
                    content,
                    created_at: now(),
                    tags,
                });
            assertSignedEventMatchesRequest(signedEvent, { kind: 1, content, tags }, resolveExpectedOwnerPubkey());
            return forwardSignedEvent(signedEvent);
        },
        async publishProfileMetadata(content) {
            const publishProfileMetadata = options.writeGateway.publishProfileMetadata;
            const signedEvent = publishProfileMetadata
                ? await publishProfileMetadata.call(options.writeGateway, content)
                : await options.writeGateway.publishEvent({
                    kind: 0,
                    content,
                    created_at: now(),
                    tags: [],
                });
            assertSignedEventMatchesRequest(signedEvent, { kind: 0, content, tags: [] }, resolveExpectedOwnerPubkey());
            return forwardSignedEvent(signedEvent);
        },
        async publishContactList(follows, preservedTags = []) {
            const publishContactList = options.writeGateway.publishContactList;
            const expectedTags = buildContactListTags(follows, preservedTags);
            const signedEvent = publishContactList
                ? await publishContactList.call(options.writeGateway, follows, preservedTags)
                : await options.writeGateway.publishEvent({
                    kind: 3,
                    content: '',
                    created_at: now(),
                    tags: expectedTags,
                });
            assertSignedEventMatchesRequest(signedEvent, { kind: 3, content: '', tags: expectedTags }, resolveExpectedOwnerPubkey());
            return forwardSignedEvent(signedEvent);
        },
        async publishMuteList(mutedPubkeys, preservedTags = []) {
            const publishMuteList = options.writeGateway.publishMuteList;
            if (!publishMuteList) {
                throw new Error('Encrypted mute list publishing is unavailable');
            }

            const signedEvent = await publishMuteList.call(options.writeGateway, mutedPubkeys, preservedTags);
            assertEncryptedMuteListEvent(signedEvent);
            const expectedOwnerPubkey = resolveExpectedOwnerPubkey();
            assertSignedEventMatchesOwner(signedEvent, expectedOwnerPubkey);
            await assertEncryptedMuteListMatchesRequest({
                event: signedEvent,
                mutedPubkeys,
                preservedTags,
                ownerPubkey: expectedOwnerPubkey ?? signedEvent.pubkey,
                decryptDm: options.writeGateway.decryptDm,
            });
            return forwardSignedEvent(signedEvent);
        },
    };
}
