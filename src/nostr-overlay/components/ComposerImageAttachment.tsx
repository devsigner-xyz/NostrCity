import type { RefObject } from 'react';
import { ImageIcon, PencilIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/useI18n';
import { ImageFilePickerButton } from './media/ImageFilePickerButton';
import type { ImageFileRejectionReason } from '../media/image-file-policy';
import type { AppMessageKey } from '@/i18n/catalog';

export interface ComposerImageAttachmentValue {
    file: File;
    previewUrl: string;
}

interface ComposerImageAttachmentButtonProps {
    inputRef: RefObject<HTMLInputElement | null>;
    disabled?: boolean;
    onSelect: (file: File) => void;
    onReject?: (reason: ImageFileRejectionReason) => void;
}

interface ComposerImageAttachmentPreviewProps {
    value: ComposerImageAttachmentValue | null;
    onChange: (value: ComposerImageAttachmentValue | null) => void;
    onEdit: () => void;
    compact?: boolean;
    disabled?: boolean;
}

export function imageFileRejectionMessageKey(reason: ImageFileRejectionReason): AppMessageKey {
    if (reason === 'too-large') {
        return 'feed.imageRejectedTooLarge';
    }

    if (reason === 'invalid-signature') {
        return 'feed.imageRejectedInvalidSignature';
    }

    if (reason === 'missing-file') {
        return 'feed.imageRejectedMissingFile';
    }

    return 'feed.imageRejectedUnsupportedType';
}

export function ComposerImageAttachmentButton({ inputRef, disabled = false, onSelect, onReject }: ComposerImageAttachmentButtonProps) {
    const { t } = useI18n();

    return (
        <>
            <ImageFilePickerButton
                ariaLabel={t('feed.attachImage')}
                disabled={disabled}
                inputRef={inputRef}
                {...(onReject ? { onReject } : {})}
                onSelect={onSelect}
            >
                <ImageIcon aria-hidden="true" />
            </ImageFilePickerButton>
        </>
    );
}

export function ComposerImageAttachmentPreview({ value, onChange, onEdit, compact = false, disabled = false }: ComposerImageAttachmentPreviewProps) {
    const { t } = useI18n();

    if (!value) {
        return null;
    }

    return (
        <div className={compact ? 'mt-3 overflow-hidden rounded-xl border bg-muted/30' : 'mt-4 overflow-hidden rounded-2xl border bg-muted/30'}>
            <div className="relative">
                <img
                    src={value.previewUrl}
                    alt={t('feed.selectedImagePreview')}
                    className={compact ? 'max-h-56 w-full object-cover' : 'max-h-[360px] w-full object-contain'}
                />
                <div className="absolute left-2 top-2 flex items-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        aria-label={t('feed.editImage')}
                        disabled={disabled}
                        onClick={onEdit}
                    >
                        <PencilIcon aria-hidden="true" />
                        {t('feed.editImage')}
                    </Button>
                </div>
                <Button
                    type="button"
                    variant="secondary"
                    size="icon-xs"
                    className="absolute right-2 top-2 rounded-full"
                    aria-label={t('feed.removeImage')}
                    disabled={disabled}
                    onClick={() => onChange(null)}
                >
                    <XIcon aria-hidden="true" />
                </Button>
            </div>
            <div className="truncate px-3 py-2 text-xs text-muted-foreground">
                {value.file.name}
            </div>
        </div>
    );
}
