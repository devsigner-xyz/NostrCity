import { useRef, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { IMAGE_FILE_ACCEPT, type ImageFileRejectionReason, validateImageFile } from '../../media/image-file-policy';

type ImageFileInputProps = Omit<ComponentProps<'input'>, 'accept' | 'disabled' | 'onChange' | 'ref' | 'type'> & {
    [key: `data-${string}`]: string | number | boolean | undefined;
};

interface ImageFilePickerButtonProps {
    ariaLabel: string;
    describedBy?: string;
    disabled?: boolean;
    inputRef?: RefObject<HTMLInputElement | null>;
    inputProps?: ImageFileInputProps;
    children: ReactNode;
    onSelect: (file: File) => void;
    onReject?: (reason: ImageFileRejectionReason) => void;
}

export function ImageFilePickerButton({
    ariaLabel,
    describedBy,
    disabled = false,
    inputRef,
    inputProps,
    children,
    onSelect,
    onReject,
}: ImageFilePickerButtonProps) {
    const internalInputRef = useRef<HTMLInputElement | null>(null);
    const activeInputRef = inputRef ?? internalInputRef;

    return (
        <>
            <input
                ref={activeInputRef}
                {...inputProps}
                type="file"
                accept={IMAGE_FILE_ACCEPT}
                className="hidden"
                tabIndex={-1}
                disabled={disabled}
                onChange={(event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    input.value = '';

                    void validateImageFile(file).then((result) => {
                        if (result.ok && file) {
                            onSelect(file);
                            return;
                        }

                        if (result.reason) {
                            onReject?.(result.reason);
                        }
                    });
                }}
            />
            <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={ariaLabel}
                aria-describedby={describedBy}
                disabled={disabled}
                onClick={() => activeInputRef.current?.click()}
            >
                {children}
            </Button>
        </>
    );
}
