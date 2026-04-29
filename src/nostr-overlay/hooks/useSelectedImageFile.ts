import { useCallback, useEffect, useRef, useState } from 'react';

export interface SelectedImageFile {
    file: File;
    previewUrl: string;
}

export function useSelectedImageFile(): {
    selectedImage: SelectedImageFile | null;
    setSelectedImageFile: (file: File) => void;
    clearSelectedImage: () => void;
} {
    const [selectedImage, setSelectedImage] = useState<SelectedImageFile | null>(null);
    const previewUrlRef = useRef<string | null>(null);

    const revokeCurrentPreview = useCallback(() => {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
        }
    }, []);

    const setSelectedImageFile = useCallback((file: File) => {
        revokeCurrentPreview();
        const previewUrl = URL.createObjectURL(file);
        previewUrlRef.current = previewUrl;
        setSelectedImage({ file, previewUrl });
    }, [revokeCurrentPreview]);

    const clearSelectedImage = useCallback(() => {
        revokeCurrentPreview();
        setSelectedImage(null);
    }, [revokeCurrentPreview]);

    useEffect(() => revokeCurrentPreview, [revokeCurrentPreview]);

    return { selectedImage, setSelectedImageFile, clearSelectedImage };
}
