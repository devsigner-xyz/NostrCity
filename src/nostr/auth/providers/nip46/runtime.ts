import { nip44 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { Nip46Cipher } from './crypto';
import type { Nip46TransportEvent } from './transport';
import type { ParsedNip46Uri } from './uri';

type Nip46TransportEventDraft = Omit<Nip46TransportEvent, 'id' | 'sig'> & Partial<Pick<Nip46TransportEvent, 'id' | 'sig'>>;

export const NIP46_RECOMMENDED_PERMISSIONS = [
    'get_public_key',
    'ping',
    'sign_event:1',
    'sign_event:9',
    'sign_event:9021',
    'sign_event:9022',
    'sign_event:10009',
    'nip44_encrypt',
    'nip44_decrypt',
] as const;

interface Nip46PoolLike {
    publish(relays: string[], event: Parameters<SimplePool['publish']>[1]): Promise<string>[];
    subscribe(relays: string[], filter: Parameters<SimplePool['subscribe']>[1], params: Parameters<SimplePool['subscribe']>[2]): { close: (reason?: string) => void };
    close?: (relays: string[]) => void;
}

interface CreateNip46RuntimeInput {
    parsedUri: ParsedNip46Uri;
    pool?: Nip46PoolLike;
    clientSecretKey?: Uint8Array;
    remoteSignerPubkey?: string;
    relays?: string[];
}

interface CreateCipherInput {
    localSecretKey: Uint8Array;
    remotePubkey: string;
}

export function createNip46CipherForSigner(input: CreateCipherInput): Nip46Cipher {
    const conversationKey = nip44.v2.utils.getConversationKey(input.localSecretKey, input.remotePubkey);

    return {
        async encrypt(plaintext: string): Promise<string> {
            return nip44.v2.encrypt(plaintext, conversationKey);
        },
        async decrypt(ciphertext: string): Promise<string> {
            return nip44.v2.decrypt(ciphertext, conversationKey);
        },
    };
}

export function generateNip46PairingSecret(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function waitForAnyPublish(published: Promise<string>[]): Promise<void> {
    if (published.length === 0) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        let rejectedCount = 0;
        const errors: unknown[] = [];
        for (const publish of published) {
            publish.then(
                () => resolve(),
                (error: unknown) => {
                    errors.push(error);
                    rejectedCount += 1;
                    if (rejectedCount === published.length) {
                        reject(errors[0] instanceof Error ? errors[0] : new Error('Failed to publish NIP-46 request'));
                    }
                }
            );
        }
    });
}

export function createNostrConnectUri(input: { clientPubkey: string; relays: string[]; secret: string; name?: string }): string {
    const uri = new URL(`nostrconnect://${input.clientPubkey}`);
    for (const relay of input.relays) {
        uri.searchParams.append('relay', relay);
    }
    uri.searchParams.set('secret', input.secret);
    uri.searchParams.set('perms', NIP46_RECOMMENDED_PERMISSIONS.join(','));
    if (input.name) {
        uri.searchParams.set('name', input.name);
    }

    return uri.toString();
}

export function redactNip46Status(message: string): string {
    return message
        .replace(/(?:bunker|nostrconnect):\/\/[^\s]+/gi, '[redacted-nip46-uri]')
        .replace(/secret=[^\s&]+/gi, 'secret=[redacted]')
        .replace(/auth_url:https:\/\/[^\s]+/gi, 'auth_url:[redacted]');
}

export function parseNip46AuthUrl(result: string | undefined): { hostname: string } | null {
    if (!result?.startsWith('auth_url:')) {
        return null;
    }

    try {
        const parsed = new URL(result.slice('auth_url:'.length));
        if (parsed.protocol !== 'https:') {
            return null;
        }

        return { hostname: parsed.hostname };
    } catch {
        return null;
    }
}

export function createNip46Runtime(input: CreateNip46RuntimeInput) {
    const localSecretKey = input.clientSecretKey ?? generateSecretKey();
    const localPubkey = getPublicKey(localSecretKey);
    if (input.parsedUri.type === 'nostrconnect' && input.parsedUri.clientPubkey !== localPubkey) {
        throw new Error('NIP-46 nostrconnect client key does not match runtime key');
    }

    const remoteSignerPubkey = input.remoteSignerPubkey ?? (input.parsedUri.type === 'bunker' ? input.parsedUri.remoteSignerPubkey : undefined);
    const pool = input.pool ?? new SimplePool();
    const relays = input.relays ?? input.parsedUri.relays;
    let subscription: { close: (reason?: string) => void } | undefined;
    const createCipher = (remotePubkey: string) => createNip46CipherForSigner({ localSecretKey, remotePubkey });

    return {
        localPubkey,
        remoteSignerPubkey,
        cipher: remoteSignerPubkey ? createCipher(remoteSignerPubkey) : undefined,
        createCipher,
        transport: {
            async publish(event: Nip46TransportEventDraft): Promise<void> {
                const signedEvent = finalizeEvent(
                    {
                        kind: event.kind,
                        tags: event.tags,
                        content: event.content,
                        created_at: event.created_at,
                    },
                    localSecretKey
                );
                const published = pool.publish(relays, signedEvent);
                await waitForAnyPublish(published);
            },
            subscribe(handler: (event: Nip46TransportEvent) => void): () => void {
                subscription = pool.subscribe(
                    relays,
                    { kinds: [24133], '#p': [localPubkey] },
                    {
                        onevent(event) {
                            handler(event);
                        },
                    }
                );
                return () => subscription?.close('closed');
            },
        },
        close(): void {
            subscription?.close('closed');
            pool.close?.(relays);
        },
    };
}
