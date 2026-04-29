import type { ComponentProps } from 'react';
import { NotificationsPage } from '../components/NotificationsPage';

type NotificationsPageProps = ComponentProps<typeof NotificationsPage>;

export interface NotificationsRouteContainerProps {
    canAccessSocialNotifications: boolean;
    hasUnread: NotificationsPageProps['hasUnread'];
    pendingSnapshot: NotificationsPageProps['newNotifications'];
    items: NotificationsPageProps['recentNotifications'];
    profilesByPubkey: NotificationsPageProps['profilesByPubkey'];
    eventReferencesById: NotificationsPageProps['eventReferencesById'];
    onResolveProfiles: NotificationsPageProps['onResolveProfiles'];
    onResolveEventReferences: NotificationsPageProps['onResolveEventReferences'];
    onOpenThread: NotificationsPageProps['onOpenThread'];
    onOpenProfile: NotificationsPageProps['onOpenProfile'];
}

export function NotificationsRouteContainer({
    hasUnread,
    pendingSnapshot,
    items,
    profilesByPubkey,
    eventReferencesById,
    onResolveProfiles,
    onResolveEventReferences,
    onOpenThread,
    onOpenProfile,
}: NotificationsRouteContainerProps) {
    return (
        <NotificationsPage
            hasUnread={hasUnread}
            newNotifications={pendingSnapshot}
            recentNotifications={items}
            profilesByPubkey={profilesByPubkey}
            eventReferencesById={eventReferencesById}
            {...(onResolveProfiles ? { onResolveProfiles } : {})}
            {...(onResolveEventReferences ? { onResolveEventReferences } : {})}
            {...(onOpenThread ? { onOpenThread } : {})}
            {...(onOpenProfile ? { onOpenProfile } : {})}
        />
    );
}
