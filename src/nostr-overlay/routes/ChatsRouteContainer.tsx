import type { ComponentProps } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { ChatsPage } from '../components/ChatsPage';

type ChatsPageProps = ComponentProps<typeof ChatsPage>;

export interface ChatsRouteContainerProps {
    hasUnreadGlobal: ChatsPageProps['hasUnreadGlobal'];
    isLoadingConversations: NonNullable<ChatsPageProps['isLoadingConversations']>;
    conversations: ChatsPageProps['conversations'];
    messages: ChatsPageProps['messages'];
    activeConversationId: ChatsPageProps['activeConversationId'];
    composerAutoFocusKey?: ChatsPageProps['composerAutoFocusKey'];
    canSendChatMessages: boolean;
    ownerPubkey?: string;
    canDirectMessages: boolean;
    onOpenConversation: ChatsPageProps['onOpenConversation'];
    sendMessage: (conversationId: string, plaintext: string) => Promise<void> | void;
    onUploadImage?: ChatsPageProps['onUploadImage'];
    profilesByPubkey?: ChatsPageProps['profilesByPubkey'];
    eventReferencesById?: ChatsPageProps['eventReferencesById'];
    onSelectProfile?: ChatsPageProps['onSelectProfile'];
    onResolveProfiles?: ChatsPageProps['onResolveProfiles'];
    onSelectEventReference?: ChatsPageProps['onSelectEventReference'];
    onResolveEventReferences?: ChatsPageProps['onResolveEventReferences'];
}

export function ChatsRouteContainer({
    hasUnreadGlobal,
    isLoadingConversations,
    conversations,
    messages,
    activeConversationId,
    composerAutoFocusKey,
    canSendChatMessages,
    ownerPubkey,
    canDirectMessages,
    onOpenConversation,
    sendMessage,
    onUploadImage,
    profilesByPubkey,
    eventReferencesById,
    onSelectProfile,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
}: ChatsRouteContainerProps) {
    const { t } = useI18n();
    const disabledReason = !ownerPubkey
        ? t('chats.disabled.loginRequired')
        : !canDirectMessages
            ? t('chats.disabled.nip44Required')
            : undefined;

    return (
        <ChatsPage
            hasUnreadGlobal={hasUnreadGlobal}
            isLoadingConversations={isLoadingConversations}
            conversations={conversations}
            messages={messages}
            activeConversationId={activeConversationId}
            {...(composerAutoFocusKey ? { composerAutoFocusKey } : {})}
            canSend={canSendChatMessages}
            {...(disabledReason ? { disabledReason } : {})}
            {...(onUploadImage ? { onUploadImage } : {})}
            {...(profilesByPubkey !== undefined ? { profilesByPubkey } : {})}
            {...(eventReferencesById !== undefined ? { eventReferencesById } : {})}
            {...(onSelectProfile ? { onSelectProfile } : {})}
            {...(onResolveProfiles ? { onResolveProfiles } : {})}
            {...(onSelectEventReference ? { onSelectEventReference } : {})}
            {...(onResolveEventReferences ? { onResolveEventReferences } : {})}
            onOpenConversation={onOpenConversation}
            onSendMessage={async (plaintext) => {
                if (!activeConversationId || !canSendChatMessages) {
                    return;
                }

                await sendMessage(activeConversationId, plaintext);
            }}
        />
    );
}
