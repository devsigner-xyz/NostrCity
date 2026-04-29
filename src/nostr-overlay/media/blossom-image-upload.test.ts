import { describe, expect, test, vi } from 'vitest';
import { uploadImageToBlossom } from './blossom-image-upload';

describe('uploadImageToBlossom', () => {
    test('uploads an image to Blossom and returns content URL with imeta tags', async () => {
        const file = new File(['image-bytes'], 'city.png', { type: 'image/png' });
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

        const result = await uploadImageToBlossom(file, {
            servers: ['https://blossom.example/'],
            signEvent,
            fetch: fetchImpl,
            now: () => 100,
        });

        expect(result.url).toBe(`https://blossom.example/${'c'.repeat(64)}`);
        expect(result.tags).toContainEqual(['imeta',
            `url https://blossom.example/${'c'.repeat(64)}`,
            'm image/png',
            `x ${'c'.repeat(64)}`,
            `size ${file.size}`,
        ]);
        expect(signEvent).toHaveBeenCalledWith(expect.objectContaining({
            kind: 24242,
            tags: expect.arrayContaining([
                ['t', 'upload'],
                ['x', expect.stringMatching(/^[a-f0-9]{64}$/)],
                ['expiration', '160'],
            ]),
        }));
        expect(fetchImpl).toHaveBeenCalledWith('https://blossom.example/upload', expect.objectContaining({
            method: 'PUT',
            body: file,
        }));
    });

    test('tries the next default server when an upload fails', async () => {
        const file = new File(['image-bytes'], 'city.jpg', { type: 'image/jpeg' });
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

        const result = await uploadImageToBlossom(file, {
            servers: ['https://first.example/', 'https://second.example/'],
            signEvent,
            fetch: fetchImpl,
            now: () => 100,
        });

        expect(result.url).toBe(`https://second.example/${'d'.repeat(64)}.jpg`);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('rejects unsupported image types before uploading', async () => {
        const file = new File(['<svg></svg>'], 'vector.svg', { type: 'image/svg+xml' });
        const signEvent = vi.fn();
        const fetchImpl = vi.fn();

        await expect(uploadImageToBlossom(file, {
            servers: ['https://blossom.example/'],
            signEvent,
            fetch: fetchImpl,
        })).rejects.toThrow('Unsupported image type');

        expect(signEvent).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('rejects non-https URLs returned by a Blossom server', async () => {
        const file = new File(['image-bytes'], 'city.jpg', { type: 'image/jpeg' });
        const signEvent = vi.fn(async (event) => ({
            ...event,
            id: 'auth-event',
            pubkey: 'a'.repeat(64),
            sig: 'b'.repeat(128),
        }));
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            url: `http://blossom.example/${'e'.repeat(64)}.jpg`,
            sha256: 'e'.repeat(64),
        }), { status: 200 }));

        await expect(uploadImageToBlossom(file, {
            servers: ['https://blossom.example/'],
            signEvent,
            fetch: fetchImpl,
            now: () => 100,
        })).rejects.toThrow('unsafe URL');
    });
});
