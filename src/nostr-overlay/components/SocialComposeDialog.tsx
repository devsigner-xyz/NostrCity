import { useEffect, useRef, useState } from 'react';
import type { SearchUsersResult } from '../query/user-search.query';
import { createMentionDraft, type MentionDraft } from '../mention-serialization';
import { MentionTextarea } from './MentionTextarea';
import {
    ComposerImageAttachmentButton,
    ComposerImageAttachmentPreview,
    imageFileRejectionMessageKey,
} from './ComposerImageAttachment';
import type { NoteCardModel } from './note-card-model';
import { withoutNoteActions } from './note-card-model';
import { NoteCard } from './NoteCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/i18n/useI18n';
import type { NostrProfile } from '../../nostr/types';
import { useSelectedImageFile } from '../hooks/useSelectedImageFile';
import type { ImageFileRejectionReason } from '../media/image-file-policy';

export interface SocialComposeSubmitInput {
    content: MentionDraft;
    image?: {
        file: File;
    };
}

interface SocialComposeDialogProps {
    open: boolean;
    mode: 'post' | 'quote';
    quoteTarget?: NoteCardModel;
    profilesByPubkey: Record<string, NostrProfile>;
    isSubmitting?: boolean;
    onSearchUsers: (query: string) => Promise<SearchUsersResult>;
    searchRelaySetKey?: string | undefined;
    ownerPubkey?: string | undefined;
    onOpenChange: (open: boolean) => void;
    onSubmit: (input: SocialComposeSubmitInput) => Promise<void> | void;
}

export function SocialComposeDialog({
    open,
    mode,
    quoteTarget,
    profilesByPubkey,
    isSubmitting = false,
    onSearchUsers,
    searchRelaySetKey,
    ownerPubkey,
    onOpenChange,
    onSubmit,
}: SocialComposeDialogProps) {
    const { t } = useI18n();
    const [draft, setDraft] = useState<MentionDraft>(createMentionDraft(''));
    const { selectedImage: image, setSelectedImageFile, clearSelectedImage } = useSelectedImageFile();
    const [imageStatus, setImageStatus] = useState('');
    const [imageError, setImageError] = useState('');
    const imageInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (open) {
            setDraft(createMentionDraft(''));
            clearSelectedImage();
            setImageStatus('');
            setImageError('');
        }
    }, [clearSelectedImage, open, mode, quoteTarget?.id]);

    const selectImage = (file: File): void => {
        setSelectedImageFile(file);
        setImageError('');
        setImageStatus(t('feed.imageSelected'));
    };

    const removeImage = (): void => {
        clearSelectedImage();
        setImageError('');
        setImageStatus(t('feed.imageRemoved'));
    };

    const rejectImage = (reason: ImageFileRejectionReason): void => {
        setImageStatus('');
        setImageError(t(imageFileRejectionMessageKey(reason)));
    };

    const canSubmit = draft.text.trim().length > 0 || Boolean(image);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined} className="nostr-social-compose-dialog flex max-h-[min(720px,calc(100vh-2rem))] max-w-xl flex-col gap-0 overflow-hidden p-0">
                <DialogTitle className="sr-only">{mode === 'quote' ? t('socialCompose.quoteTitle') : t('socialCompose.postTitle')}</DialogTitle>

                <div className="nostr-social-compose-scroll-body grid max-h-[min(560px,calc(100vh-8rem))] min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-4 pt-10 sm:px-6">
                    <MentionTextarea
                        aria-label={t('socialCompose.textareaAria')}
                        className="min-h-40 resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
                        placeholder={mode === 'quote' ? t('socialCompose.quotePlaceholder') : t('socialCompose.postPlaceholder')}
                        value={draft}
                        onSearch={onSearchUsers}
                        ownerPubkey={ownerPubkey}
                        searchRelaySetKey={searchRelaySetKey}
                        onChangeDraft={setDraft}
                    />

                    <ComposerImageAttachmentPreview
                        value={image}
                        onChange={(value) => {
                            if (!value) {
                                removeImage();
                            }
                        }}
                        onEdit={() => imageInputRef.current?.click()}
                        disabled={isSubmitting}
                    />
                    <div className="sr-only" role="status" aria-live="polite">
                        {imageStatus}
                    </div>
                    {imageError ? (
                        <p className="text-xs text-destructive" role="alert">
                            {imageError}
                        </p>
                    ) : null}

                    {mode === 'quote' && quoteTarget ? (
                        <NoteCard
                            note={withoutNoteActions(quoteTarget)}
                            profilesByPubkey={profilesByPubkey}
                        />
                    ) : null}
                </div>

                <DialogFooter className="nostr-social-compose-footer mx-0 mb-0 flex-row justify-between rounded-none border-t bg-background px-4 py-3 sm:px-6">
                    <ComposerImageAttachmentButton
                        inputRef={imageInputRef}
                        disabled={isSubmitting}
                        onSelect={selectImage}
                        onReject={rejectImage}
                    />
                    <Button
                        type="button"
                        size="sm"
                        disabled={isSubmitting || !canSubmit}
                        onClick={() => {
                            void onSubmit({
                                content: draft,
                                ...(image ? { image: { file: image.file } } : {}),
                            });
                        }}
                    >
                        {isSubmitting ? t('socialCompose.publishing') : t('socialCompose.postTitle')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
