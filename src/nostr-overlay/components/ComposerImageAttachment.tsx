import { useEffect, type RefObject } from 'react';
import { ImageIcon, PencilIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/useI18n';
import { MAX_BLOSSOM_IMAGE_BYTES } from '../media/blossom-image-upload';

const COMPOSER_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';
const COMPOSER_IMAGE_TYPES = new Set(COMPOSER_IMAGE_ACCEPT.split(','));

export interface ComposerImageAttachmentValue {
    file: File;
    previewUrl: string;
}

interface ComposerImageAttachmentButtonProps {
    value: ComposerImageAttachmentValue | null;
    onChange: (value: ComposerImageAttachmentValue | null) => void;
    inputRef: RefObject<HTMLInputElement | null>;
    disabled?: boolean;
}

interface ComposerImageAttachmentPreviewProps {
    value: ComposerImageAttachmentValue | null;
    onChange: (value: ComposerImageAttachmentValue | null) => void;
    onEdit: () => void;
    compact?: boolean;
    disabled?: boolean;
}

export function ComposerImageAttachmentButton({ value, onChange, inputRef, disabled = false }: ComposerImageAttachmentButtonProps) {
    const { t } = useI18n();

    useEffect(() => {
        return () => {
            if (value?.previewUrl) {
                URL.revokeObjectURL(value.previewUrl);
            }
        };
    }, [value]);

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept={COMPOSER_IMAGE_ACCEPT}
                className="hidden"
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (!file || !COMPOSER_IMAGE_TYPES.has(file.type) || file.size > MAX_BLOSSOM_IMAGE_BYTES) {
                        return;
                    }

                    onChange({
                        file,
                        previewUrl: URL.createObjectURL(file),
                    });
                }}
            />
            <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('feed.attachImage')}
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
            >
                <ImageIcon aria-hidden="true" />
            </Button>
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
