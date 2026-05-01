import { ChatConversationList } from './ChatConversationList';
import { ChatConversationDetail } from './ChatConversationDetail';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { OverlayPageHeader } from './OverlayPageHeader';
import { OverlayUnreadIndicator } from './OverlayUnreadIndicator';
import { useI18n } from '@/i18n/useI18n';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { OverlaySurface } from './OverlaySurface';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export interface ChatConversationSummary {
    id: string;
    peerPubkey: string;
    title: string;
    profile?: NostrProfile;
    verification?: Nip05ValidationResult;
    lastMessagePreview: string;
    lastMessageAt: number;
    hasUnread: boolean;
}

export interface ChatDetailMessage {
    id: string;
    direction: 'incoming' | 'outgoing';
    plaintext: string;
    createdAt: number;
    deliveryState: 'pending' | 'sent' | 'failed';
    isUndecryptable?: boolean;
}

interface ChatsPageProps {
    hasUnreadGlobal: boolean;
    isLoadingConversations?: boolean;
    conversations: ChatConversationSummary[];
    messages: ChatDetailMessage[];
    activeConversationId: string | null;
    onOpenConversation: (conversationId: string) => void;
    onSendMessage: (plaintext: string) => Promise<void> | void;
    composerAutoFocusKey?: string;
    canSend?: boolean;
    disabledReason?: string;
}

export function ChatsPage({
    hasUnreadGlobal,
    isLoadingConversations = false,
    conversations,
    messages,
    activeConversationId,
    onOpenConversation,
    onSendMessage,
    composerAutoFocusKey,
    canSend = true,
    disabledReason,
}: ChatsPageProps) {
    const { t } = useI18n();
    const isMobile = useIsMobile();
    const showBootstrappingState = isLoadingConversations && conversations.length === 0;
    const activeConversation = activeConversationId
        ? conversations.find((conversation) => conversation.id === activeConversationId)
        : undefined;
    const showConversationList = !isMobile || !activeConversation;
    const showConversationDetail = !isMobile || Boolean(activeConversation);

    return (
        <OverlaySurface ariaLabel={t('chats.title')}>
            <div className="flex min-h-0 flex-1 flex-col">
                {showBootstrappingState ? (
                    <div className="nostr-chats-page nostr-routed-surface-panel nostr-page-layout nostr-chats-loading-page" data-chat-source="query">
                        <Empty className="nostr-chats-loading-empty">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Spinner />
                                </EmptyMedia>
                                <EmptyTitle>{t('chats.loadingTitle')}</EmptyTitle>
                                <EmptyDescription>{t('chats.loadingDescription')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </div>
                ) : (
                    <div className="nostr-chats-page nostr-routed-surface-panel nostr-page-layout h-full" data-chat-source="query">
                        <OverlayPageHeader
                            title={t('chats.title')}
                            indicator={hasUnreadGlobal ? <OverlayUnreadIndicator className="nostr-chat-unread-dot" srLabel={t('chats.unread')} /> : null}
                        />

                        <div className={cn(
                            'nostr-chat-layout',
                            isMobile && activeConversation ? 'nostr-chat-layout-mobile-detail' : undefined,
                            isMobile && !activeConversation ? 'nostr-chat-layout-mobile-list' : undefined,
                        )}>
                            {showConversationList ? (
                                <Card variant="default" size="sm" className="nostr-chat-list-panel h-full gap-0 overflow-hidden py-0 shadow-none">
                                    <CardContent className="flex h-full min-h-0 flex-1 flex-col px-3 py-3">
                                        <ChatConversationList
                                            conversations={conversations}
                                            loading={isLoadingConversations}
                                            activeConversationId={activeConversationId}
                                            onOpenConversation={onOpenConversation}
                                        />
                                    </CardContent>
                                </Card>
                            ) : null}

                            {showConversationDetail ? (
                                <Card variant="default" size="sm" className="nostr-chat-detail-panel h-full gap-0 overflow-hidden py-0 shadow-none">
                                    <CardContent className="flex h-full min-h-0 flex-1 flex-col px-3 py-3">
                                        <ChatConversationDetail
                                            {...(activeConversation ? { conversation: activeConversation } : {})}
                                            messages={messages}
                                            onSendMessage={onSendMessage}
                                            {...(composerAutoFocusKey ? { composerAutoFocusKey } : {})}
                                            canSend={canSend}
                                            {...(disabledReason ? { disabledReason } : {})}
                                            showHeader={!isMobile}
                                        />
                                    </CardContent>
                                </Card>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>
        </OverlaySurface>
    );
}
