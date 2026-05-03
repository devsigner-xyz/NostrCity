import { useId } from 'react';
import { BellIcon, MapPinIcon, PenSquareIcon, RadioTowerIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';
import { OverlayUnreadIndicator } from '../components/OverlayUnreadIndicator';
import { shouldShowMobileBottomNavigation } from './mobile-navigation';

interface MobileBottomNavigationProps {
    activePath: string;
    activeSearch?: string;
    canWrite: boolean;
    canAccessFollowingFeed: boolean;
    canAccessSocialNotifications: boolean;
    followingFeedHasUnread: boolean;
    notificationsHasUnread: boolean;
    relaysConnectedCount: number;
    relaysTotal: number;
    onOpenMap: () => void;
    onOpenFollowingFeed: () => void;
    onOpenPublish: () => void;
    onOpenRelays: () => void;
    onOpenNotifications: () => void;
}

interface MobileBottomNavigationItem {
    key: string;
    label: string;
    ariaLabel: string;
    icon: LucideIcon;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    unread?: boolean;
    unreadLabel?: string;
    badge?: string;
    prominent?: boolean;
    title?: string;
    disabledReason?: string;
}

function MobileBottomNavigationButton({ item }: { item: MobileBottomNavigationItem }) {
    const descriptionId = useId();
    const Icon = item.icon;
    const disabledDescriptionId = item.disabled && item.disabledReason ? descriptionId : undefined;

    return (
        <button
            type="button"
            className={cn(
                'nostr-mobile-bottom-navigation-button',
                item.active && 'is-active',
                item.prominent && 'is-prominent',
            )}
            aria-label={item.ariaLabel}
            aria-current={item.active ? 'page' : undefined}
            {...(disabledDescriptionId ? { 'aria-describedby': disabledDescriptionId } : {})}
            disabled={item.disabled}
            title={item.title ?? item.label}
            onClick={item.onClick}
        >
            <span className="nostr-mobile-bottom-navigation-icon-wrap">
                <Icon aria-hidden="true" />
                {item.unread ? (
                    <OverlayUnreadIndicator
                        variant="overlay"
                        className="nostr-mobile-bottom-navigation-unread"
                        {...(item.unreadLabel ? { srLabel: item.unreadLabel } : {})}
                    />
                ) : null}
                {item.badge ? <span className="nostr-mobile-bottom-navigation-badge">{item.badge}</span> : null}
            </span>
            <span className="nostr-mobile-bottom-navigation-label">{item.label}</span>
            {disabledDescriptionId ? <span id={disabledDescriptionId} className="sr-only">{item.disabledReason}</span> : null}
        </button>
    );
}

export function MobileBottomNavigation({
    activePath,
    activeSearch = '',
    canWrite,
    canAccessFollowingFeed,
    canAccessSocialNotifications,
    followingFeedHasUnread,
    notificationsHasUnread,
    relaysConnectedCount,
    relaysTotal,
    onOpenMap,
    onOpenFollowingFeed,
    onOpenPublish,
    onOpenRelays,
    onOpenNotifications,
}: MobileBottomNavigationProps) {
    const { t } = useI18n();
    const { isMobile } = useSidebar();

    if (!isMobile || !shouldShowMobileBottomNavigation(activePath, activeSearch)) {
        return null;
    }

    const signingRequiredLabel = t('auth.readOnlySignInRequired');
    const items: MobileBottomNavigationItem[] = [
        {
            key: 'map',
            label: t('sidebar.map'),
            ariaLabel: t('sidebar.openMap'),
            icon: MapPinIcon,
            active: activePath === '/',
            onClick: onOpenMap,
        },
        {
            key: 'agora',
            label: t('sidebar.agora'),
            ariaLabel: t('sidebar.openAgora'),
            icon: UsersIcon,
            active: activePath === '/agora',
            disabled: !canAccessFollowingFeed,
            onClick: onOpenFollowingFeed,
            unread: followingFeedHasUnread,
            unreadLabel: t('sidebar.agoraUnread'),
            ...(!canAccessFollowingFeed ? { disabledReason: signingRequiredLabel } : {}),
        },
        {
            key: 'publish',
            label: t('sidebar.publish'),
            ariaLabel: t('sidebar.openPublish'),
            icon: PenSquareIcon,
            active: false,
            disabled: !canWrite,
            onClick: onOpenPublish,
            prominent: true,
            title: canWrite ? t('sidebar.publish') : signingRequiredLabel,
            ...(!canWrite ? { disabledReason: signingRequiredLabel } : {}),
        },
        {
            key: 'relays',
            label: t('sidebar.relays'),
            ariaLabel: t('sidebar.openRelays'),
            icon: RadioTowerIcon,
            active: activePath === '/relays',
            onClick: onOpenRelays,
            badge: `${relaysConnectedCount}/${relaysTotal}`,
        },
        {
            key: 'notifications',
            label: t('sidebar.notifications'),
            ariaLabel: t('sidebar.openNotifications'),
            icon: BellIcon,
            active: activePath === '/notifications',
            disabled: !canAccessSocialNotifications,
            onClick: onOpenNotifications,
            unread: notificationsHasUnread,
            unreadLabel: t('sidebar.notificationsUnread'),
            title: canAccessSocialNotifications ? t('sidebar.notifications') : signingRequiredLabel,
            ...(!canAccessSocialNotifications ? { disabledReason: signingRequiredLabel } : {}),
        },
    ];

    return (
        <nav
            data-testid="mobile-bottom-navigation"
            className="nostr-mobile-bottom-navigation"
            aria-label={t('navigation.mobileBottom')}
        >
            {items.map((item) => <MobileBottomNavigationButton key={item.key} item={item} />)}
        </nav>
    );
}
