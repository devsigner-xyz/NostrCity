import { useEffect, useRef, useState } from 'react';
import type { ChatConversationSummary, ChatDetailMessage } from './ChatsPage';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/textarea';

interface ChatConversationDetailProps {
    conversation?: ChatConversationSummary;
    messages: ChatDetailMessage[];
    onSendMessage: (plaintext: string) => Promise<void> | void;
    composerAutoFocusKey?: string;
    canSend?: boolean;
    disabledReason?: string;
    showHeader?: boolean;
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

export function ChatConversationDetail({
    conversation,
    messages,
    onSendMessage,
    composerAutoFocusKey,
    canSend = true,
    disabledReason,
    showHeader = true,
}: ChatConversationDetailProps) {
    const { t, locale } = useI18n();
    const [draft, setDraft] = useState('');
    const composerRef = useRef<HTMLTextAreaElement | null>(null);

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
                        <p className="nostr-chat-message-body">
                            {message.isUndecryptable ? t('chats.detail.body.undecryptable') : message.plaintext}
                        </p>
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
                    if (!canSend) {
                        return;
                    }

                    const plaintext = draft.trim();
                    if (!plaintext) {
                        return;
                    }

                    void onSendMessage(plaintext);
                    setDraft('');
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
                <Button type="submit" className="nostr-chat-send" disabled={!canSend || draft.trim().length === 0}>
                    {t('chats.detail.send')}
                </Button>
            </form>
            {!canSend ? <p className="nostr-chat-disabled-note">{disabledReason || t('chats.detail.disabled')}</p> : null}
        </div>
    );
}
