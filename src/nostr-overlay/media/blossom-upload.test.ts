import { describe, expect, test, vi } from 'vitest';
import { uploadImageBlobToBlossom } from './blossom-upload';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function imageFile(bytes: Uint8Array, name: string, type: string) {
    const copy: Uint8Array<ArrayBuffer> = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new File([copy.buffer], name, { type });
}

async function sha256Hex(file: File): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

describe('uploadImageBlobToBlossom', () => {
    test('uploads a validated image and returns a generic Blossom blob', async () => {
        const file = imageFile(PNG_BYTES, 'city.png', 'image/png');
        const expectedHash = await sha256Hex(file);
        const signedAuth = {
            id: 'auth-event',
            pubkey: 'a'.repeat(64),
            kind: 24242,
            created_at: 100,
            tags: [],
            content: '',
            sig: 'b'.repeat(128),
        };
        const signEvent = vi.fn(async () => signedAuth);
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            url: `https://blossom.example/${'c'.repeat(64)}`,
            sha256: 'c'.repeat(64),
            size: file.size,
            type: 'image/png',
        }), { status: 200 }));

        const result = await uploadImageBlobToBlossom(file, {
            servers: ['https://blossom.example/'],
            signEvent,
            fetch: fetchImpl,
            now: () => 100,
        });

        expect(result).toEqual({
            url: `https://blossom.example/${'c'.repeat(64)}`,
            sha256: expectedHash,
            size: file.size,
            type: 'image/png',
        });
        expect(signEvent).toHaveBeenCalledWith(expect.objectContaining({
            kind: 24242,
            tags: expect.arrayContaining([
                ['t', 'upload'],
                ['x', expectedHash],
                ['expiration', '160'],
            ]),
        }));
        expect(fetchImpl).toHaveBeenCalledWith('https://blossom.example/upload', expect.objectContaining({
            method: 'PUT',
            body: file,
            headers: expect.objectContaining({
                authorization: `Nostr ${btoa(JSON.stringify(signedAuth))}`,
                'content-type': 'image/png',
                'x-sha-256': expectedHash,
            }),
        }));
    });

    test('tries the next server when an upload fails', async () => {
        const file = imageFile(JPEG_BYTES, 'city.jpg', 'image/jpeg');
        const signEvent = vi.fn(async (event) => ({
            ...event,
            id: 'auth-event',
            pubkey: 'a'.repeat(64),
            sig: 'b'.repeat(128),
        }));
        const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
            if (String(url).startsWith('https://first.example/')) {
                return new Response('nope', { status: 500 });
            }

            return new Response(JSON.stringify({
                url: `https://second.example/${'d'.repeat(64)}.jpg`,
                sha256: 'd'.repeat(64),
                size: file.size,
                type: 'image/jpeg',
            }), { status: 200 });
        });

        const result = await uploadImageBlobToBlossom(file, {
            servers: ['https://first.example/', 'https://second.example/'],
            signEvent,
            fetch: fetchImpl,
            now: () => 100,
        });

        expect(result.url).toBe(`https://second.example/${'d'.repeat(64)}.jpg`);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('rejects invalid image files before signing or uploading', async () => {
        const file = new File(['<svg></svg>'], 'vector.svg', { type: 'image/svg+xml' });
        const signEvent = vi.fn();
        const fetchImpl = vi.fn();

        await expect(uploadImageBlobToBlossom(file, {
            servers: ['https://blossom.example/'],
            signEvent,
            fetch: fetchImpl,
        })).rejects.toThrow('Unsupported image type');

        expect(signEvent).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test.each([
        `http://blossom.example/${'e'.repeat(64)}.jpg`,
        `https://evil.example/${'e'.repeat(64)}.jpg`,
        `https://user:pass@blossom.example/${'e'.repeat(64)}.jpg`,
        `https://blossom.example/${'e'.repeat(64)}.jpg#fragment`,
    ])('rejects unsafe response URL %s', async (url) => {
        const file = imageFile(JPEG_BYTES, 'city.jpg', 'image/jpeg');
        const signEvent = vi.fn(async (event) => ({
            ...event,
            id: 'auth-event',
            pubkey: 'a'.repeat(64),
            sig: 'b'.repeat(128),
        }));
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ url }), { status: 200 }));

        await expect(uploadImageBlobToBlossom(file, {
            servers: ['https://blossom.example/'],
            signEvent,
            fetch: fetchImpl,
            now: () => 100,
        })).rejects.toThrow('unsafe URL');
    });
});
