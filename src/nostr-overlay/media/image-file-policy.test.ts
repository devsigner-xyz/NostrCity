import { describe, expect, test } from 'vitest';
import {
    DEFAULT_MAX_IMAGE_BYTES,
    IMAGE_FILE_ACCEPT,
    SUPPORTED_IMAGE_MIME_TYPES,
    validateImageFile,
} from './image-file-policy';

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const AVIF_BYTES = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);

function imageFile(bytes: Uint8Array, name: string, type: string) {
    const copy: Uint8Array<ArrayBuffer> = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new File([copy.buffer], name, { type });
}

describe('image-file-policy', () => {
    test('exports the accepted image MIME policy', () => {
        expect(IMAGE_FILE_ACCEPT).toBe('image/jpeg,image/png,image/webp,image/avif');
        expect(DEFAULT_MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
        expect(SUPPORTED_IMAGE_MIME_TYPES).toEqual(new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']));
    });

    test.each([
        ['JPEG', imageFile(JPEG_BYTES, 'city.jpg', 'image/jpeg')],
        ['PNG', imageFile(PNG_BYTES, 'city.png', 'image/png')],
        ['WebP', imageFile(WEBP_BYTES, 'city.webp', 'image/webp')],
        ['AVIF', imageFile(AVIF_BYTES, 'city.avif', 'image/avif')],
    ])('accepts %s images by MIME type and magic bytes', async (_label, file) => {
        await expect(validateImageFile(file)).resolves.toEqual({ ok: true });
    });

    test.each([
        ['SVG', imageFile(new TextEncoder().encode('<svg></svg>'), 'vector.svg', 'image/svg+xml'), 'unsupported-type'],
        ['unknown type', imageFile(PNG_BYTES, 'city.bin', 'application/octet-stream'), 'unsupported-type'],
        ['empty spoofed type', imageFile(PNG_BYTES, 'city.png', ''), 'unsupported-type'],
        ['invalid signature', imageFile(new TextEncoder().encode('not a png'), 'city.png', 'image/png'), 'invalid-signature'],
    ])('rejects %s images', async (_label, file, reason) => {
        await expect(validateImageFile(file)).resolves.toEqual({ ok: false, reason });
    });

    test('rejects missing files and files over the max size', async () => {
        await expect(validateImageFile(undefined)).resolves.toEqual({ ok: false, reason: 'missing-file' });
        await expect(validateImageFile(imageFile(PNG_BYTES, 'city.png', 'image/png'), { maxBytes: PNG_BYTES.length - 1 }))
            .resolves.toEqual({ ok: false, reason: 'too-large' });
    });
});
