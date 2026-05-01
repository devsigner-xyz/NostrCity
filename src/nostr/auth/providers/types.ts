import type { RelaySettingsState } from '../../relay-settings';
import type { NostrEvent } from '../../types';
import {
    defaultCapabilitiesForMethod,
    type AuthSessionState,
    type EncryptionScheme,
    type LoginMethod,
    type SessionCapabilities,
} from '../session';

export const AUTH_PROVIDER_ERROR = {
    AUTH_READONLY: 'AUTH_READONLY',
    AUTH_LOCKED: 'AUTH_LOCKED',
    AUTH_PROVIDER_UNAVAILABLE: 'AUTH_PROVIDER_UNAVAILABLE',
    AUTH_INVALID_INPUT: 'AUTH_INVALID_INPUT',
} as const;

export type AuthProviderErrorCode = (typeof AUTH_PROVIDER_ERROR)[keyof typeof AUTH_PROVIDER_ERROR];

export class AuthProviderError extends Error {
    code: AuthProviderErrorCode;

    constructor(code: AuthProviderErrorCode, message: string) {
        super(message);
        this.name = 'AuthProviderError';
        this.code = code;
    }
}

export interface ProviderResolveInput {
    credential?: string;
    passphrase?: string;
    pubkey?: string;
    bunkerUri?: string;
    clientSecretKey?: Uint8Array;
    secretKey?: Uint8Array;
    profile?: {
        name?: string;
        about?: string;
        picture?: string;
    };
    relaySettings?: RelaySettingsState;
}

export interface ProviderResolvedSession extends Pick<AuthSessionState, 'method' | 'pubkey' | 'readonly' | 'locked' | 'capabilities'> {
    metadata?: Record<string, string>;
}

export interface UnsignedNostrEvent {
    kind: number;
    content: string;
    created_at: number;
    tags: string[][];
}

export interface AuthProvider {
    method: LoginMethod;
    supports: SessionCapabilities;
    resolveSession(input: ProviderResolveInput): Promise<ProviderResolvedSession>;
    signEvent(event: UnsignedNostrEvent): Promise<NostrEvent>;
    encrypt(pubkey: string, plaintext: string, scheme?: EncryptionScheme): Promise<string>;
    decrypt(pubkey: string, ciphertext: string, scheme?: EncryptionScheme): Promise<string>;
    lock(): Promise<void>;
}

export function capabilitiesForMethod(method: LoginMethod): SessionCapabilities {
    return defaultCapabilitiesForMethod(method);
}

export function methodSupports(method: LoginMethod, capability: 'sign' | 'encrypt'): boolean {
    const capabilities = capabilitiesForMethod(method);
    return capability === 'sign' ? capabilities.canSign : capabilities.canEncrypt;
}
