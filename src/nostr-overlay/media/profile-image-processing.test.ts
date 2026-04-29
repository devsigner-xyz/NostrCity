import { afterEach, describe, expect, test, vi } from 'vitest';
import { getProfileImageCropPolicy, processProfileImageFile } from './profile-image-processing';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function mockCanvasEncoding() {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback, type) {
        callback(new Blob(['encoded'], { type: type ?? 'image/jpeg' }));
    });
}

describe('profile-image-processing', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    test('uses 1:1 avatar and 3:1 banner crop policies', () => {
        expect(getProfileImageCropPolicy('avatar').aspectRatio).toBe(1);
        expect(getProfileImageCropPolicy('banner').aspectRatio).toBe(3);
    });

    test('re-encodes selected local images to a safe image format', async () => {
        const close = vi.fn();
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 300, close })));
        mockCanvasEncoding();

        const output = await processProfileImageFile(new File([PNG_BYTES], 'avatar.png', { type: 'image/png' }), {
            kind: 'avatar',
            outputType: 'image/jpeg',
        });

        expect(output.type).toBe('image/jpeg');
        expect(output.name).toBe('avatar.jpg');
        expect(close).toHaveBeenCalled();
    });

    test('rejects images exceeding max decoded dimensions', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 9000, height: 2000, close: vi.fn() })));
        mockCanvasEncoding();

        await expect(processProfileImageFile(new File([PNG_BYTES], 'banner.png', { type: 'image/png' }), {
            kind: 'banner',
        })).rejects.toThrow('too large');
    });

    test('does not crop arbitrary remote URLs', async () => {
        await expect(processProfileImageFile('https://example.com/avatar.jpg' as unknown as File, {
            kind: 'avatar',
        })).rejects.toThrow('local image file');
    });
});
