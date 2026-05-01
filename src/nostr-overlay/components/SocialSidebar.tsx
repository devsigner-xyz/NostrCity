import { useMemo, useState } from 'react';
import { UserRoundIcon, UsersIcon } from 'lucide-react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { useI18n } from '@/i18n/useI18n';
import { PeopleListTab } from './PeopleListTab';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';

type SocialTab = 'following' | 'followers';

interface SocialSidebarProps {
    follows?: string[];
    profiles?: Record<string, NostrProfile>;
    followers?: string[];
    followerProfiles?: Record<string, NostrProfile>;
    followersLoading?: boolean;
    selectedFollowingPubkey?: string;
    onSelectFollowing?: (pubkey: string) => void;
    onLocateFollowing?: (pubkey: string) => void;
    onMessagePerson?: (pubkey: string) => void | Promise<void>;
    onFollowPerson?: (pubkey: string) => void | Promise<void>;
    onViewPersonDetails?: (pubkey: string) => void;
    zapAmounts?: number[];
    onZapPerson?: (pubkey: string, amount: number) => void | Promise<void>;
    onConfigureZapAmounts?: () => void;
    onCopyOwnerNpub?: (value: string) => void | Promise<void>;
    verificationByPubkey?: Record<string, Nip05ValidationResult | undefined>;
}

export function SocialSidebar({
    follows = [],
    profiles = {},
    followers = [],
    followerProfiles = {},
    followersLoading = false,
    selectedFollowingPubkey,
    onSelectFollowing,
    onLocateFollowing,
    onMessagePerson,
    onFollowPerson,
    onViewPersonDetails,
    zapAmounts = [21, 128, 256],
    onZapPerson,
    onConfigureZapAmounts,
    onCopyOwnerNpub,
    verificationByPubkey = {},
}: SocialSidebarProps) {
    const { t } = useI18n();
    const { isMobile, setOpenMobile } = useSidebar();
    const [activeDialog, setActiveDialog] = useState<SocialTab | null>(null);
    const [followingSearch, setFollowingSearch] = useState('');
    const [followersSearch, setFollowersSearch] = useState('');

    const followingPeople = useMemo(() => [...new Set(follows)], [follows]);
    const followerPeople = useMemo(() => [...new Set(followers)], [followers]);

    const matchesSearch = (pubkey: string, profile: NostrProfile | undefined, query: string): boolean => {
        const displayName = profile?.displayName || '';
        const name = profile?.name || '';
        let npub: string;
        try {
            npub = encodeHexToNpub(pubkey);
        } catch {
            npub = '';
        }

        return pubkey.toLowerCase().includes(query)
            || npub.toLowerCase().includes(query)
            || displayName.toLowerCase().includes(query)
            || name.toLowerCase().includes(query);
    };

    const filteredFollowingPeople = useMemo(() => {
        const query = followingSearch.trim().toLowerCase();
        if (!query) {
            return followingPeople;
        }

        return followingPeople.filter((pubkey) => matchesSearch(pubkey, profiles[pubkey], query));
    }, [followingPeople, followingSearch, profiles]);

    const filteredFollowerPeople = useMemo(() => {
        const query = followersSearch.trim().toLowerCase();
        if (!query) {
            return followerPeople;
        }

        return followerPeople.filter((pubkey) => matchesSearch(pubkey, followerProfiles[pubkey], query));
    }, [followerPeople, followerProfiles, followersSearch]);
    const dialogTitle = activeDialog === 'followers' ? t('social.followersList') : t('social.followingList');
    const dialogDescription = activeDialog === 'followers' ? t('social.followersDialogDescription') : t('social.followingDialogDescription');

    const closeMobileSidebar = (): void => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    const selectPerson = (pubkey: string): void => {
        if (onViewPersonDetails) {
            onViewPersonDetails(pubkey);
        } else {
            onSelectFollowing?.(pubkey);
        }
        setActiveDialog(null);
        closeMobileSidebar();
    };

    const locatePerson = (pubkey: string): void => {
        onLocateFollowing?.(pubkey);
        setActiveDialog(null);
        closeMobileSidebar();
    };

    return (
        <div className="nostr-social-sidebar" aria-label={t('social.panel')}>
            <SidebarMenu className="nostr-social-list-menu gap-1.5">
                <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                        <button
                            type="button"
                            aria-label={t('social.openFollowingList')}
                            title={t('social.followingList')}
                            onClick={() => setActiveDialog('following')}
                        >
                            <UserRoundIcon />
                            <span>{t('social.followingList')}</span>
                        </button>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{followingPeople.length}</SidebarMenuBadge>
                </SidebarMenuItem>

                <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                        <button
                            type="button"
                            aria-label={t('social.openFollowersList')}
                            title={t('social.followersList')}
                            onClick={() => setActiveDialog('followers')}
                        >
                            <UsersIcon />
                            <span>{t('social.followersList')}</span>
                        </button>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{followerPeople.length}</SidebarMenuBadge>
                </SidebarMenuItem>
            </SidebarMenu>

            <Dialog open={activeDialog !== null} onOpenChange={(open) => setActiveDialog(open ? activeDialog : null)}>
                <DialogContent className="nostr-social-list-dialog flex h-[min(72vh,42rem)] max-w-2xl flex-col gap-3 overflow-hidden">
                    <div className="flex flex-col gap-1 pr-8">
                        <DialogTitle>{dialogTitle}</DialogTitle>
                        <DialogDescription>{dialogDescription}</DialogDescription>
                    </div>

                    <div className="min-h-0 flex-1">
                        {activeDialog === 'followers' ? (
                            <PeopleListTab
                                people={filteredFollowerPeople}
                                profiles={followerProfiles}
                                emptyText={followersSearch ? t('social.emptyFollowersSearch') : t('social.emptyFollowers')}
                                loading={followersLoading}
                                {...(selectedFollowingPubkey !== undefined ? { selectedPubkey: selectedFollowingPubkey } : {})}
                                {...(onSelectFollowing ? { onSelectPerson: selectPerson } : {})}
                                {...(onLocateFollowing ? { onLocatePerson: locatePerson } : {})}
                                {...(onCopyOwnerNpub ? { onCopyNpub: onCopyOwnerNpub } : {})}
                                {...(onMessagePerson ? { onSendMessage: onMessagePerson } : {})}
                                {...(onViewPersonDetails ? { onViewDetails: onViewPersonDetails } : {})}
                                zapAmounts={zapAmounts}
                                {...(onZapPerson ? { onZapPerson } : {})}
                                {...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {})}
                                followedPubkeys={followingPeople}
                                {...(onFollowPerson ? { onFollowPerson } : {})}
                                {...(followerPeople.length > 0 ? { searchQuery: followersSearch } : {})}
                                {...(followerPeople.length > 0 ? { onSearchQueryChange: setFollowersSearch } : {})}
                                {...(followerPeople.length > 0 ? { searchAriaLabel: t('social.searchFollowers') } : {})}
                                verificationByPubkey={verificationByPubkey}
                            />
                        ) : (
                            <PeopleListTab
                                people={filteredFollowingPeople}
                                profiles={profiles}
                                emptyText={followingSearch ? t('social.emptyFollowingSearch') : t('social.emptyFollowing')}
                                loading={false}
                                {...(selectedFollowingPubkey !== undefined ? { selectedPubkey: selectedFollowingPubkey } : {})}
                                {...(onSelectFollowing ? { onSelectPerson: selectPerson } : {})}
                                {...(onLocateFollowing ? { onLocatePerson: locatePerson } : {})}
                                {...(onCopyOwnerNpub ? { onCopyNpub: onCopyOwnerNpub } : {})}
                                {...(onMessagePerson ? { onSendMessage: onMessagePerson } : {})}
                                {...(onViewPersonDetails ? { onViewDetails: onViewPersonDetails } : {})}
                                zapAmounts={zapAmounts}
                                {...(onZapPerson ? { onZapPerson } : {})}
                                {...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {})}
                                {...(followingPeople.length > 0 ? { searchQuery: followingSearch } : {})}
                                {...(followingPeople.length > 0 ? { onSearchQueryChange: setFollowingSearch } : {})}
                                {...(followingPeople.length > 0 ? { searchAriaLabel: t('social.searchFollowing') } : {})}
                                followedPubkeys={followingPeople}
                                {...(onFollowPerson ? { onFollowPerson } : {})}
                                followActionPlacement="context"
                                verificationByPubkey={verificationByPubkey}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
