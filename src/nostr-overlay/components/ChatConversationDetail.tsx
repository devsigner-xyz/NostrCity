import { useEffect, useRef, useState } from 'react';
import type { ChatConversationSummary, ChatDetailMessage } from './ChatsPage';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/textarea';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import { useSelectedImageFile } from '../hooks/useSelectedImageFile';
import type { ImageFileRejectionReason } from '../media/image-file-policy';
import type { UploadedImageAttachment } from '../media/upload-note-image-attachment';
import {
    ComposerImageAttachmentButton,
    ComposerImageAttachmentPreview,
    imageFileRejectionMessageKey,
} from './ComposerImageAttachment';
import { RichNostrContent } from './RichNostrContent';

interface ChatConversationDetailProps {
    conversation?: ChatConversationSummary;
    messages: ChatDetailMessage[];
    onSendMessage: (plaintext: string) => Promise<void> | void;
    onUploadImage?: (file: File) => Promise<UploadedImageAttachment | undefined> | UploadedImageAttachment | undefined;
    composerAutoFocusKey?: string;
    canSend?: boolean;
    disabledReason?: string;
    showHeader?: boolean;
    profilesByPubkey?: Record<string, NostrProfile>;
    eventReferencesById?: Record<string, NostrEvent>;
    onSelectProfile?: (pubkey: string) => void;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onSelectEventReference?: (eventId: string) => void;
    onResolveEventReferences?: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
}

function deliveryStatusLabel(state: 'pending' | 'sent' | 'failed', t: ReturnType<typeof useI18n>['t']): string {
    if (state === 'pending') {
        return t('chats.detail.delivery.pending');
    }

    if (state === 'failed') {
        return t('chats.detail.delivery.failed');
    }

    return t('chats.detail.delivery.sent');
}

function formatMessageTimestamp(createdAt: number, locale: 'es' | 'en'): string {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(createdAt * 1000));
}

function appendImageUrl(content: string, url: string | undefined): string {
    if (!url) {
        return content;
    }

    return content.trim().length > 0 ? `${content.trim()}\n${url}` : url;
}

export function ChatConversationDetail({
    conversation,
    messages,
    onSendMessage,
    onUploadImage,
    composerAutoFocusKey,
    canSend = true,
    disabledReason,
    showHeader = true,
    profilesByPubkey,
    eventReferencesById,
    onSelectProfile,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
}: ChatConversationDetailProps) {
    const { t, locale } = useI18n();
    const [draft, setDraft] = useState('');
    const { selectedImage: image, setSelectedImageFile, clearSelectedImage } = useSelectedImageFile();
    const [imageStatus, setImageStatus] = useState('');
    const [imageError, setImageError] = useState('');
    const composerRef = useRef<HTMLTextAreaElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!conversation || !composerRef.current) {
            return;
        }

        composerRef.current.focus();
    }, [conversation?.id, composerAutoFocusKey]);

    if (!conversation) {
        return (
            <div className="nostr-chat-empty-state">
                <Empty className="nostr-chat-empty">
                    <EmptyHeader>
                        <EmptyTitle>{t('chats.detail.emptyTitle')}</EmptyTitle>
                        <EmptyDescription>{t('chats.detail.emptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </div>
        );
    }

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

    const sendDraft = async (): Promise<void> => {
        if (!canSend) {
            return;
        }

        const plaintext = draft.trim();
        if (!plaintext && !image) {
            return;
        }

        const uploadedImage = image && onUploadImage ? await onUploadImage(image.file) : undefined;
        if (image && !uploadedImage) {
            return;
        }

        void onSendMessage(appendImageUrl(plaintext, uploadedImage?.url));
        setDraft('');
        clearSelectedImage();
        setImageStatus('');
        setImageError('');
    };
    const richContentProps = {
        ...(profilesByPubkey !== undefined ? { profilesByPubkey } : {}),
        ...(eventReferencesById !== undefined ? { eventReferencesById } : {}),
        ...(onSelectProfile ? { onSelectProfile } : {}),
        ...(onResolveProfiles ? { onResolveProfiles } : {}),
        ...(onSelectEventReference ? { onSelectEventReference } : {}),
        ...(onResolveEventReferences ? { onResolveEventReferences } : {}),
    };

    return (
        <div className="nostr-chat-detail">
            {showHeader ? (
                <div className="nostr-chat-detail-header">
                    <p className="nostr-chat-detail-title">{conversation.title}</p>
                </div>
            ) : null}

            <ul className="nostr-chat-messages">
                {messages.length === 0 ? (
                    <li>
                        <Empty className="nostr-chat-empty">
                            <EmptyHeader>
                                <EmptyTitle>{t('chats.detail.messagesEmptyTitle')}</EmptyTitle>
                                <EmptyDescription>{t('chats.detail.messagesEmptyDescription')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </li>
                ) : null}
                {messages.map((message) => (
                    <li key={message.id} className={`nostr-chat-message ${message.direction === 'outgoing' ? 'is-outgoing' : 'is-incoming'}`}>
                        <div className="nostr-chat-message-header">
                            <strong className="nostr-chat-message-author">
                                {message.direction === 'outgoing' ? t('chats.detail.author.me') : conversation.title}
                            </strong>
                            <span className="nostr-chat-message-timestamp">{formatMessageTimestamp(message.createdAt, locale)}</span>
                        </div>
                        {message.isUndecryptable ? (
                            <p className="nostr-chat-message-body">{t('chats.detail.body.undecryptable')}</p>
                        ) : (
                            <RichNostrContent
                                content={message.plaintext}
                                {...richContentProps}
                                textClassName="nostr-chat-message-body whitespace-pre-wrap break-words"
                            />
                        )}
                        {message.direction === 'outgoing' ? (
                            <p className={`nostr-chat-message-status is-${message.deliveryState}`}>
                                {deliveryStatusLabel(message.deliveryState, t)}
                            </p>
                        ) : null}
                    </li>
                ))}
            </ul>

            <form
                className="nostr-chat-composer"
                onSubmit={(event) => {
                    event.preventDefault();
                    void sendDraft();
                }}
            >
                <Textarea
                    ref={composerRef}
                    className="nostr-chat-composer-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t('chats.detail.placeholder')}
                    readOnly={!canSend}
                />
                {onUploadImage ? (
                    <>
                        <ComposerImageAttachmentPreview
                            value={image}
                            onChange={(value) => {
                                if (!value) {
                                    removeImage();
                                }
                            }}
                            onEdit={() => imageInputRef.current?.click()}
                            compact
                            disabled={!canSend}
                        />
                        <div className="sr-only" role="status" aria-live="polite">
                            {imageStatus}
                        </div>
                        {imageError ? (
                            <p className="text-xs text-destructive" role="alert">
                                {imageError}
                            </p>
                        ) : null}
                    </>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                    {onUploadImage ? (
                        <ComposerImageAttachmentButton
                            inputRef={imageInputRef}
                            disabled={!canSend}
                            onSelect={selectImage}
                            onReject={rejectImage}
                        />
                    ) : <span />}
                    <Button type="submit" className="nostr-chat-send" disabled={!canSend || (draft.trim().length === 0 && !image)}>
                        {t('chats.detail.send')}
                    </Button>
                </div>
            </form>
            {!canSend ? <p className="nostr-chat-disabled-note">{disabledReason || t('chats.detail.disabled')}</p> : null}
        </div>
    );
}
