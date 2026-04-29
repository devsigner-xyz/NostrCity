import { validateImageFile } from './image-file-policy';

export type ProfileImageKind = 'avatar' | 'banner';
export type ProfileImageOutputType = 'image/jpeg' | 'image/webp';

export interface ProfileImageCropPolicy {
    aspectRatio: number;
}

export interface ProcessProfileImageOptions {
    kind: ProfileImageKind;
    outputType?: ProfileImageOutputType;
    quality?: number;
    maxDimension?: number;
    maxPixels?: number;
}

interface CropRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const PROFILE_IMAGE_CROP_POLICIES: Record<ProfileImageKind, ProfileImageCropPolicy> = {
    avatar: { aspectRatio: 1 },
    banner: { aspectRatio: 3 },
};

const DEFAULT_MAX_DECODED_DIMENSION = 8192;
const DEFAULT_MAX_DECODED_PIXELS = 16_000_000;

export function getProfileImageCropPolicy(kind: ProfileImageKind): ProfileImageCropPolicy {
    return PROFILE_IMAGE_CROP_POLICIES[kind];
}

export async function processProfileImageFile(input: File, options: ProcessProfileImageOptions): Promise<File> {
    if (!(input instanceof File)) {
        throw new Error('Profile image processing requires a local image file');
    }

    const validation = await validateImageFile(input);
    if (!validation.ok) {
        throw new Error('Profile image file is invalid');
    }

    const bitmap = await createImageBitmap(input);
    try {
        assertDecodedDimensions(bitmap.width, bitmap.height, options);
        const outputType = options.outputType ?? 'image/jpeg';
        const crop = getCenteredCropRect(bitmap.width, bitmap.height, getProfileImageCropPolicy(options.kind).aspectRatio);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(crop.width));
        canvas.height = Math.max(1, Math.round(crop.height));
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Canvas image processing is unavailable');
        }

        context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
        const blob = await encodeCanvas(canvas, outputType, options.quality ?? 0.9);

        return new File([blob], buildOutputFileName(input.name, outputType), { type: outputType });
    } finally {
        bitmap.close?.();
    }
}

function assertDecodedDimensions(width: number, height: number, options: ProcessProfileImageOptions): void {
    const maxDimension = options.maxDimension ?? DEFAULT_MAX_DECODED_DIMENSION;
    const maxPixels = options.maxPixels ?? DEFAULT_MAX_DECODED_PIXELS;
    if (width > maxDimension || height > maxDimension || width * height > maxPixels) {
        throw new Error('Profile image decoded dimensions are too large');
    }
}

function getCenteredCropRect(width: number, height: number, aspectRatio: number): CropRect {
    const currentRatio = width / height;
    if (currentRatio > aspectRatio) {
        const cropWidth = height * aspectRatio;
        return {
            x: (width - cropWidth) / 2,
            y: 0,
            width: cropWidth,
            height,
        };
    }

    const cropHeight = width / aspectRatio;
    return {
        x: 0,
        y: (height - cropHeight) / 2,
        width,
        height: cropHeight,
    };
}

function encodeCanvas(canvas: HTMLCanvasElement, type: ProfileImageOutputType, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Profile image could not be encoded'));
                return;
            }

            resolve(blob);
        }, type, quality);
    });
}

function buildOutputFileName(fileName: string, outputType: ProfileImageOutputType): string {
    const baseName = fileName.replace(/\.[^.]+$/, '') || 'profile-image';
    return `${baseName}.${outputType === 'image/webp' ? 'webp' : 'jpg'}`;
}
