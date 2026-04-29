import { describe, expect, test, vi } from 'vitest';
import { uploadNoteImageAttachment } from './upload-note-image-attachment';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('uploadNoteImageAttachment', () => {
    test('uploads a note image and returns the note-only imeta attachment shape', async () => {
        const file = new File([PNG_BYTES], 'city.png', { type: 'image/png' });
        const signEvent = vi.fn(async (event) => ({
            ...event,
            id: 'auth-event',
            pubkey: 'a'.repeat(64),
            sig: 'b'.repeat(128),
        }));
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            url: `https://blossom.example/${'c'.repeat(64)}`,
            sha256: 'c'.repeat(64),
            size: file.size,
            type: 'image/png',
        }), { status: 200 }));

        const result = await uploadNoteImageAttachment(file, {
            servers: ['https://blossom.example/'],
            signEvent,
            fetch: fetchImpl,
            now: () => 100,
        });

        expect(result.url).toBe(`https://blossom.example/${'c'.repeat(64)}`);
        expect(result.tags).toEqual([[
            'imeta',
            `url https://blossom.example/${'c'.repeat(64)}`,
            'm image/png',
            expect.stringMatching(/^x [a-f0-9]{64}$/),
            `size ${file.size}`,
        ]]);
    });
});
