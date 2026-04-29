import type { UnsignedNostrEvent } from '../../nostr/auth/providers/types';
import type { NostrEvent } from '../../nostr/types';

export const DEFAULT_BLOSSOM_IMAGE_SERVERS = [
    'https://blossom.ditto.pub/',
    'https://blossom.dreamith.to/',
    'https://blossom.primal.net/',
] as const;

export const MAX_BLOSSOM_IMAGE_BYTES = 10 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
]);

interface BlossomUploadResponse {
    url?: string;
    sha256?: string;
    size?: number;
    type?: string;
    nip94?: string[][] | Record<string, string>;
}

interface UploadImageToBlossomOptions {
    signEvent: (event: UnsignedNostrEvent) => Promise<NostrEvent>;
    servers?: readonly string[];
    fetch?: typeof fetch;
    now?: () => number;
}

export interface UploadedImageAttachment {
    url: string;
    tags: string[][];
}

export async function uploadImageToBlossom(file: File, options: UploadImageToBlossomOptions): Promise<UploadedImageAttachment> {
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
        throw new Error('Unsupported image type');
    }

    if (file.size > MAX_BLOSSOM_IMAGE_BYTES) {
        throw new Error('Image file is too large');
    }

    const servers = options.servers?.length ? options.servers : DEFAULT_BLOSSOM_IMAGE_SERVERS;
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const fileHash = await sha256Hex(await file.arrayBuffer());
    const authEvent = await options.signEvent({
        kind: 24242,
        content: 'Upload blob',
        created_at: now(),
        tags: [
            ['t', 'upload'],
            ['x', fileHash],
            ['expiration', String(now() + 60)],
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
            const rawUrl = descriptor.url;
            if (!rawUrl) {
                throw new Error('Blossom upload response is missing url');
            }

            const url = validateResponseUrl(rawUrl, server);
            return {
                url,
                tags: [buildImetaTag(url, file, descriptor, fileHash)],
            };
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Blossom upload failed');
}

function buildImetaTag(url: string, file: File, descriptor: BlossomUploadResponse, fileHash: string): string[] {
    const hash = descriptor.sha256 ?? fileHash;
    const size = descriptor.size ?? file.size;
    const type = descriptor.type ?? file.type;

    return [
        'imeta',
        `url ${url}`,
        `m ${type}`,
        `x ${hash}`,
        `size ${size}`,
    ];
}

function normalizeServerUrl(server: string): string {
    const url = new URL(server);
    url.pathname = url.pathname.replace(/\/*$/, '/');
    return url.toString();
}

function validateResponseUrl(urlString: string, server: string): string {
    const url = new URL(urlString);
    const serverUrl = new URL(server);
    if (url.protocol !== 'https:' || url.hostname !== serverUrl.hostname) {
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
