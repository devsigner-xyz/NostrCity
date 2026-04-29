export const IMAGE_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';
export const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export type ImageFileRejectionReason = 'missing-file' | 'unsupported-type' | 'too-large' | 'invalid-signature';

export interface ImageFileValidationResult {
    ok: boolean;
    reason?: ImageFileRejectionReason;
}

interface ValidateImageFileOptions {
    maxBytes?: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export async function validateImageFile(file: File | undefined, options: ValidateImageFileOptions = {}): Promise<ImageFileValidationResult> {
    if (!file) {
        return { ok: false, reason: 'missing-file' };
    }

    if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) {
        return { ok: false, reason: 'unsupported-type' };
    }

    if (file.size > (options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES)) {
        return { ok: false, reason: 'too-large' };
    }

    const signature = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    if (!hasImageSignature(signature, file.type)) {
        return { ok: false, reason: 'invalid-signature' };
    }

    return { ok: true };
}

function hasImageSignature(bytes: Uint8Array, type: string): boolean {
    if (type === 'image/jpeg') {
        return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }

    if (type === 'image/png') {
        return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
    }

    if (type === 'image/webp') {
        return bytes.length >= 12 && asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 12) === 'WEBP';
    }

    if (type === 'image/avif') {
        return bytes.length >= 12 && asciiAt(bytes, 4, 8) === 'ftyp' && hasAvifBrand(bytes);
    }

    return false;
}

function hasAvifBrand(bytes: Uint8Array): boolean {
    for (let index = 8; index + 4 <= bytes.length; index += 4) {
        const brand = asciiAt(bytes, index, index + 4);
        if (brand === 'avif' || brand === 'avis') {
            return true;
        }
    }

    return false;
}

function asciiAt(bytes: Uint8Array, start: number, end: number): string {
    return String.fromCharCode(...bytes.slice(start, end));
}
