import type { BlossomUploadedBlob } from './blossom-upload';

export function buildNip94ImageTags(blob: BlossomUploadedBlob): string[][] {
    return [[
        'imeta',
        `url ${blob.url}`,
        `m ${blob.type}`,
        `x ${blob.sha256}`,
        `size ${blob.size}`,
    ]];
}
