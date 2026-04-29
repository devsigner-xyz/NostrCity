import { uploadImageBlobToBlossom, type UploadImageBlobToBlossomOptions } from './blossom-upload';
import { buildNip94ImageTags } from './nip94-image-tags';

export interface UploadedImageAttachment {
    url: string;
    tags: string[][];
}

export async function uploadNoteImageAttachment(file: File, options: UploadImageBlobToBlossomOptions): Promise<UploadedImageAttachment> {
    const blob = await uploadImageBlobToBlossom(file, options);

    return {
        url: blob.url,
        tags: buildNip94ImageTags(blob),
    };
}
