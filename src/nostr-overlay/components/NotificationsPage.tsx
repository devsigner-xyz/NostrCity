import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { AtSignIcon, HeartIcon, MessageCircleIcon, Repeat2Icon, ZapIcon } from 'lucide-react';
import type { SocialNotificationItem } from '../../nostr/social-notifications-service';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import { buildNotificationInboxSections, type NotificationCategory, type NotificationInboxItem } from '../query/social-notifications-inbox';
import { fromResolvedReferenceEvent } from './note-card-adapters';
import { shortId, withoutNoteActions } from './note-card-model';
import { NoteCard } from './NoteCard';
import { OverlayPageHeader } from './OverlayPageHeader';
import { OverlayUnreadIndicator } from './OverlayUnreadIndicator';
import { OverlaySurface } from './OverlaySurface';
import { useI18n } from '@/i18n/useI18n';
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemHeader, ItemMedia, ItemTitle } from '@/components/ui/item';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { sanitizeImageUrl } from '../media/image-url-policy';

interface NotificationsPageProps {
    hasUnread: boolean;
    newNotifications: SocialNotificationItem[];
    recentNotifications: SocialNotificationItem[];
    profilesByPubkey: Record<string, NostrProfile>;
    eventReferencesById: Record<string, NostrEvent>;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onResolveEventReferences?: (eventIds: string[]) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
    onOpenThread?: (eventId: string) => Promise<void> | void;
    onOpenProfile?: (pubkey: string) => Promise<void> | void;
}

function resolveDisplayName(pubkey: string, profilesByPubkey: Record<string, NostrProfile>, fallback: string): string {
    if (!pubkey) {
        return fallback;
    }

    const profile = profilesByPubkey[pubkey];
    return profile?.displayName || profile?.name || shortId(pubkey);
}

function formatNotificationTimestamp(createdAt: number, locale: 'es' | 'en'): string {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(createdAt * 1000));
}

function notificationRowSuffix(item: NotificationInboxItem, t: ReturnType<typeof useI18n>['t']): string {
    const hasMoreActors = item.actors.length > 1;

    if (item.category === 'zap') {
        return t(hasMoreActors ? 'notifications.row.zap.groupSuffix' : 'notifications.row.zap.singleSuffix');
    }

    if (item.category === 'reaction') {
        return t(hasMoreActors ? 'notifications.row.reaction.groupSuffix' : 'notifications.row.reaction.singleSuffix', {
            reaction: item.reactionContent || '+',
        });
    }

    if (item.category === 'repost') {
        return t(hasMoreActors ? 'notifications.row.repost.groupSuffix' : 'notifications.row.repost.singleSuffix');
    }

    if (item.category === 'reply') {
        return t('notifications.row.reply.singleSuffix');
    }

    return t('notifications.row.mention.singleSuffix');
}

function notificationNotePrefix(item: NotificationInboxItem, t: ReturnType<typeof useI18n>['t']): string | null {
    const hasMoreActors = item.actors.length > 1;

    if (item.category === 'zap') {
        return t(hasMoreActors ? 'notifications.row.zap.groupNotePrefix' : 'notifications.row.zap.singleNotePrefix');
    }

    if (item.category === 'reaction') {
        return t(hasMoreActors ? 'notifications.row.reaction.groupNotePrefix' : 'notifications.row.reaction.singleNotePrefix', {
            reaction: item.reactionContent || '+',
        });
    }

    if (item.category === 'repost') {
        return t(hasMoreActors ? 'notifications.row.repost.groupNotePrefix' : 'notifications.row.repost.singleNotePrefix');
    }

    if (item.category === 'reply') {
        return t('notifications.row.reply.singleNotePrefix');
    }

    if (item.category === 'mention') {
        return t('notifications.row.mention.singleNotePrefix');
    }

    return null;
}

function notificationZapAmountSuffix(item: NotificationInboxItem, t: ReturnType<typeof useI18n>['t']): string | null {
    if (item.category !== 'zap') {
        return null;
    }

    return t('notifications.row.zap.amountSuffix', { count: String(item.zapTotalSats ?? 0) });
}

function NotificationCategoryIcon({ category, className }: { category: NotificationCategory; className?: string }) {
    if (category === 'zap') {
        return <ZapIcon className={className} aria-hidden="true" />;
    }

    if (category === 'reaction') {
        return <HeartIcon className={className} aria-hidden="true" />;
    }

    if (category === 'repost') {
        return <Repeat2Icon className={className} aria-hidden="true" />;
    }

    if (category === 'reply') {
        return <MessageCircleIcon className={className} aria-hidden="true" />;
    }

    return <AtSignIcon className={className} aria-hidden="true" />;
}

function stopNotificationRowPropagation(event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): void {
    event.stopPropagation();
}

const notificationInlineActionClassName = 'inline cursor-pointer rounded-sm bg-transparent p-0 align-baseline text-current underline-offset-4 hover:underline focus-visible:underline';
const notificationNestedInteractiveSelector = 'button, a, input, select, textarea, video, audio, [controls], [role="button"], [role="link"], [data-slot="button"], [data-slot="context-menu-item"], [data-slot="context-menu-content"]';

function isNestedInteractiveTarget(target: EventTarget | null, currentTarget: HTMLElement): boolean {
    if (!(target instanceof Element)) {
        return false;
    }

    const interactiveTarget = target.closest(notificationNestedInteractiveSelector);
    return Boolean(interactiveTarget && interactiveTarget !== currentTarget);
}

function profileInitials(pubkey: string, profile: NostrProfile | undefined, fallback: string): string {
    const label = (profile?.displayName || profile?.name || fallback).trim();
    if (!label) {
        return pubkey.slice(0, 2).toUpperCase();
    }

    const words = label.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
        return (words[0] ?? '').slice(0, 2).toUpperCase();
    }

    return `${words[0]?.[0] || ''}${words[1]?.[0] || ''}`.toUpperCase();
}

function NotificationBadgeContent({ item }: { item: NotificationInboxItem }) {
    if (item.category === 'reaction' && item.reactionContent && item.reactionContent !== '+') {
        return <span aria-hidden="true">{item.reactionContent}</span>;
    }

    return <NotificationCategoryIcon category={item.category} aria-hidden="true" />;
}

function NotificationMedia({
    item,
    profilesByPubkey,
    t,
}: {
    item: NotificationInboxItem;
    profilesByPubkey: Record<string, NostrProfile>;
    t: ReturnType<typeof useI18n>['t'];
}) {
    const isGrouped = item.actors.length > 1;
    const profile = profilesByPubkey[item.primaryActorPubkey];
    const label = resolveDisplayName(item.primaryActorPubkey, profilesByPubkey, t('notifications.actor.anonymous'));
    const safePicture = sanitizeImageUrl(profile?.picture);

    return (
        <ItemMedia>
            <Avatar size="lg">
                {!isGrouped && safePicture ? <AvatarImage src={safePicture} alt={label} /> : null}
                <AvatarFallback className="font-medium">
                    {isGrouped ? item.actors.length : profileInitials(item.primaryActorPubkey, profile, label)}
                </AvatarFallback>
                <AvatarBadge className="size-4 text-[10px] leading-none [&>svg]:size-2.5">
                    <NotificationBadgeContent item={item} />
                </AvatarBadge>
            </Avatar>
        </ItemMedia>
    );
}

function NotificationActorButton({
    pubkey,
    profilesByPubkey,
    onOpenProfile,
    t,
}: {
    pubkey: string;
    profilesByPubkey: Record<string, NostrProfile>;
    onOpenProfile?: (pubkey: string) => Promise<void> | void;
    t: ReturnType<typeof useI18n>['t'];
}) {
    const label = resolveDisplayName(pubkey, profilesByPubkey, t('notifications.actor.anonymous'));

    if (!pubkey || !onOpenProfile) {
        return <span>{label}</span>;
    }

    return (
        <button
            type="button"
            data-slot="notification-actor"
            className={notificationInlineActionClassName}
            onClick={(event) => {
                stopNotificationRowPropagation(event);
                void onOpenProfile(pubkey);
            }}
            onKeyDown={stopNotificationRowPropagation}
        >
            {label}
        </button>
    );
}

function NotificationMoreActorsMenu({
    item,
    profilesByPubkey,
    onOpenProfile,
    t,
}: {
    item: NotificationInboxItem;
    profilesByPubkey: Record<string, NostrProfile>;
    onOpenProfile?: (pubkey: string) => Promise<void> | void;
    t: ReturnType<typeof useI18n>['t'];
}) {
    const extraCount = Math.max(0, item.actors.length - 1);
    if (extraCount === 0) {
        return null;
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    data-slot="notification-more-actors"
                    className={notificationInlineActionClassName}
                    onClick={stopNotificationRowPropagation}
                    onKeyDown={stopNotificationRowPropagation}
                >
                    {t('notifications.row.more', { count: String(extraCount) })}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-0">
                <DropdownMenuLabel className="px-3 py-2">{t('notifications.people.title')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ScrollArea className="max-h-56">
                    <DropdownMenuGroup className="p-1">
                        {item.actors.map((actor) => (
                            <DropdownMenuItem
                                key={actor.key}
                                onSelect={() => {
                                    if (!actor.pubkey || !onOpenProfile) {
                                        return;
                                    }
                                    void onOpenProfile(actor.pubkey);
                                }}
                            >
                                {resolveDisplayName(actor.pubkey, profilesByPubkey, t('notifications.actor.anonymous'))}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuGroup>
                </ScrollArea>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function NotificationTitleContent({
    item,
    profilesByPubkey,
    openEventId,
    onOpenThread,
    onOpenProfile,
    t,
}: {
    item: NotificationInboxItem;
    profilesByPubkey: Record<string, NostrProfile>;
    openEventId?: string;
    onOpenThread?: (eventId: string) => Promise<void> | void;
    onOpenProfile?: (pubkey: string) => Promise<void> | void;
    t: ReturnType<typeof useI18n>['t'];
}): ReactNode {
    const extraCount = Math.max(0, item.actors.length - 1);
    const notePrefix = notificationNotePrefix(item, t);
    const zapAmountSuffix = notificationZapAmountSuffix(item, t);

    return (
        <>
            <NotificationActorButton
                pubkey={item.primaryActorPubkey}
                profilesByPubkey={profilesByPubkey}
                {...(onOpenProfile ? { onOpenProfile } : {})}
                t={t}
            />
            {' '}
            {extraCount > 0 ? (
                <>
                    <span>{t('notifications.row.and')}</span>
                    {' '}
                    <NotificationMoreActorsMenu
                        item={item}
                        profilesByPubkey={profilesByPubkey}
                        {...(onOpenProfile ? { onOpenProfile } : {})}
                        t={t}
                    />
                    {' '}
                </>
            ) : null}
            {notePrefix ? (
                <>
                    <span>{notePrefix}</span>
                    {' '}
                    {openEventId && onOpenThread ? (
                        <button
                            type="button"
                            data-slot="notification-target-note"
                            className={notificationInlineActionClassName}
                            onClick={(event) => {
                                stopNotificationRowPropagation(event);
                                void onOpenThread(openEventId);
                            }}
                            onKeyDown={stopNotificationRowPropagation}
                        >
                            {t('notifications.row.noteLabel')}
                        </button>
                    ) : (
                        <span>{t('notifications.row.noteLabel')}</span>
                    )}
                    {zapAmountSuffix ? (
                        <>
                            {' '}
                            <span>{zapAmountSuffix}</span>
                        </>
                    ) : null}
                </>
            ) : (
                <span>{notificationRowSuffix(item, t)}</span>
            )}
        </>
    );
}

function NotificationSection({
    title,
    items,
    locale,
    profilesByPubkey,
    eventReferencesById,
    unresolvedTargetIds,
    onOpenThread,
    onOpenProfile,
    t,
}: {
    title: string;
    items: NotificationInboxItem[];
    locale: 'es' | 'en';
    profilesByPubkey: Record<string, NostrProfile>;
    eventReferencesById: Record<string, NostrEvent>;
    unresolvedTargetIds: Set<string>;
    onOpenThread?: (eventId: string) => Promise<void> | void;
    onOpenProfile?: (pubkey: string) => Promise<void> | void;
    t: ReturnType<typeof useI18n>['t'];
}) {
    if (items.length === 0) {
        return null;
    }

    return (
        <section className="grid gap-2.5">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                <Badge variant="outline">{items.length}</Badge>
            </div>

            <div className="grid gap-2">
                {items.map((item) => {
                    const timestamp = formatNotificationTimestamp(item.occurredAt, locale);
                    const sourcePreviewEvent = (item.category === 'mention' || item.category === 'reply')
                        ? item.sourceItems[0]?.rawEvent
                        : undefined;
                    const targetEvent = item.targetEventId ? eventReferencesById[item.targetEventId] : undefined;
                    const detachedPreviewEvent = sourcePreviewEvent ? undefined : targetEvent;
                    const detachedPreview = detachedPreviewEvent ? fromResolvedReferenceEvent(detachedPreviewEvent) : null;
                    const openEventId = item.category === 'reply' || item.category === 'mention'
                        ? item.targetEventId || sourcePreviewEvent?.id
                        : item.targetEventId ?? targetEvent?.id;
                    const detachedPreviewOpenEventId = sourcePreviewEvent
                        ? openEventId
                        : item.targetEventId ?? targetEvent?.id;
                    const shouldShowUnavailable = !sourcePreviewEvent
                        && Boolean(item.targetEventId)
                        && !targetEvent
                        && unresolvedTargetIds.has(item.targetEventId || '');
                    const hasSecondaryContent = Boolean(detachedPreview) || shouldShowUnavailable;
                    const shouldCenterPrimaryRow = !hasSecondaryContent || Boolean(detachedPreview);

                    const body = (
                        <>
                            <NotificationMedia item={item} profilesByPubkey={profilesByPubkey} t={t} />

                            <ItemContent className="min-w-0">
                                <ItemHeader className={`${shouldCenterPrimaryRow ? 'items-center' : 'items-start'} gap-3`}>
                                    <ItemTitle className="inline-block min-w-0 max-w-full gap-0 whitespace-normal break-words">
                                        <NotificationTitleContent
                                            item={item}
                                            profilesByPubkey={profilesByPubkey}
                                            {...(openEventId ? { openEventId } : {})}
                                            {...(onOpenThread ? { onOpenThread } : {})}
                                            {...(onOpenProfile ? { onOpenProfile } : {})}
                                            t={t}
                                        />
                                    </ItemTitle>
                                </ItemHeader>

                                <time className="text-xs text-muted-foreground" dateTime={new Date(item.occurredAt * 1000).toISOString()}>
                                    {timestamp}
                                </time>

                                {shouldShowUnavailable ? (
                                    openEventId && onOpenThread ? (
                                        <div
                                            data-slot="notification-open-target"
                                            className="mt-2 w-full cursor-pointer rounded-md text-left hover:bg-muted/40 focus-within:ring-[3px] focus-within:ring-ring/50"
                                            onClick={() => void onOpenThread(openEventId)}
                                        >
                                            <ItemDescription>{t('notifications.target.unavailable')}</ItemDescription>
                                        </div>
                                    ) : (
                                        <ItemDescription>{t('notifications.target.unavailable')}</ItemDescription>
                                    )
                                ) : null}
                            </ItemContent>

                            {detachedPreview ? (
                                detachedPreviewOpenEventId && onOpenThread ? (
                                    <div
                                        data-slot="notification-open-target"
                                        className="basis-full cursor-pointer rounded-md text-left hover:bg-muted/40 focus-within:ring-[3px] focus-within:ring-ring/50"
                                        onClick={(event) => {
                                            if (isNestedInteractiveTarget(event.target, event.currentTarget)) {
                                                return;
                                            }

                                            void onOpenThread(detachedPreviewOpenEventId);
                                        }}
                                    >
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="sr-only focus:not-sr-only focus:mb-2"
                                            onClick={() => void onOpenThread(detachedPreviewOpenEventId)}
                                        >
                                            {t('notifications.preview.openNote')}
                                        </Button>
                                        <NoteCard
                                            note={withoutNoteActions(detachedPreview)}
                                            profilesByPubkey={profilesByPubkey}
                                        />
                                    </div>
                                ) : (
                                    <div className="basis-full">
                                        <NoteCard
                                            note={withoutNoteActions(detachedPreview)}
                                            profilesByPubkey={profilesByPubkey}
                                        />
                                    </div>
                                )
                            ) : null}
                        </>
                    );

                    return (
                        <Item key={item.groupKey} variant="outline" size="sm" className={shouldCenterPrimaryRow ? 'items-center' : 'items-start'}>
                            {body}
                        </Item>
                    );
                })}
            </div>
        </section>
    );
}

export function NotificationsPage({
    hasUnread,
    newNotifications,
    recentNotifications,
    profilesByPubkey,
    eventReferencesById,
    onResolveProfiles,
    onResolveEventReferences,
    onOpenThread,
    onOpenProfile,
}: NotificationsPageProps) {
    const { t, locale } = useI18n();
    const requestedProfilesRef = useRef(new Set<string>());
    const requestedEventsRef = useRef(new Set<string>());
    const [attemptedTargetEventIds, setAttemptedTargetEventIds] = useState<string[]>([]);

    const sections = useMemo(() => buildNotificationInboxSections({
        newNotifications,
        recentNotifications,
    }), [newNotifications, recentNotifications]);

    useEffect(() => {
        requestedProfilesRef.current.clear();
        requestedEventsRef.current.clear();
        setAttemptedTargetEventIds([]);
    }, [sections]);

    useEffect(() => {
        if (typeof onResolveProfiles !== 'function') {
            return;
        }

        const missingPubkeys = [...sections.newItems, ...sections.recentItems]
            .flatMap((item) => item.actors.map((actor) => actor.pubkey))
            .filter((pubkey) => pubkey.length > 0)
            .filter((pubkey, index, collection) => collection.indexOf(pubkey) === index)
            .filter((pubkey) => !profilesByPubkey[pubkey] && !requestedProfilesRef.current.has(pubkey));

        if (missingPubkeys.length === 0) {
            return;
        }

        missingPubkeys.forEach((pubkey) => {
            requestedProfilesRef.current.add(pubkey);
        });
        void onResolveProfiles(missingPubkeys);
    }, [onResolveProfiles, profilesByPubkey, sections]);

    useEffect(() => {
        if (typeof onResolveEventReferences !== 'function') {
            return;
        }

        const missingEventIds = [...sections.newItems, ...sections.recentItems]
            .filter((item) => item.category !== 'mention' && item.category !== 'reply')
            .map((item) => item.targetEventId)
            .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.length > 0)
            .filter((eventId, index, collection) => collection.indexOf(eventId) === index)
            .filter((eventId) => !eventReferencesById[eventId] && !requestedEventsRef.current.has(eventId));

        if (missingEventIds.length === 0) {
            return;
        }

        missingEventIds.forEach((eventId) => {
            requestedEventsRef.current.add(eventId);
        });

        void Promise.resolve(onResolveEventReferences(missingEventIds)).finally(() => {
            setAttemptedTargetEventIds((current) => {
                const next = new Set(current);
                missingEventIds.forEach((eventId) => {
                    next.add(eventId);
                });
                return [...next];
            });
        });
    }, [eventReferencesById, onResolveEventReferences, sections]);

    const unresolvedTargetIds = useMemo(() => {
        return new Set(
            [...sections.newItems, ...sections.recentItems]
                .map((item) => item.targetEventId)
                .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.length > 0)
                .filter((eventId) => !eventReferencesById[eventId] && (attemptedTargetEventIds.includes(eventId) || typeof onResolveEventReferences !== 'function'))
        );
    }, [attemptedTargetEventIds, eventReferencesById, onResolveEventReferences, sections]);

    const isEmpty = sections.newItems.length === 0 && sections.recentItems.length === 0;

    return (
        <OverlaySurface ariaLabel={t('notifications.title')}>
            <div className="nostr-notifications-page nostr-routed-surface-panel nostr-page-layout flex min-h-0 flex-1 flex-col gap-3">
                <OverlayPageHeader
                    title={t('notifications.title')}
                    description={t('notifications.description')}
                    indicator={hasUnread ? <OverlayUnreadIndicator className="nostr-notifications-unread-dot" srLabel={t('notifications.unread')} /> : null}
                />

                {isEmpty ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center">
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>{t('notifications.empty.title')}</EmptyTitle>
                                <EmptyDescription>{t('notifications.empty.description')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
                        <NotificationSection
                            title={t('notifications.section.new')}
                            items={sections.newItems}
                            locale={locale}
                            profilesByPubkey={profilesByPubkey}
                            eventReferencesById={eventReferencesById}
                            unresolvedTargetIds={unresolvedTargetIds}
                            {...(onOpenThread ? { onOpenThread } : {})}
                            {...(onOpenProfile ? { onOpenProfile } : {})}
                            t={t}
                        />
                        {sections.newItems.length > 0 && sections.recentItems.length > 0 ? <Separator /> : null}
                        <NotificationSection
                            title={t('notifications.section.recent')}
                            items={sections.recentItems}
                            locale={locale}
                            profilesByPubkey={profilesByPubkey}
                            eventReferencesById={eventReferencesById}
                            unresolvedTargetIds={unresolvedTargetIds}
                            {...(onOpenThread ? { onOpenThread } : {})}
                            {...(onOpenProfile ? { onOpenProfile } : {})}
                            t={t}
                        />
                    </div>
                )}
            </div>
        </OverlaySurface>
    );
}
