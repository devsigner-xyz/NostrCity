import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type UIEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EllipsisVerticalIcon, SearchIcon, XIcon } from 'lucide-react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { profileHasZapEndpoint } from '../../nostr/zaps';
import { ListLoadingFooter } from './ListLoadingFooter';
import { PersonContextMenuItems } from './PersonContextMenuItems';
import { VerifiedUserAvatar } from './VerifiedUserAvatar';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { cn } from '@/lib/utils';

const VIRTUALIZATION_THRESHOLD = 120;
const VIRTUAL_ROW_HEIGHT_PX = 68;
const LOAD_MORE_PAGE_SIZE = 20;
const LOAD_MORE_DELAY_MS = 120;

interface PeopleListTabProps {
    people: string[];
    profiles: Record<string, NostrProfile>;
    emptyText: string;
    loadingText?: string;
    loading: boolean;
    selectedPubkey?: string;
    onSelectPerson?: (pubkey: string) => void;
    onLocatePerson?: (pubkey: string) => void;
    onCopyNpub?: (value: string) => void | Promise<void>;
    onSendMessage?: (pubkey: string) => void | Promise<void>;
    onViewDetails?: (pubkey: string) => void;
    zapAmounts?: number[];
    onZapPerson?: (pubkey: string, amount: number) => void | Promise<void>;
    onConfigureZapAmounts?: () => void;
    searchQuery?: string;
    onSearchQueryChange?: (value: string) => void;
    searchAriaLabel?: string;
    verificationByPubkey?: Record<string, Nip05ValidationResult | undefined>;
    followedPubkeys?: string[];
    followHiddenPubkeys?: string[];
    onFollowPerson?: (pubkey: string) => void | Promise<void>;
    followActionPlacement?: 'inline' | 'context';
    followCopyScope?: 'peopleList' | 'userSearch';
    identifierDisplay?: 'short' | 'full';
}

function personName(pubkey: string, profile: NostrProfile | undefined): string {
    if (profile?.displayName) {
        return profile.displayName;
    }

    if (profile?.name) {
        return profile.name;
    }

    return `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

function personInitials(pubkey: string, profile: NostrProfile | undefined): string {
    const name = personName(pubkey, profile).trim();
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

export function PeopleListTab({
    people,
    profiles,
    emptyText,
    loadingText,
    loading,
    selectedPubkey,
    onSelectPerson,
    onLocatePerson,
    onCopyNpub,
    onSendMessage,
    onViewDetails,
    zapAmounts = [21, 128, 256],
    onZapPerson,
    onConfigureZapAmounts,
    searchQuery,
    onSearchQueryChange,
    searchAriaLabel,
    verificationByPubkey = {},
    followedPubkeys = [],
    followHiddenPubkeys = [],
    onFollowPerson,
    followActionPlacement = 'inline',
    followCopyScope = 'peopleList',
    identifierDisplay = 'short',
}: PeopleListTabProps) {
    const { t } = useI18n();
    const hasSearch = typeof onSearchQueryChange === 'function';
    const hasSearchQuery = (searchQuery || '').trim().length > 0;
    const shouldVirtualize = people.length >= VIRTUALIZATION_THRESHOLD;
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const loadMoreTimerRef = useRef<number | null>(null);
    const [visibleCount, setVisibleCount] = useState(() => Math.min(LOAD_MORE_PAGE_SIZE, people.length));
    const [loadingMore, setLoadingMore] = useState(false);
    const [pendingFollowByPubkey, setPendingFollowByPubkey] = useState<Record<string, boolean>>({});
    const followedSet = useMemo(() => new Set(followedPubkeys), [followedPubkeys]);
    const followHiddenSet = useMemo(() => new Set(followHiddenPubkeys), [followHiddenPubkeys]);

    useEffect(() => {
        setVisibleCount(Math.min(LOAD_MORE_PAGE_SIZE, people.length));
        setLoadingMore(false);
        setPendingFollowByPubkey({});
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
        if (loadMoreTimerRef.current !== null) {
            window.clearTimeout(loadMoreTimerRef.current);
            loadMoreTimerRef.current = null;
        }
    }, [people]);

    useEffect(() => {
        return () => {
            if (loadMoreTimerRef.current !== null) {
                window.clearTimeout(loadMoreTimerRef.current);
            }
        };
    }, []);

    const visiblePeople = people.slice(0, visibleCount);
    const hasMorePeople = visibleCount < people.length;

    const scheduleLoadMore = () => {
        if (loadingMore || !hasMorePeople) {
            return;
        }

        setLoadingMore(true);
        loadMoreTimerRef.current = window.setTimeout(() => {
            setVisibleCount((current) => Math.min(current + LOAD_MORE_PAGE_SIZE, people.length));
            setLoadingMore(false);
            loadMoreTimerRef.current = null;
        }, LOAD_MORE_DELAY_MS);
    };

    const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
        const target = event.currentTarget;
        const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 24;
        if (nearBottom) {
            scheduleLoadMore();
        }
    };

    const openActionsMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
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

    const followPerson = (pubkey: string): void => {
        if (typeof onFollowPerson !== 'function') {
            return;
        }

        setPendingFollowByPubkey((current) => ({
            ...current,
            [pubkey]: true,
        }));

        void Promise.resolve(onFollowPerson(pubkey))
            .catch((): void => undefined)
            .finally((): void => {
                setPendingFollowByPubkey((current) => {
                    if (!current[pubkey]) {
                        return current;
                    }

                    const next = { ...current };
                    delete next[pubkey];
                    return next;
                });
            });
    };

    const rowVirtualizer = useVirtualizer({
        count: visiblePeople.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => VIRTUAL_ROW_HEIGHT_PX,
        overscan: 8,
        initialRect: {
            width: 320,
            height: 420,
        },
    });
    const virtualItems = rowVirtualizer.getVirtualItems();
    const renderedVirtualItems = virtualItems.length > 0
        ? virtualItems.map((item) => ({
            key: `item-${item.key}`,
            index: item.index,
            start: item.start,
            measurable: true,
        }))
        : Array.from({ length: Math.min(24, visiblePeople.length) }, (_, index) => ({
            key: `fallback-${index}`,
            index,
            start: index * VIRTUAL_ROW_HEIGHT_PX,
            measurable: false,
        }));
    const totalVirtualHeight = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize()
        : visiblePeople.length * VIRTUAL_ROW_HEIGHT_PX;

    const renderPersonItem = (pubkey: string) => {
        const profile = profiles[pubkey];
        const active = selectedPubkey === pubkey;
        const selectable = typeof onSelectPerson === 'function';
        const canLocate = typeof onLocatePerson === 'function';
        const canCopy = typeof onCopyNpub === 'function';
        const canSendMessage = typeof onSendMessage === 'function';
        const canViewDetails = typeof onViewDetails === 'function';
        const canFollow = typeof onFollowPerson === 'function' && !followHiddenSet.has(pubkey);
        const hasActions = true;
        const display = personName(pubkey, profile);
        const canZapProfile = profileHasZapEndpoint(profile);
        const npub = pubkeyToNpub(pubkey);
        const npubLabel = identifierDisplay === 'full'
            ? npub
            : npub.startsWith('npub1') ? truncateIdentifier(npub) : `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
        const verification = verificationByPubkey[pubkey];
        const isFollowPending = Object.prototype.hasOwnProperty.call(pendingFollowByPubkey, pubkey);
        const isFollowed = isFollowPending ? true : followedSet.has(pubkey);
        const followDisabled = isFollowPending;
        const followLabel = isFollowed
            ? t(followCopyScope === 'userSearch' ? 'userSearch.following' : 'peopleList.following')
            : t(followCopyScope === 'userSearch' ? 'userSearch.follow' : 'peopleList.follow');
        const followAriaLabel = isFollowPending
            ? t(followCopyScope === 'userSearch' ? 'userSearch.followUpdating' : 'peopleList.followUpdating', { displayName: display })
            : isFollowed
                ? t(followCopyScope === 'userSearch' ? 'userSearch.unfollow' : 'peopleList.unfollow', { displayName: display })
                : t(followCopyScope === 'userSearch' ? 'userSearch.followUser' : 'peopleList.followPerson', { displayName: display });
        const contextMenuActionProps = {
            ...(canLocate ? { onLocateOnMap: () => onLocatePerson?.(pubkey) } : {}),
            ...(canCopy ? { onCopyNpub: () => onCopyNpub?.(pubkeyToNpub(pubkey)) } : {}),
            ...(canSendMessage ? { onSendMessage: () => onSendMessage?.(pubkey) } : {}),
            ...(canViewDetails ? { onViewDetails: () => onViewDetails?.(pubkey) } : {}),
        };
        const showInlineFollowAction = canFollow && followActionPlacement === 'inline';
        const showContextUnfollowAction = canFollow && followActionPlacement === 'context' && isFollowed;

        return (
            <Item
                variant="outline"
                size="sm"
                data-active={active ? 'true' : 'false'}
                className={cn(
                    'gap-2 border-border/80 bg-card/90 text-card-foreground shadow-none transition-colors',
                    'hover:bg-muted/70 data-[active=true]:bg-muted',
                    selectable && 'cursor-pointer',
                )}
            >
                {selectable ? (
                    <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        aria-pressed={active}
                        onClick={() => onSelectPerson?.(pubkey)}
                    >
                        <ItemMedia>
                            <VerifiedUserAvatar
                                picture={profile?.picture}
                                imageAlt={display}
                                fallback={personInitials(pubkey, profile)}
                                nip05={profile?.nip05}
                                verification={verification}
                            />
                        </ItemMedia>
                        <ItemContent className="min-w-0">
                            <ItemTitle className="nostr-identity-row">
                                <span className="truncate">{display}</span>
                            </ItemTitle>
                            <ItemDescription className="truncate">{npubLabel}</ItemDescription>
                        </ItemContent>
                    </button>
                ) : (
                    <>
                        <ItemMedia>
                            <VerifiedUserAvatar
                                picture={profile?.picture}
                                imageAlt={display}
                                fallback={personInitials(pubkey, profile)}
                                nip05={profile?.nip05}
                                verification={verification}
                            />
                        </ItemMedia>
                        <ItemContent className="min-w-0">
                            <ItemTitle className="nostr-identity-row">
                                <span className="truncate">{display}</span>
                            </ItemTitle>
                            <ItemDescription className="truncate">{npubLabel}</ItemDescription>
                        </ItemContent>
                    </>
                )}

                {showInlineFollowAction ? (
                    <Button
                        type="button"
                        variant={isFollowed ? 'secondary' : 'outline'}
                        size="xs"
                        className="shrink-0"
                        disabled={followDisabled}
                        aria-label={followAriaLabel}
                        onClick={() => followPerson(pubkey)}
                    >
                        {followLabel}
                    </Button>
                ) : null}

                {hasActions ? (
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                aria-label={t('peopleList.openActions', { displayName: display })}
                                data-testid={`person-actions-${pubkey}`}
                                onClick={openActionsMenu}
                            >
                                <EllipsisVerticalIcon data-icon="inline-start" />
                            </Button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                            <ContextMenuGroup>
                                <PersonContextMenuItems {...contextMenuActionProps} />
                                {showContextUnfollowAction ? (
                                    <ContextMenuItem
                                        disabled={followDisabled}
                                        onSelect={() => followPerson(pubkey)}
                                    >
                                        {t(followCopyScope === 'userSearch' ? 'userSearch.unfollow' : 'peopleList.unfollow', { displayName: display })}
                                    </ContextMenuItem>
                                ) : null}
                            </ContextMenuGroup>
                            <ContextMenuSeparator />
                            {canZapProfile ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger>Zap</ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-44">
                                        {zapAmounts.map((amount) => (
                                            <ContextMenuItem
                                                key={`person-zap-${pubkey}-${amount}`}
                                                onSelect={() => {
                                                    void onZapPerson?.(pubkey, amount);
                                                }}
                                            >
                                                {t('zaps.amountSats', { amount: String(amount) })}
                                            </ContextMenuItem>
                                        ))}
                                        <ContextMenuSeparator />
                                        <ContextMenuItem {...(onConfigureZapAmounts ? { onSelect: onConfigureZapAmounts } : {})}>
                                            {t('peopleList.configureZapAmounts')}
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            ) : null}
                        </ContextMenuContent>
                    </ContextMenu>
                ) : null}
            </Item>
        );
    };

    const listContent = people.length === 0
        ? (
            <div className="nostr-people-scroll-area nostr-people-scroll-empty">
                <Empty className="nostr-people-empty">
                    <EmptyHeader>
                        <EmptyTitle>{loading && loadingText ? loadingText : t('peopleList.emptyResults')}</EmptyTitle>
                        <EmptyDescription>{loading && loadingText ? t('peopleList.loadingMorePeople') : emptyText}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </div>
        )
        : shouldVirtualize ? (
            <div
                ref={scrollContainerRef}
                className="nostr-people-scroll-area nostr-people-scroll-virtual"
                data-virtualized="true"
                onScroll={handleScroll}
            >
                <div
                    className="nostr-people-virtual-inner"
                    style={{
                        height: `${totalVirtualHeight}px`,
                    }}
                >
                    {renderedVirtualItems.map((virtualItem) => {
                        const pubkey = visiblePeople[virtualItem.index];
                        if (!pubkey) {
                            return null;
                        }

                        return (
                            <div
                                key={virtualItem.key}
                                ref={virtualItem.measurable ? rowVirtualizer.measureElement : undefined}
                                data-index={virtualItem.index}
                                className="nostr-people-virtual-row"
                                style={{
                                    transform: `translateY(${virtualItem.start}px)`,
                                }}
                            >
                                {renderPersonItem(pubkey)}
                            </div>
                        );
                    })}
                </div>
                <ListLoadingFooter loading={loadingMore} />
            </div>
        ) : (
            <div className="nostr-people-scroll-area" onScroll={handleScroll}>
                <ItemGroup className="nostr-people-list">
                    {visiblePeople.map((pubkey) => (
                        <div key={pubkey} className="nostr-people-item-wrap">
                            {renderPersonItem(pubkey)}
                        </div>
                    ))}
                </ItemGroup>
                <ListLoadingFooter loading={loadingMore} />
            </div>
        );

    if (!hasSearch) {
        return listContent;
    }

    return (
        <div className="nostr-people-tab-content">
            <div className="w-full flex-none" data-testid="people-search-row">
                <InputGroup>
                    <InputGroupAddon align="inline-start" aria-hidden="true">
                        <SearchIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                        type="text"
                        value={searchQuery || ''}
                        placeholder={t('peopleList.searchPlaceholder')}
                        aria-label={searchAriaLabel || t('peopleList.searchAria')}
                        onChange={(event) => onSearchQueryChange?.(event.target.value)}
                    />
                    <InputGroupAddon align="inline-end">
                        <InputGroupButton
                            size="icon-xs"
                            aria-label={t('peopleList.clearSearch')}
                            disabled={!hasSearchQuery}
                            onClick={() => onSearchQueryChange?.('')}
                        >
                            <XIcon />
                        </InputGroupButton>
                    </InputGroupAddon>
                </InputGroup>
            </div>

            {listContent}
        </div>
    );
}
