import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type UIEvent } from 'react';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import { encodeHexToNpub } from '../../nostr/npub';
import { RELAY_TYPES, type RelaySettingsByType, type RelayType } from '../../nostr/relay-settings';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import type { NostrPostPreview } from '../../nostr/posts';
import { ListLoadingFooter } from './ListLoadingFooter';
import { NoteCard } from './NoteCard';
import { buildPreviewActionState } from './following-feed-note-card-mappers';
import { Nip05Identifier } from './Nip05Identifier';
import { fromPostPreview } from './note-card-adapters';
import type { NoteCardModel } from './note-card-model';
import { withoutNoteActions } from './note-card-model';
import { EllipsisVerticalIcon, MessageCircleIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import type { I18nContextValue } from '@/i18n/I18nProvider';
import { useI18n } from '@/i18n/useI18n';
import { PersonContextMenuItems } from './PersonContextMenuItems';
import { UserBotBadge } from './UserBotBadge';
import { VerifiedUserAvatar } from './VerifiedUserAvatar';
import { toast } from 'sonner';
import type { SocialEngagementMetrics, ViewerReactionByEventId, ViewerReplyByEventId, ViewerZapByEventId } from '../../nostr/social-feed-service';
import { sanitizeImageUrl } from '../media/image-url-policy';

interface OccupantProfileDialogProps {
    ownerPubkey?: string;
    pubkey: string;
    profile?: NostrProfile;
    followsCount: number;
    followersCount: number;
    statsLoading: boolean;
    statsError?: string;
    posts: NostrPostPreview[];
    engagementByEventId?: Record<string, SocialEngagementMetrics>;
    postsLoading: boolean;
    postsError?: string;
    hasMorePosts: boolean;
    follows: string[];
    followers: string[];
    followersError?: string;
    networkProfiles: Record<string, NostrProfile>;
    profilesByPubkey?: Record<string, NostrProfile>;
    networkLoading: boolean;
    networkError?: string;
    verification?: Nip05ValidationResult;
    verificationByPubkey?: Record<string, Nip05ValidationResult | undefined>;
    onLoadMorePosts: () => Promise<void>;
    onRetryPosts?: () => Promise<void>;
    onRetryNetwork?: () => Promise<void>;
    onSelectHashtag?: (hashtag: string) => void;
    onSelectProfile?: (pubkey: string) => void;
    onCopyNpub?: (value: string) => void | Promise<void>;
    ownerFollows?: string[];
    mutedPubkeys?: string[];
    onFollowProfile?: (pubkey: string) => void | Promise<void>;
    onToggleMuteProfile?: (pubkey: string) => void | Promise<void>;
    onSendMessage?: (pubkey: string) => void | Promise<void>;
    canWrite?: boolean;
    reactionByEventId?: Record<string, boolean>;
    viewerReactionByEventId?: ViewerReactionByEventId;
    viewerZapByEventId?: ViewerZapByEventId;
    viewerReplyByEventId?: ViewerReplyByEventId;
    repostByEventId?: Record<string, boolean>;
    pendingReactionByEventId?: Record<string, boolean>;
    pendingRepostByEventId?: Record<string, boolean>;
    relaySuggestionsByType?: RelaySettingsByType;
    onOpenThread?: (eventId: string) => void | Promise<void>;
    onAddRelaySuggestion?: (relayUrl: string, relayTypes: RelayType[]) => void | Promise<void>;
    onAddAllRelaySuggestions?: (rows: Array<{ relayUrl: string; relayTypes: RelayType[] }>) => void | Promise<void>;
    onToggleReaction?: (input: { eventId: string; targetPubkey?: string; emoji?: string }) => Promise<boolean>;
    onToggleRepost?: (input: { eventId: string; targetPubkey?: string; repostContent?: string }) => Promise<boolean>;
    onOpenQuoteComposer?: (note: NoteCardModel) => void;
    onZap?: (input: { eventId: string; eventKind?: number; targetPubkey?: string; amount: number }) => Promise<void> | void;
    zapAmounts?: number[];
    onConfigureZapAmounts?: () => void;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onSelectEventReference?: (eventId: string) => void;
    onResolveEventReferences?: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
    eventReferencesById?: Record<string, NostrEvent>;
    onClose: () => void;
}

function resolveName(pubkey: string, profile?: NostrProfile): string {
    return profile?.displayName ?? profile?.name ?? `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

function resolveInitials(pubkey: string, profile?: NostrProfile): string {
    const name = resolveName(pubkey, profile).trim();
    if (!name) {
        return pubkey.slice(0, 2).toUpperCase();
    }

    const parts = name.split(/\s+/).filter((part) => part.length > 0);
    if (parts.length === 1) {
        return (parts[0] ?? '').slice(0, 2).toUpperCase();
    }

    return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

function pubkeyToNpub(pubkey: string): string {
    try {
        return encodeHexToNpub(pubkey);
    } catch {
        return pubkey;
    }
}

function truncateIdentifier(identifier: string): string {
    if (identifier.length <= 22) {
        return identifier;
    }

    return `${identifier.slice(0, 14)}...${identifier.slice(-6)}`;
}

function buildFollowActionState(
    targetPubkey: string,
    displayName: string,
    ownerFollowSet: Set<string>,
    pendingFollowByPubkey: Record<string, boolean>,
    t: I18nContextValue['t'],
) {
    const isFollowPending = Object.prototype.hasOwnProperty.call(pendingFollowByPubkey, targetPubkey);
    const isFollowed = isFollowPending ? true : ownerFollowSet.has(targetPubkey);
    const isDisabled = isFollowPending;

    return {
        isFollowed,
        isDisabled,
        label: isFollowed ? t('profile.following') : t('profile.follow'),
        ariaLabel: isFollowPending
            ? t('profile.followStatusUpdating', { displayName })
            : isFollowed
                ? t('profile.unfollow', { displayName })
                : t('profile.followPerson', { displayName }),
    };
}

function buildMuteActionState(
    targetPubkey: string,
    displayName: string,
    mutedSet: Set<string>,
    pendingMuteByPubkey: Record<string, boolean>,
    t: I18nContextValue['t'],
) {
    const isMutePending = Object.prototype.hasOwnProperty.call(pendingMuteByPubkey, targetPubkey);
    const isMuted = mutedSet.has(targetPubkey);

    return {
        isMuted,
        isDisabled: isMutePending,
        label: isMuted ? t('profile.unmute') : t('profile.mute'),
        ariaLabel: isMutePending
            ? t('profile.muteStatusUpdating', { displayName })
            : isMuted
                ? t('profile.unmutePerson', { displayName })
                : t('profile.mutePerson', { displayName }),
    };
}

const NETWORK_PAGE_SIZE = 20;
const NETWORK_LOAD_DELAY_MS = 120;
type OccupantProfileTab = 'info' | 'feed' | 'followers' | 'following';

const RELAY_TYPE_LABELS: Record<RelayType, string> = {
    nip65Both: 'NIP-65 read+write',
    nip65Read: 'NIP-65 read',
    nip65Write: 'NIP-65 write',
    dmInbox: 'NIP-17 DM inbox',
    search: 'NIP-50 search',
    groups: 'NIP-29 groups',
};

function createTabScrollTopState(): Record<OccupantProfileTab, number> {
    return {
        info: 0,
        feed: 0,
        followers: 0,
        following: 0,
    };
}

function buildRelaySuggestionRows(relaySuggestionsByType?: RelaySettingsByType): Array<{ relayUrl: string; relayTypes: RelayType[] }> {
    if (!relaySuggestionsByType) {
        return [];
    }

    const relayTypesByUrl = new Map<string, Set<RelayType>>();
    for (const relayType of RELAY_TYPES.filter((currentRelayType) => currentRelayType !== 'search' && currentRelayType !== 'groups')) {
        const relaySet = relaySuggestionsByType[relayType] ?? [];
        for (const relayUrl of relaySet) {
            const current = relayTypesByUrl.get(relayUrl) ?? new Set<RelayType>();
            current.add(relayType);
            relayTypesByUrl.set(relayUrl, current);
        }
    }

    return [...relayTypesByUrl.entries()]
        .map(([relayUrl, relayTypesSet]) => ({
            relayUrl,
            relayTypes: RELAY_TYPES.filter((relayType) => relayType !== 'search' && relayType !== 'groups' && relayTypesSet.has(relayType)),
        }))
        .sort((left, right) => left.relayUrl.localeCompare(right.relayUrl));
}

export function OccupantProfileDialog({
    ownerPubkey,
    pubkey,
    profile,
    posts,
    engagementByEventId = {},
    postsLoading,
    postsError,
    hasMorePosts,
    follows,
    followers,
    followersError,
    networkProfiles,
    profilesByPubkey,
    networkLoading,
    networkError,
    verification,
    verificationByPubkey = {},
    onLoadMorePosts,
    onSelectHashtag,
    onSelectProfile,
    onCopyNpub,
    ownerFollows = [],
    mutedPubkeys = [],
    onFollowProfile,
    onToggleMuteProfile,
    onSendMessage,
    canWrite = false,
    reactionByEventId = {},
    viewerReactionByEventId = {},
    viewerZapByEventId = {},
    viewerReplyByEventId = {},
    repostByEventId = {},
    pendingReactionByEventId = {},
    pendingRepostByEventId = {},
    relaySuggestionsByType,
    onOpenThread,
    onAddRelaySuggestion,
    onAddAllRelaySuggestions,
    onToggleReaction,
    onToggleRepost,
    onOpenQuoteComposer,
    onZap,
    zapAmounts = [21, 128, 256],
    onConfigureZapAmounts,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
    eventReferencesById,
    onClose,
    onRetryPosts,
    onRetryNetwork,
}: OccupantProfileDialogProps) {
    const { t } = useI18n();
    const profileScrollRef = useRef<HTMLDivElement | null>(null);
    const scrollTopByTabRef = useRef<Record<OccupantProfileTab, number>>(createTabScrollTopState());
    const followsTimerRef = useRef<number | null>(null);
    const followersTimerRef = useRef<number | null>(null);
    const [visibleFollowsCount, setVisibleFollowsCount] = useState(() => Math.min(NETWORK_PAGE_SIZE, follows.length));
    const [visibleFollowersCount, setVisibleFollowersCount] = useState(() => Math.min(NETWORK_PAGE_SIZE, followers.length));
    const [followsLoadingMore, setFollowsLoadingMore] = useState(false);
    const [followersLoadingMore, setFollowersLoadingMore] = useState(false);
    const [pendingFollowByPubkey, setPendingFollowByPubkey] = useState<Record<string, boolean>>({});
    const [pendingMuteByPubkey, setPendingMuteByPubkey] = useState<Record<string, boolean>>({});
    const [activeTab, setActiveTab] = useState<OccupantProfileTab>('info');
    const ownerFollowSet = useMemo(() => new Set(ownerFollows), [ownerFollows]);
    const mutedSet = useMemo(() => new Set(mutedPubkeys), [mutedPubkeys]);
    const displayName = resolveName(pubkey, profile);
    const relaySuggestionRows = useMemo(
        () => buildRelaySuggestionRows(relaySuggestionsByType),
        [relaySuggestionsByType]
    );
    const canAddRelaySuggestions = typeof onAddRelaySuggestion === 'function';
    const canAddAllRelaySuggestions = typeof onAddAllRelaySuggestions === 'function' && relaySuggestionRows.length > 1;
    const canFollowActiveProfile = typeof onFollowProfile === 'function' && ownerPubkey !== pubkey;
    const canMuteActiveProfile = typeof onToggleMuteProfile === 'function' && ownerPubkey !== pubkey;
    const canSendMessageToActiveProfile = typeof onSendMessage === 'function' && ownerPubkey !== pubkey;
    const activeProfileFollowState = buildFollowActionState(pubkey, displayName, ownerFollowSet, pendingFollowByPubkey, t);
    const activeProfileMuteState = buildMuteActionState(pubkey, displayName, mutedSet, pendingMuteByPubkey, t);

    const npubValue = useMemo(() => {
        try {
            return encodeHexToNpub(pubkey);
        } catch {
            return pubkey;
        }
    }, [pubkey]);
    const npubLabel = npubValue.startsWith('npub1')
        ? `${npubValue.slice(0, 14)}...${npubValue.slice(-6)}`
        : `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;

    const copyNpubToClipboard = async (): Promise<void> => {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            return;
        }

        try {
            await navigator.clipboard.writeText(npubValue);
            toast.success(t('profile.toast.npubCopied'), { duration: 1600 });
        } catch {
            return;
        }
    };

    const copyNoteIdToClipboard = async (noteId: string): Promise<void> => {
        if (!noteId || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            return;
        }

        try {
            await navigator.clipboard.writeText(noteId);
            toast.success(t('profile.toast.noteIdCopied'), { duration: 1600 });
        } catch {
            return;
        }
    };

    useEffect(() => {
        setVisibleFollowsCount(Math.min(NETWORK_PAGE_SIZE, follows.length));
        setFollowsLoadingMore(false);
        if (followsTimerRef.current !== null) {
            window.clearTimeout(followsTimerRef.current);
            followsTimerRef.current = null;
        }
    }, [follows]);

    useEffect(() => {
        setVisibleFollowersCount(Math.min(NETWORK_PAGE_SIZE, followers.length));
        setFollowersLoadingMore(false);
        if (followersTimerRef.current !== null) {
            window.clearTimeout(followersTimerRef.current);
            followersTimerRef.current = null;
        }
    }, [followers]);

    useEffect(() => {
        return () => {
            if (followsTimerRef.current !== null) {
                window.clearTimeout(followsTimerRef.current);
            }
            if (followersTimerRef.current !== null) {
                window.clearTimeout(followersTimerRef.current);
            }
        };
    }, []);

    useLayoutEffect(() => {
        scrollTopByTabRef.current = createTabScrollTopState();
        const scrollPanel = profileScrollRef.current;
        if (!scrollPanel) {
            return;
        }

        scrollPanel.scrollTop = 0;
    }, [pubkey]);

    useLayoutEffect(() => {
        const scrollPanel = profileScrollRef.current;
        if (!scrollPanel) {
            return;
        }

        scrollPanel.scrollTop = scrollTopByTabRef.current[activeTab] ?? 0;
    }, [activeTab]);

    const visibleFollows = follows.slice(0, visibleFollowsCount);
    const visibleFollowers = followers.slice(0, visibleFollowersCount);
    const hasMoreFollows = visibleFollowsCount < follows.length;
    const hasMoreFollowers = visibleFollowersCount < followers.length;

    const scheduleLoadMoreFollows = (): void => {
        if (followsLoadingMore || !hasMoreFollows) {
            return;
        }

        setFollowsLoadingMore(true);
        followsTimerRef.current = window.setTimeout(() => {
            setVisibleFollowsCount((current) => Math.min(current + NETWORK_PAGE_SIZE, follows.length));
            setFollowsLoadingMore(false);
            followsTimerRef.current = null;
        }, NETWORK_LOAD_DELAY_MS);
    };

    const scheduleLoadMoreFollowers = (): void => {
        if (followersLoadingMore || !hasMoreFollowers) {
            return;
        }

        setFollowersLoadingMore(true);
        followersTimerRef.current = window.setTimeout(() => {
            setVisibleFollowersCount((current) => Math.min(current + NETWORK_PAGE_SIZE, followers.length));
            setFollowersLoadingMore(false);
            followersTimerRef.current = null;
        }, NETWORK_LOAD_DELAY_MS);
    };

    const handleTabScroll = (tab: OccupantProfileTab, event: UIEvent<HTMLDivElement>): void => {
        const target = event.currentTarget;
        scrollTopByTabRef.current[tab] = target.scrollTop;
        const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 32;
        if (!nearBottom) {
            return;
        }

        if (tab === 'feed' && hasMorePosts && !postsLoading) {
            void onLoadMorePosts();
        }

        if (tab === 'following' && hasMoreFollows) {
            scheduleLoadMoreFollows();
        }

        if (tab === 'followers' && hasMoreFollowers) {
            scheduleLoadMoreFollowers();
        }
    };

    const handleActiveTabChange = (value: string): void => {
        const scrollPanel = profileScrollRef.current;
        if (scrollPanel) {
            scrollTopByTabRef.current[activeTab] = scrollPanel.scrollTop;
        }

        setActiveTab(value as OccupantProfileTab);
    };

    const followProfile = (targetPubkey: string): void => {
        if (typeof onFollowProfile !== 'function') {
            return;
        }

        setPendingFollowByPubkey((current) => ({
            ...current,
            [targetPubkey]: true,
        }));

        void Promise.resolve(onFollowProfile(targetPubkey))
            .catch((): void => undefined)
            .finally((): void => {
                setPendingFollowByPubkey((current) => {
                    if (!current[targetPubkey]) {
                        return current;
                    }

                    const next = { ...current };
                    delete next[targetPubkey];
                    return next;
                });
        });
    };

    const toggleMuteProfile = (targetPubkey: string): void => {
        if (typeof onToggleMuteProfile !== 'function') {
            return;
        }

        setPendingMuteByPubkey((current) => ({
            ...current,
            [targetPubkey]: true,
        }));

        void Promise.resolve(onToggleMuteProfile(targetPubkey))
            .catch((): void => undefined)
            .finally((): void => {
                setPendingMuteByPubkey((current) => {
                    if (!current[targetPubkey]) {
                        return current;
                    }

                    const next = { ...current };
                    delete next[targetPubkey];
                    return next;
                });
            });
    };

    const openPersonActionsMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }));
    };

    const addRelaySuggestion = (relayUrl: string, relayTypes: RelayType[]): void => {
        if (typeof onAddRelaySuggestion !== 'function' || relayTypes.length === 0) {
            return;
        }

        void Promise.resolve(onAddRelaySuggestion(relayUrl, relayTypes));
    };

    const addAllRelaySuggestions = (): void => {
        if (typeof onAddAllRelaySuggestions !== 'function' || relaySuggestionRows.length === 0) {
            return;
        }

        void Promise.resolve(onAddAllRelaySuggestions(relaySuggestionRows));
    };

    const infoRows: Array<{ label: string; value: ReactNode }> = [
        ...(profile?.about ? [{ label: t('profile.info.description'), value: profile.about }] : []),
        ...(profile?.nip05
            ? [{
                label: 'NIP-05',
                value: (
                    <Nip05Identifier
                        {...(profile ? { profile } : {})}
                        {...(verification ? { verification } : {})}
                    />
                ),
            }]
            : []),
        ...(profile?.website
            ? [{
                label: t('profile.info.website'),
                value: (
                    <a href={profile.website} target="_blank" rel="noreferrer noopener" className="nostr-profile-info-link">
                        {profile.website}
                    </a>
                ),
            }]
            : []),
        ...(profile?.lud16 ? [{ label: 'LUD16', value: profile.lud16 }] : []),
        ...(profile?.lud06 ? [{ label: 'LUD06', value: profile.lud06 }] : []),
        ...(profile?.externalIdentities?.length
            ? [{
                label: t('profile.info.externalIdentities'),
                value: (
                    <ul className="nostr-profile-identities">
                        {profile.externalIdentities.map((identity) => (
                            <li key={identity}>{identity}</li>
                        ))}
                    </ul>
                ),
            }]
            : []),
    ];

    const renderNetworkPersonItem = (personPubkey: string) => {
        const personProfile = networkProfiles[personPubkey];
        const personDisplay = resolveName(personPubkey, personProfile);
        const personNpub = pubkeyToNpub(personPubkey);
        const personNpubLabel = personNpub.startsWith('npub1')
            ? truncateIdentifier(personNpub)
            : `${personPubkey.slice(0, 8)}...${personPubkey.slice(-6)}`;
        const personVerification = verificationByPubkey[personPubkey];
        const selectable = typeof onSelectProfile === 'function';
        const canFollow = typeof onFollowProfile === 'function' && ownerPubkey !== personPubkey;
        const canCopy = typeof onCopyNpub === 'function';
        const canSendMessage = typeof onSendMessage === 'function' && ownerPubkey !== personPubkey;
        const canViewDetails = typeof onSelectProfile === 'function';
        const followState = buildFollowActionState(personPubkey, personDisplay, ownerFollowSet, pendingFollowByPubkey, t);
        const canToggleMute = typeof onToggleMuteProfile === 'function' && ownerPubkey !== personPubkey;
        const muteState = buildMuteActionState(personPubkey, personDisplay, mutedSet, pendingMuteByPubkey, t);

        const contextMenuActionProps = {
            ...(canCopy ? { onCopyNpub: () => onCopyNpub?.(pubkeyToNpub(personPubkey)) } : {}),
            ...(canSendMessage ? { onSendMessage: () => onSendMessage?.(personPubkey) } : {}),
            ...(canViewDetails ? { onViewDetails: () => onSelectProfile?.(personPubkey) } : {}),
            ...(canToggleMute ? { onToggleMute: () => onToggleMuteProfile?.(personPubkey) } : {}),
            ...(canToggleMute ? { isMuted: muteState.isMuted } : {}),
            testIdPrefix: `profile-network-${personPubkey}`,
        };

        const personContent = (
            <>
                <ItemMedia>
                    <VerifiedUserAvatar
                        picture={personProfile?.picture}
                        imageAlt={personDisplay}
                        fallback={resolveInitials(personPubkey, personProfile)}
                        nip05={personProfile?.nip05}
                        verification={personVerification}
                    />
                </ItemMedia>
                <ItemContent className="min-w-0">
                    <ItemTitle>
                        <span className="truncate">{personDisplay}</span>
                        <UserBotBadge bot={personProfile?.bot} />
                    </ItemTitle>
                    <ItemDescription className="truncate">{personNpubLabel}</ItemDescription>
                </ItemContent>
            </>
        );

        return (
            <Item variant="outline" size="sm" className="gap-2">
                {selectable ? (
                    <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left outline-none"
                        onClick={() => onSelectProfile?.(personPubkey)}
                    >
                        {personContent}
                    </button>
                ) : personContent}

                {canFollow ? (
                    <Button
                        type="button"
                        size="xs"
                        variant={followState.isFollowed ? 'secondary' : 'outline'}
                        className="shrink-0"
                        disabled={followState.isDisabled}
                        aria-label={followState.ariaLabel}
                        onClick={() => followProfile(personPubkey)}
                    >
                        {followState.label}
                    </Button>
                ) : null}

                {(canCopy || canSendMessage || canViewDetails) ? (
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                className="shrink-0"
                                aria-label={t('profile.actions.openFor', { displayName: personDisplay })}
                                onClick={openPersonActionsMenu}
                            >
                                <EllipsisVerticalIcon data-icon="inline-start" />
                            </Button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                            <ContextMenuGroup>
                                <PersonContextMenuItems {...contextMenuActionProps} />
                            </ContextMenuGroup>
                        </ContextMenuContent>
                    </ContextMenu>
                ) : null}
            </Item>
        );
    };
    const noteCardSharedProps = {
        ...(onSelectHashtag ? { onSelectHashtag } : {}),
        ...(onSelectProfile ? { onSelectProfile } : {}),
        ...(onResolveProfiles ? { onResolveProfiles } : {}),
        ...(onSelectEventReference ? { onSelectEventReference } : {}),
        ...(onResolveEventReferences ? { onResolveEventReferences } : {}),
        ...(eventReferencesById ? { eventReferencesById } : {}),
    };
    const canRenderPostActions = typeof onOpenThread === 'function' && typeof onToggleReaction === 'function' && typeof onToggleRepost === 'function' && typeof onZap === 'function';
    const renderFeedErrorState = (): ReactNode => (
        <div className="nostr-profile-posts-empty-state">
            <Empty className="nostr-profile-posts-empty">
                <EmptyHeader>
                    <EmptyTitle>{t('profile.feed.errorTitle')}</EmptyTitle>
                    <EmptyDescription>{t('profile.feed.errorDescription')}</EmptyDescription>
                </EmptyHeader>
                {onRetryPosts ? (
                    <EmptyContent>
                        <Button type="button" variant="outline" onClick={() => void onRetryPosts()}>
                            {t('profile.feed.retry')}
                        </Button>
                    </EmptyContent>
                ) : null}
            </Empty>
        </div>
    );
    const renderNetworkErrorState = (): ReactNode => (
        <div className="nostr-profile-network-empty-state">
            <Empty className="nostr-profile-network-empty">
                <EmptyHeader>
                    <EmptyTitle>{t('profile.network.errorTitle')}</EmptyTitle>
                    <EmptyDescription>{t('profile.network.errorDescription')}</EmptyDescription>
                </EmptyHeader>
                {onRetryNetwork ? (
                    <EmptyContent>
                        <Button type="button" variant="outline" onClick={() => void onRetryNetwork()}>
                            {t('profile.network.retry')}
                        </Button>
                    </EmptyContent>
                ) : null}
            </Empty>
        </div>
    );
    const safeBanner = sanitizeImageUrl(profile?.banner);

    return (
        <Dialog open onOpenChange={(open) => {
            if (!open) {
                onClose();
            }
        }}>
            <DialogContent
                className="nostr-dialog nostr-profile-dialog"
                showCloseButton={false}
                aria-label={t('profile.dialog.aria')}
            >
                <DialogTitle className="sr-only">{t('profile.dialog.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('profile.dialog.description')}</DialogDescription>
                <DialogClose asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-2 right-2 z-10 border-border bg-background/95 text-foreground shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/80 hover:bg-background dark:bg-background/90 dark:hover:bg-background"
                        aria-label={t('profile.dialog.close')}
                        title={t('profile.dialog.close')}
                    >
                        <XIcon />
                        <span className="sr-only">{t('profile.dialog.close')}</span>
                    </Button>
                </DialogClose>

                <div className="nostr-profile-dialog-body">
                    <Tabs
                        value={activeTab}
                        onValueChange={handleActiveTabChange}
                        className="nostr-profile-dialog-tabs"
                        aria-label={t('profile.dialog.tabs')}
                    >
                        <div
                            ref={profileScrollRef}
                            className="nostr-profile-tab-panel-scroll"
                            style={{ scrollbarGutter: 'stable', height: '100%' }}
                            onScroll={(event) => handleTabScroll(activeTab, event)}
                        >
                            <div className={`nostr-profile-dialog-banner-shell${safeBanner ? '' : ' is-placeholder'}`}>
                                {safeBanner ? <img className="nostr-profile-dialog-banner" src={safeBanner} alt={t('profile.dialog.bannerAlt')} /> : null}
                            </div>

                            <div className="nostr-profile-dialog-sticky-shell">
                                <div className="nostr-dialog-header flex items-center gap-3">
                                    <VerifiedUserAvatar
                                        picture={profile?.picture}
                                        imageAlt={t('profile.dialog.avatarAlt')}
                                        fallback={resolveInitials(pubkey, profile)}
                                        nip05={profile?.nip05}
                                        verification={verification}
                                        className="border border-border/70 shadow-xs"
                                        fallbackClassName="bg-muted text-muted-foreground"
                                    />

                                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                        <div className="flex min-w-0 flex-col gap-0.5">
                                            <p className="nostr-dialog-name nostr-identity-row inline-flex max-w-full items-center gap-2 text-base font-semibold leading-tight text-foreground">
                                                <span className="truncate">{resolveName(pubkey, profile)}</span>
                                                <UserBotBadge bot={profile?.bot} />
                                            </p>
                                            <div className="nostr-dialog-pubkey-row flex min-w-0 items-center leading-tight">
                                                <button
                                                    type="button"
                                                    className="nostr-dialog-pubkey nostr-dialog-pubkey-copy min-h-6 min-w-0 truncate rounded-sm text-left text-sm leading-tight text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                                    aria-label={t('profile.dialog.copyNpub')}
                                                    title={t('profile.dialog.copyNpub')}
                                                    onClick={() => {
                                                        void copyNpubToClipboard();
                                                    }}
                                                >
                                                    {npubLabel}
                                                </button>
                                            </div>
                                        </div>

                                        {(canSendMessageToActiveProfile || canFollowActiveProfile || canMuteActiveProfile) ? (
                                            <div className="flex shrink-0 items-center gap-2">
                                                {canSendMessageToActiveProfile ? (
                                                    <Button
                                                        type="button"
                                                        size="icon-xs"
                                                        variant="outline"
                                                        aria-label={t('profile.sendMessageTo', { displayName })}
                                                        title={t('profile.sendMessageTo', { displayName })}
                                                        onClick={() => {
                                                            void onSendMessage?.(pubkey);
                                                        }}
                                                    >
                                                        <MessageCircleIcon data-icon="inline-start" />
                                                    </Button>
                                                ) : null}

                                                {canFollowActiveProfile ? (
                                                    <Button
                                                        type="button"
                                                        size="xs"
                                                        variant="outline"
                                                        className="shrink-0"
                                                        disabled={activeProfileFollowState.isDisabled}
                                                        aria-label={activeProfileFollowState.ariaLabel}
                                                        onClick={() => followProfile(pubkey)}
                                                    >
                                                        {activeProfileFollowState.label}
                                                    </Button>
                                                ) : null}

                                                {canMuteActiveProfile ? (
                                                    <Button
                                                        type="button"
                                                        size="xs"
                                                        variant={activeProfileMuteState.isMuted ? 'secondary' : 'outline'}
                                                        className="shrink-0"
                                                        disabled={activeProfileMuteState.isDisabled}
                                                        aria-label={activeProfileMuteState.ariaLabel}
                                                        onClick={() => toggleMuteProfile(pubkey)}
                                                    >
                                                        {activeProfileMuteState.label}
                                                    </Button>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <Separator className="nostr-profile-dialog-separator" />

                                <TabsList variant="line" className="flex h-auto w-full justify-start" aria-label={t('profile.dialog.tabs')}>
                                    <TabsTrigger value="info">{t('profile.dialog.tabInfo')}</TabsTrigger>
                                    <TabsTrigger value="feed">{t('profile.dialog.tabFeed')}</TabsTrigger>
                                    <TabsTrigger value="following">{t('profile.dialog.tabFollowing', { count: String(follows.length) })}</TabsTrigger>
                                    <TabsTrigger value="followers">{t('profile.dialog.tabFollowers', { count: String(followers.length) })}</TabsTrigger>
                                </TabsList>
                            </div>

                        <TabsContent value="info" className="nostr-profile-tab-panel">
                            <section className="nostr-profile-info">
                                    <dl className="nostr-profile-info-list">
                                        {infoRows.map((row) => (
                                            <div key={row.label} className="nostr-profile-info-row">
                                                <dt>{row.label}</dt>
                                                <dd>{row.value}</dd>
                                            </div>
                                        ))}
                                    </dl>

                                    {relaySuggestionRows.length > 0 ? (
                                        <section className="nostr-profile-info-section">
                                            <div className="nostr-profile-info-section-header">
                                                <h5 className="nostr-profile-info-section-title">{t('profile.relays.declared')}</h5>
                                                {canAddAllRelaySuggestions ? (
                                                    <Button
                                                        type="button"
                                                        size="xs"
                                                        variant="outline"
                                                        aria-label={t('profile.relays.addAllAria')}
                                                        onClick={addAllRelaySuggestions}
                                                    >
                                                        {t('profile.relays.addAll')}
                                                    </Button>
                                                ) : null}
                                            </div>

                                            <ItemGroup className="nostr-profile-network-list">
                                                {relaySuggestionRows.map((relayRow) => (
                                                        <div key={relayRow.relayUrl} className="nostr-profile-network-item-wrap">
                                                            <Item variant="outline" size="sm" className="gap-2">
                                                                <ItemContent className="min-w-0 flex-1">
                                                                    <ItemTitle className="nostr-profile-info-section-value">
                                                                        <span className="truncate">{relayRow.relayUrl}</span>
                                                                    </ItemTitle>
                                                                    <ItemDescription>
                                                                        <span className="nostr-relay-nip-badges">
                                                                            {relayRow.relayTypes.map((relayType) => (
                                                                                <Badge key={`${relayRow.relayUrl}-${relayType}`} variant="outline">
                                                                                    {RELAY_TYPE_LABELS[relayType]}
                                                                                </Badge>
                                                                            ))}
                                                                        </span>
                                                                    </ItemDescription>
                                                                </ItemContent>

                                                                {canAddRelaySuggestions ? (
                                                                    <Button
                                                                        type="button"
                                                                        size="xs"
                                                                        variant="outline"
                                                                        className="shrink-0"
                                                                        aria-label={t('profile.relays.addOne', { relayUrl: relayRow.relayUrl })}
                                                                        onClick={() => addRelaySuggestion(relayRow.relayUrl, relayRow.relayTypes)}
                                                                    >
                                                                        {t('settings.relays.add')}
                                                                    </Button>
                                                                ) : null}
                                                            </Item>
                                                        </div>
                                                    ))}
                                            </ItemGroup>
                                        </section>
                                    ) : null}
                            </section>
                        </TabsContent>

                        <TabsContent value="feed" className="nostr-profile-tab-panel">
                            <section className="nostr-profile-posts">
                                    {postsError && posts.length === 0 ? renderFeedErrorState() : null}

                                    {!postsError && posts.length === 0 && !postsLoading ? (
                                        <div className="nostr-profile-posts-empty-state">
                                            <Empty className="nostr-profile-posts-empty">
                                                <EmptyHeader>
                                                    <EmptyTitle>{t('profile.feed.empty')}</EmptyTitle>
                                                </EmptyHeader>
                                            </Empty>
                                        </div>
                                    ) : null}

                                    {posts.length > 0 ? (
                                        <div className="nostr-profile-post-list px-1 pt-1" data-testid="profile-post-list">
                                            {posts.map((post) => {
                                                const actionState = canRenderPostActions
                                                    ? buildPreviewActionState({
                                                        item: post,
                                                        canWrite,
                                                        engagementByEventId,
                                                        reactionByEventId,
                                                        viewerReactionByEventId,
                                                        viewerZapByEventId,
                                                        viewerReplyByEventId,
                                                        repostByEventId,
                                                        pendingReactionByEventId,
                                                        pendingRepostByEventId,
                                                        onOpenThread,
                                                        onToggleReaction,
                                                        onToggleRepost,
                                                        onQuote: () => {},
                                                        onZap,
                                                        zapAmounts,
                                                        ...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {}),
                                                    })
                                                    : undefined;
                                                const note = fromPostPreview(post, actionState);
                                                if (!note) {
                                                    return (
                                                        <article key={post.id}>
                                                            <p>{t('profile.feed.renderError')}</p>
                                                        </article>
                                                    );
                                                }

                                                if (note.actions && onOpenQuoteComposer) {
                                                    note.actions.onQuote = () => onOpenQuoteComposer(withoutNoteActions(note));
                                                }

                                                return (
                                                    <NoteCard
                                                        key={post.id}
                                                        note={note}
                                                        profilesByPubkey={profilesByPubkey || {}}
                                                        onCopyNoteId={copyNoteIdToClipboard}
                                                        {...noteCardSharedProps}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ) : null}

                                    {postsError && posts.length > 0 ? renderFeedErrorState() : null}

                                    {postsLoading && posts.length === 0 ? (
                                        <div className="nostr-profile-posts-empty-state">
                                            <Empty className="nostr-profile-posts-empty">
                                                <EmptyHeader>
                                                    <EmptyMedia variant="icon">
                                                        <Spinner />
                                                    </EmptyMedia>
                                                    <EmptyTitle>{t('profile.feed.loadingTitle')}</EmptyTitle>
                                                    <EmptyDescription>{t('profile.feed.loadingDescription', { displayName })}</EmptyDescription>
                                                </EmptyHeader>
                                            </Empty>
                                        </div>
                                    ) : null}

                                    {postsLoading && posts.length > 0 ? <ListLoadingFooter loading label={t('profile.feed.loadingMore')} /> : null}

                                    {hasMorePosts && !postsLoading ? (
                                        <Button type="button" className="justify-self-start" data-testid="profile-load-more-posts" onClick={() => void onLoadMorePosts()}>
                                            {t('profile.feed.loadMore')}
                                        </Button>
                                    ) : null}
                            </section>
                        </TabsContent>

                        <TabsContent value="followers" className="nostr-profile-tab-panel">
                            <section className="nostr-profile-network-tab">
                                    {networkLoading && followers.length === 0 ? (
                                        <Empty className="nostr-profile-network-empty">
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <Spinner />
                                                </EmptyMedia>
                                                <EmptyTitle>{t('profile.followers.loadingTitle')}</EmptyTitle>
                                                <EmptyDescription>{t('profile.followers.loadingDescription', { displayName })}</EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    ) : (followersError || networkError) && followers.length === 0 ? (
                                        renderNetworkErrorState()
                                    ) : (
                                        <>
                                            {followers.length === 0 ? (
                                                <div className="nostr-profile-network-empty-state">
                                                    <Empty className="nostr-profile-network-empty">
                                                        <EmptyHeader>
                                                            <EmptyTitle>{t('profile.followers.empty')}</EmptyTitle>
                                                        </EmptyHeader>
                                                    </Empty>
                                                </div>
                                            ) : null}
                                            {followers.length > 0 ? (
                                                <ItemGroup className="nostr-profile-network-list">
                                                    {visibleFollowers.map((followerPubkey) => (
                                                        <div key={followerPubkey} className="nostr-profile-network-item-wrap">
                                                            {renderNetworkPersonItem(followerPubkey)}
                                                        </div>
                                                    ))}
                                                </ItemGroup>
                                            ) : null}
                                            {(followersError || networkError) && followers.length > 0 ? renderNetworkErrorState() : null}
                                            <ListLoadingFooter loading={followersLoadingMore} />
                                        </>
                                    )}
                            </section>
                        </TabsContent>

                        <TabsContent value="following" className="nostr-profile-tab-panel">
                            <section className="nostr-profile-network-tab">
                                    {networkLoading && follows.length === 0 ? (
                                        <Empty className="nostr-profile-network-empty">
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <Spinner />
                                                </EmptyMedia>
                                                <EmptyTitle>{t('profile.following.loadingTitle')}</EmptyTitle>
                                                <EmptyDescription>{t('profile.following.loadingDescription', { displayName })}</EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    ) : networkError && follows.length === 0 ? (
                                        renderNetworkErrorState()
                                    ) : (
                                        <>
                                            {follows.length === 0 ? (
                                                <div className="nostr-profile-network-empty-state">
                                                    <Empty className="nostr-profile-network-empty">
                                                        <EmptyHeader>
                                                            <EmptyTitle>{t('profile.following.empty')}</EmptyTitle>
                                                        </EmptyHeader>
                                                    </Empty>
                                                </div>
                                            ) : null}
                                            {follows.length > 0 ? (
                                                <ItemGroup className="nostr-profile-network-list">
                                                    {visibleFollows.map((followPubkey) => (
                                                        <div key={followPubkey} className="nostr-profile-network-item-wrap">
                                                            {renderNetworkPersonItem(followPubkey)}
                                                        </div>
                                                    ))}
                                                </ItemGroup>
                                            ) : null}
                                            {networkError && follows.length > 0 ? renderNetworkErrorState() : null}
                                            <ListLoadingFooter loading={followsLoadingMore} />
                                        </>
                                    )}
                            </section>
                        </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
