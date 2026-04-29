import type { UnsignedNostrEvent } from '../../nostr/auth/providers/types';
import type { NostrEvent } from '../../nostr/types';
import { validateImageFile } from './image-file-policy';

export const DEFAULT_BLOSSOM_IMAGE_SERVERS = [
    'https://blossom.ditto.pub/',
    'https://blossom.dreamith.to/',
    'https://blossom.primal.net/',
] as const;

export interface BlossomUploadedBlob {
    url: string;
    sha256: string;
    size: number;
    type: string;
}

interface BlossomUploadResponse {
    url?: string;
    sha256?: string;
    size?: number;
    type?: string;
    nip94?: string[][] | Record<string, string>;
}

export interface UploadImageBlobToBlossomOptions {
    signEvent: (event: UnsignedNostrEvent) => Promise<NostrEvent>;
    servers?: readonly string[];
    fetch?: typeof fetch;
    now?: () => number;
}

const HEX_64_PATTERN = /^[a-f0-9]{64}$/;

export async function uploadImageBlobToBlossom(file: File, options: UploadImageBlobToBlossomOptions): Promise<BlossomUploadedBlob> {
    const validation = await validateImageFile(file);
    if (!validation.ok) {
        throw new Error(errorMessageForRejection(validation.reason));
    }

    const servers = options.servers?.length ? options.servers : DEFAULT_BLOSSOM_IMAGE_SERVERS;
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const fileHash = await sha256Hex(await file.arrayBuffer());
    const authCreatedAt = now();
    const authEvent = await options.signEvent({
        kind: 24242,
        content: 'Upload blob',
        created_at: authCreatedAt,
        tags: [
            ['t', 'upload'],
            ['x', fileHash],
            ['expiration', String(authCreatedAt + 60)],
        ],
    });
    const authorization = `Nostr ${base64Json(authEvent)}`;
    let lastError: unknown;

    for (const server of servers) {
        try {
            const uploadUrl = new URL('/upload', normalizeServerUrl(server)).toString();
            const response = await fetchImpl(uploadUrl, {
                method: 'PUT',
                headers: {
                    authorization,
                    'content-type': file.type,
                    'x-sha-256': fileHash,
                },
                body: file,
            });

            if (!response.ok) {
                throw new Error(`Blossom upload failed with ${response.status}`);
            }

            const descriptor = await response.json() as BlossomUploadResponse;
            if (descriptor.sha256 !== undefined && !HEX_64_PATTERN.test(descriptor.sha256)) {
                throw new Error('Blossom upload returned an invalid hash');
            }

            if (!descriptor.url) {
                throw new Error('Blossom upload response is missing url');
            }

            return {
                url: validateResponseUrl(descriptor.url, server),
                sha256: fileHash,
                size: file.size,
                type: file.type,
            };
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Blossom upload failed');
}

function errorMessageForRejection(reason: string | undefined): string {
    if (reason === 'unsupported-type') {
        return 'Unsupported image type';
    }

    if (reason === 'too-large') {
        return 'Image file is too large';
    }

    if (reason === 'invalid-signature') {
        return 'Invalid image signature';
    }

    return 'Missing image file';
}

function normalizeServerUrl(server: string): string {
    const url = new URL(server);
    url.pathname = url.pathname.replace(/\/*$/, '/');
    return url.toString();
}

function validateResponseUrl(urlString: string, server: string): string {
    const url = new URL(urlString);
    const serverUrl = new URL(server);

    if (
        url.protocol !== 'https:'
        || url.origin !== serverUrl.origin
        || url.username
        || url.password
        || url.hash
    ) {
        throw new Error('Blossom upload returned an unsafe URL');
    }

    return url.toString();
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function base64Json(value: unknown): string {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}
