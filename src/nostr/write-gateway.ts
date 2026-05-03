import { isEncryptionEnabled, type AuthSessionState, type EncryptionScheme } from './auth/session';
import {
    AUTH_PROVIDER_ERROR,
    AuthProviderError,
    type AuthProvider,
    type UnsignedNostrEvent,
} from './auth/providers/types';
import type { NostrEvent } from './types';
import { buildEncryptedMuteListContent } from './mute-list';
import { buildContactListTags } from './follows';

interface WriteGatewayOptions {
    getSession: () => AuthSessionState | undefined;
    getProvider: () => AuthProvider | undefined;
    now?: () => number;
}

function dedupePubkeys(pubkeys: string[]): string[] {
    return [...new Set(pubkeys.filter((pubkey) => /^[a-f0-9]{64}$/.test(pubkey)))];
}

function requireWritableSession(options: WriteGatewayOptions): { session: AuthSessionState; provider: AuthProvider } {
    const session = options.getSession();
    if (!session) {
        throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE, 'No active auth session');
    }

    if (session.readonly || !session.capabilities.canSign) {
        throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_READONLY, 'Current auth session is readonly');
    }

    if (session.locked) {
        throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_LOCKED, 'Current auth session is locked');
    }

    const provider = options.getProvider();
    if (!provider) {
        throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE, 'No active auth provider');
    }

    return { session, provider };
}

function requireEncryption(
    options: WriteGatewayOptions,
    scheme: EncryptionScheme = 'nip44'
): { session: AuthSessionState; provider: AuthProvider } {
    const required = requireWritableSession(options);
    if (!isEncryptionEnabled(required.session, scheme)) {
        throw new AuthProviderError(AUTH_PROVIDER_ERROR.AUTH_PROVIDER_UNAVAILABLE, 'Current auth session cannot encrypt messages');
    }

    return required;
}

export function createWriteGateway(options: WriteGatewayOptions) {
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));

    return {
        async publishEvent(event: UnsignedNostrEvent): Promise<NostrEvent> {
            const { provider } = requireWritableSession(options);
            return provider.signEvent(event);
        },

        async publishTextNote(content: string, tags: string[][] = []): Promise<NostrEvent> {
            return this.publishEvent({
                kind: 1,
                content,
                created_at: now(),
                tags,
            });
        },

        async publishProfileMetadata(content: string): Promise<NostrEvent> {
            return this.publishEvent({
                kind: 0,
                content,
                created_at: now(),
                tags: [],
            });
        },

        async publishContactList(follows: string[], preservedTags: string[][] = []): Promise<NostrEvent> {
            const tags = buildContactListTags(follows, preservedTags);

            return this.publishEvent({
                kind: 3,
                content: '',
                created_at: now(),
                tags,
            });
        },

        async publishMuteList(mutedPubkeys: string[], preservedTags: string[][] = []): Promise<NostrEvent> {
            const { session, provider } = requireEncryption(options, 'nip44');
            const content = await buildEncryptedMuteListContent({
                tags: [...preservedTags, ...dedupePubkeys(mutedPubkeys).map((pubkey) => ['p', pubkey])],
                provider,
                ownerPubkey: session.pubkey,
            });

            return this.publishEvent({
                kind: 10000,
                content,
                created_at: now(),
                tags: [],
            });
        },

        async encryptDm(pubkey: string, plaintext: string): Promise<string> {
            const { provider } = requireEncryption(options, 'nip44');
            return provider.encrypt(pubkey, plaintext, 'nip44');
        },

        async decryptDm(pubkey: string, ciphertext: string, scheme: EncryptionScheme = 'nip44'): Promise<string> {
            const { provider } = requireEncryption(options, scheme);
            return provider.decrypt(pubkey, ciphertext, scheme);
        },
    };
}
