import type { ComponentProps } from 'react';
import { NotificationsPage } from '../components/NotificationsPage';

type NotificationsPageProps = ComponentProps<typeof NotificationsPage>;

export interface NotificationsRouteContainerProps {
    canAccessSocialNotifications: boolean;
    hasUnread: NotificationsPageProps['hasUnread'];
    pendingSnapshot: NotificationsPageProps['newNotifications'];
    items: NotificationsPageProps['recentNotifications'];
    hasMore: NotificationsPageProps['hasMoreNotifications'];
    isLoadingMore: NotificationsPageProps['isLoadingMoreNotifications'];
    profilesByPubkey: NotificationsPageProps['profilesByPubkey'];
    eventReferencesById: NotificationsPageProps['eventReferencesById'];
    onResolveProfiles: NotificationsPageProps['onResolveProfiles'];
    onResolveEventReferences: NotificationsPageProps['onResolveEventReferences'];
    onLoadMore: NotificationsPageProps['onLoadMoreNotifications'];
    onOpenThread: NotificationsPageProps['onOpenThread'];
    onOpenProfile: NotificationsPageProps['onOpenProfile'];
}

export function NotificationsRouteContainer({
    hasUnread,
    pendingSnapshot,
    items,
    hasMore,
    isLoadingMore,
    profilesByPubkey,
    eventReferencesById,
    onResolveProfiles,
    onResolveEventReferences,
    onLoadMore,
    onOpenThread,
    onOpenProfile,
}: NotificationsRouteContainerProps) {
    return (
        <NotificationsPage
            hasUnread={hasUnread}
            newNotifications={pendingSnapshot}
            recentNotifications={items}
            hasMoreNotifications={Boolean(hasMore)}
            isLoadingMoreNotifications={Boolean(isLoadingMore)}
            profilesByPubkey={profilesByPubkey}
            eventReferencesById={eventReferencesById}
            {...(onResolveProfiles ? { onResolveProfiles } : {})}
            {...(onResolveEventReferences ? { onResolveEventReferences } : {})}
            {...(onLoadMore ? { onLoadMoreNotifications: onLoadMore } : {})}
            {...(onOpenThread ? { onOpenThread } : {})}
            {...(onOpenProfile ? { onOpenProfile } : {})}
        />
    );
}
