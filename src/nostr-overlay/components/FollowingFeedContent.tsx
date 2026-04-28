import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CopyIcon, ImageIcon } from 'lucide-react';
import type { AgoraFeedLayout } from '../../nostr/ui-settings';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import type { SocialEngagementMetrics, SocialFeedItem, ViewerReactionByEventId } from '../../nostr/social-feed-service';
import type { SearchUsersResult } from '../query/user-search.query';
import { createMentionDraft, type MentionDraft } from '../mention-serialization';
import { MentionTextarea } from './MentionTextarea';
import type { FollowingFeedThreadView } from '../query/following-feed.selectors';
import { fromEmbeddedRepost, fromFeedItem, fromThreadItem } from './note-card-adapters';
import type { NoteCardModel } from './note-card-model';
import { withoutNoteActions } from './note-card-model';
import {
    buildFeedActionState,
    buildReplyActionState,
    buildRootActionState,
} from './following-feed-note-card-mappers';
import { ListLoadingFooter } from './ListLoadingFooter';
import { NoteCard } from './NoteCard';
import { OverlayPageHeader } from './OverlayPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useI18n } from '@/i18n/useI18n';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

function buildThreadReplyTree(replies: FollowingFeedThreadView['replies']) {
    const childrenByParentId = new Map<string, FollowingFeedThreadView['replies']>();

    for (const reply of replies) {
        const parentId = reply.targetEventId;
        if (!parentId) {
            continue;
        }

        const siblings = childrenByParentId.get(parentId) ?? [];
        siblings.push(reply);
        childrenByParentId.set(parentId, siblings);
    }

    return childrenByParentId;
}

const MAX_THREAD_VISUAL_DEPTH = 4;

function getVisualThreadDepth(depth: number): number {
    return Math.min(depth, MAX_THREAD_VISUAL_DEPTH);
}

export interface FollowingFeedViewProps {
    items: SocialFeedItem[];
    pendingNewCount: number;
    hasPendingNewItems: boolean;
    hasFollows: boolean;
    profilesByPubkey: Record<string, NostrProfile>;
    engagementByEventId: Record<string, SocialEngagementMetrics>;
    isLoadingFeed: boolean;
    isRefreshingFeed: boolean;
    feedError: string | null;
    hasMoreFeed: boolean;
    activeThread: FollowingFeedThreadView | null;
    canWrite: boolean;
    isPublishingPost: boolean;
    isPublishingReply: boolean;
    publishError: string | null;
    reactionByEventId: Record<string, boolean>;
    viewerReactionByEventId?: ViewerReactionByEventId;
    repostByEventId: Record<string, boolean>;
    pendingReactionByEventId: Record<string, boolean>;
    pendingRepostByEventId: Record<string, boolean>;
    onLoadMoreFeed: () => Promise<void> | void;
    onApplyPendingNewItems: () => Promise<void> | void;
    onRefreshFeed: () => Promise<void> | void;
    onOpenThread: (rootEventId: string) => Promise<void> | void;
    onCloseThread: () => void;
    onLoadMoreThread: () => Promise<void> | void;
    onPublishPost: (content: string) => Promise<boolean>;
    onPublishReply: (input: {
        targetEventId: string;
        targetPubkey?: string;
        rootEventId?: string;
        content: MentionDraft;
    }) => Promise<boolean>;
    onSearchUsers: (query: string) => Promise<SearchUsersResult>;
    ownerPubkey?: string | undefined;
    searchRelaySetKey?: string | undefined;
    onToggleReaction: (input: { eventId: string; targetPubkey?: string; emoji?: string }) => Promise<boolean>;
    onToggleRepost: (input: { eventId: string; targetPubkey?: string; repostContent?: string }) => Promise<boolean>;
    onOpenQuoteComposer: (note: NoteCardModel) => void;
    onZap: (input: { eventId: string; eventKind?: number; targetPubkey?: string; amount: number }) => Promise<void> | void;
    zapAmounts: number[];
    onConfigureZapAmounts?: () => void;
    onSelectHashtag?: (hashtag: string) => void;
    onSelectProfile?: (pubkey: string) => void;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onSelectEventReference?: (eventId: string) => void;
    onResolveEventReferences?: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
    eventReferencesById?: Record<string, NostrEvent>;
    onCopyNoteId?: (noteId: string) => void;
}

interface FollowingFeedContentProps extends FollowingFeedViewProps {
    agoraFeedLayout?: AgoraFeedLayout;
    className?: string;
    headerActions?: ReactNode;
    headerSubtitle?: string;
    activeHashtag?: string;
}

interface ParsedEmbeddedRepost {
    id: string;
    pubkey: string;
    createdAt: number;
    kind: number;
    content: string;
    tags: string[][];
    sig?: string;
}

function parseEmbeddedRepostEvent(content: string): ParsedEmbeddedRepost | null {
    const normalized = content.trim();
    if (!normalized.startsWith('{')) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(normalized);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const eventRecord = parsed as Record<string, unknown>;
        if (
            typeof eventRecord.id !== 'string'
            || typeof eventRecord.pubkey !== 'string'
            || !Number.isFinite(eventRecord.created_at)
            || !Number.isFinite(eventRecord.kind)
            || typeof eventRecord.content !== 'string'
        ) {
            return null;
        }

        return {
            id: eventRecord.id,
            pubkey: eventRecord.pubkey,
            createdAt: Number(eventRecord.created_at),
            kind: Number(eventRecord.kind),
            content: eventRecord.content,
            tags: Array.isArray(eventRecord.tags)
                ? eventRecord.tags
                    .filter((tag): tag is string[] => Array.isArray(tag) && tag.every((entry) => typeof entry === 'string'))
                : [],
            ...(typeof eventRecord.sig === 'string' ? { sig: eventRecord.sig } : {}),
        };
    } catch {
        return null;
    }
}

function shouldLoadMore(container: HTMLDivElement): boolean {
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom < 80;
}

export function FollowingFeedContent({
    className,
    agoraFeedLayout = 'list',
    headerActions,
    headerSubtitle,
    activeHashtag,
    items,
    hasFollows,
    profilesByPubkey,
    engagementByEventId,
    isLoadingFeed,
    feedError,
    hasMoreFeed,
    activeThread,
    canWrite,
    isPublishingPost: _isPublishingPost,
    isPublishingReply,
    publishError,
    reactionByEventId,
    viewerReactionByEventId = {},
    repostByEventId,
    pendingReactionByEventId,
    pendingRepostByEventId,
    onLoadMoreFeed,
    onOpenThread,
    onCloseThread,
    onLoadMoreThread,
    onPublishPost: _onPublishPost,
    onPublishReply,
    onSearchUsers,
    ownerPubkey,
    searchRelaySetKey,
    onToggleReaction,
    onToggleRepost,
    onOpenQuoteComposer,
    onZap,
    zapAmounts,
    onConfigureZapAmounts,
    onSelectHashtag,
    onSelectProfile,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
    eventReferencesById,
    onCopyNoteId,
}: FollowingFeedContentProps) {
    const { t } = useI18n();
    const [replyDraft, setReplyDraft] = useState<MentionDraft>(createMentionDraft(''));
    const [replyTargetEventId, setReplyTargetEventId] = useState<string | null>(null);
    const [replyTargetPubkey, setReplyTargetPubkey] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!activeThread) {
            setReplyDraft(createMentionDraft(''));
            setReplyTargetEventId(null);
            setReplyTargetPubkey(undefined);
            return;
        }

        if (!replyTargetEventId && activeThread.root) {
            setReplyTargetEventId(activeThread.root.id);
            setReplyTargetPubkey(activeThread.root.pubkey);
        }
    }, [activeThread, replyTargetEventId]);

    const onFeedScroll = (container: HTMLDivElement | null): void => {
        if (!container || isLoadingFeed || !hasMoreFeed) {
            return;
        }

        if (shouldLoadMore(container)) {
            void onLoadMoreFeed();
        }
    };

    const onThreadScroll = (container: HTMLDivElement | null): void => {
        if (!container || !activeThread || activeThread.isLoadingMore || !activeThread.hasMore) {
            return;
        }

        if (shouldLoadMore(container)) {
            void onLoadMoreThread();
        }
    };

    const replyDisabled = !canWrite || isPublishingReply || !replyTargetEventId;
    const activeThreadNoteId = activeThread?.root?.id ?? activeThread?.rootEventId;
    const resolvedSubtitle = activeThread && activeThreadNoteId
        ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono text-xs">{activeThreadNoteId}</span>
                {onCopyNoteId ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label={t('note.menu.copyIdAria', { noteId: activeThreadNoteId })}
                        title={t('note.menu.copyIdAria', { noteId: activeThreadNoteId })}
                        onClick={() => onCopyNoteId(activeThreadNoteId)}
                    >
                        <CopyIcon aria-hidden="true" />
                    </Button>
                ) : null}
            </span>
        )
        : (headerSubtitle || t('feed.subtitle.following'));
    const showThreadBlockingEmpty = Boolean(activeThread && activeThread.isLoading && !activeThread.root && activeThread.replies.length === 0);
    const showThreadLoadingFooter = Boolean(activeThread && (activeThread.isLoadingMore || (activeThread.isLoading && (Boolean(activeThread.root) || activeThread.replies.length > 0))));
    const threadReplyTree = useMemo(
        () => buildThreadReplyTree(activeThread?.replies ?? []),
        [activeThread?.replies]
    );
    const visibleThreadReplies = useMemo(() => {
        if (!activeThread) {
            return [];
        }

        const threadRootId = activeThread.root?.id ?? activeThread.rootEventId;
        return threadReplyTree.get(threadRootId) ?? [];
    }, [activeThread, threadReplyTree]);
    const noteCardProps = {
        ...(onCopyNoteId ? { onCopyNoteId } : {}),
        ...(onSelectHashtag ? { onSelectHashtag } : {}),
        ...(onSelectProfile ? { onSelectProfile } : {}),
        ...(onResolveProfiles ? { onResolveProfiles } : {}),
        ...(onSelectEventReference ? { onSelectEventReference } : {}),
        ...(onResolveEventReferences ? { onResolveEventReferences } : {}),
        ...(eventReferencesById ? { eventReferencesById } : {}),
    };

    const renderThreadReplyNode = (reply: FollowingFeedThreadView['replies'][number], depth: number): ReactNode => {
        const replyNote = fromThreadItem(reply, 'reply');
        if (!replyNote) {
            return null;
        }
        delete replyNote.kindLabel;

        const visualDepth = getVisualThreadDepth(depth);

        const replyActionState = buildReplyActionState({
            item: reply,
            canWrite,
            engagementByEventId,
            reactionByEventId,
            viewerReactionByEventId,
            repostByEventId,
            pendingReactionByEventId,
            pendingRepostByEventId,
            onReply: () => {
                setReplyTargetEventId(reply.id);
                setReplyTargetPubkey(reply.pubkey);
            },
            onViewDetail: () => {
                void onOpenThread(reply.id);
            },
            onToggleReaction,
            onToggleRepost,
            onQuote: () => onOpenQuoteComposer(withoutNoteActions(replyNote)),
            onZap,
            zapAmounts,
            ...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {}),
        });
        replyNote.actions = replyActionState;

        const childReplies = threadReplyTree.get(reply.id) ?? [];

        return (
            <div key={reply.id} className="nostr-following-feed-thread-node" data-depth={depth} data-visual-depth={visualDepth}>
                <div className="nostr-following-feed-thread-row">
                    <div className="nostr-following-feed-thread-indent" aria-hidden="true">
                        {Array.from({ length: visualDepth }).map((_, index) => (
                            <span key={`${reply.id}-rail-${index + 1}`} className="nostr-following-feed-thread-rail" data-rail-index={index + 1} />
                        ))}
                    </div>
                    <div className="nostr-following-feed-thread-body">
                        <NoteCard
                            note={replyNote}
                            profilesByPubkey={profilesByPubkey}
                            {...noteCardProps}
                        />
                    </div>
                </div>
                {childReplies.length > 0 ? (
                    <div className="nostr-following-feed-thread-children">
                        {childReplies.map((childReply) => renderThreadReplyNode(childReply, depth + 1))}
                    </div>
                ) : null}
            </div>
        );
    };

    return (
        <div className={className || 'nostr-following-feed-dialog'}>
            <div className="nostr-following-feed-header">
                <OverlayPageHeader
                    className="nostr-following-feed-page-header"
                    title={activeThread ? t('feed.noteTitle') : 'Agora'}
                    description={resolvedSubtitle}
                />

                {headerActions || activeThread ? (
                    <div className="nostr-following-feed-header-actions flex items-center gap-2">
                        {headerActions}
                        {activeThread ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="nostr-following-feed-back"
                                onClick={onCloseThread}
                            >
                                {t('feed.backToAgora')}
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {!activeThread ? (
                <>
                    {feedError ? <p className="nostr-following-feed-error">{feedError}</p> : null}
                    {publishError ? <p className="nostr-following-feed-error">{publishError}</p> : null}

                    <div
                        className="nostr-following-feed-list min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
                        data-testid="following-feed-list"
                        onScroll={(event) => onFeedScroll(event.currentTarget)}
                    >
                        {items.length === 0 ? (
                            isLoadingFeed ? (
                                <Empty className="nostr-following-feed-empty">
                                    <EmptyHeader>
                                        <EmptyMedia variant="icon">
                                            <Spinner />
                                        </EmptyMedia>
                                        <EmptyTitle>{t('feed.loadingTitle')}</EmptyTitle>
                                        <EmptyDescription>{t('feed.loadingDescription')}</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            ) : !activeHashtag && !hasFollows ? (
                                <Empty className="nostr-following-feed-empty">
                                    <EmptyHeader>
                                        <EmptyTitle>{t('feed.emptyNoFollowsTitle')}</EmptyTitle>
                                        <EmptyDescription>{t('feed.emptyNoFollowsDescription')}</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            ) : (
                                <Empty className="nostr-following-feed-empty">
                                    <EmptyHeader>
                                        <EmptyTitle>{t('feed.emptyNoPostsTitle')}</EmptyTitle>
                                        <EmptyDescription>{t('feed.emptyNoPostsDescription')}</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            )
                        ) : (
                            <div
                                className={cn(
                                    'nostr-following-feed-items',
                                    agoraFeedLayout === 'masonry'
                                        ? 'nostr-following-feed-list-layout-masonry'
                                        : 'nostr-following-feed-list-layout-list'
                                )}
                            >
                                {items.map((item) => {
                                    const baseNote = fromFeedItem(item);
                                    if (!baseNote) {
                                        return null;
                                    }

                                    const embeddedRepostPayload = item.kind === 'repost' ? parseEmbeddedRepostEvent(item.content) : null;
                                    const embeddedRepostItem = embeddedRepostPayload
                                        ? {
                                            id: embeddedRepostPayload.id,
                                            pubkey: embeddedRepostPayload.pubkey,
                                            createdAt: embeddedRepostPayload.createdAt,
                                            content: embeddedRepostPayload.content,
                                            kind: embeddedRepostPayload.kind === 1 ? 'note' as const : 'repost' as const,
                                            rawEvent: {
                                                id: embeddedRepostPayload.id,
                                                pubkey: embeddedRepostPayload.pubkey,
                                            kind: embeddedRepostPayload.kind,
                                            created_at: embeddedRepostPayload.createdAt,
                                            tags: embeddedRepostPayload.tags,
                                            content: embeddedRepostPayload.content,
                                            ...(embeddedRepostPayload.sig ? { sig: embeddedRepostPayload.sig } : {}),
                                        },
                                        }
                                        : null;
                                    const embeddedRepostNote = embeddedRepostPayload
                                        ? fromEmbeddedRepost({
                                            id: embeddedRepostPayload.id,
                                            pubkey: embeddedRepostPayload.pubkey,
                                            createdAt: embeddedRepostPayload.createdAt,
                                            content: embeddedRepostPayload.content,
                                            tags: embeddedRepostPayload.tags,
                                        }, 1)
                                        : null;

                                    if (embeddedRepostItem && embeddedRepostNote) {
                                        embeddedRepostNote.actions = buildFeedActionState({
                                            item: embeddedRepostItem,
                                            canWrite,
                                            engagementByEventId,
                                            reactionByEventId,
                                            viewerReactionByEventId,
                                            repostByEventId,
                                            pendingReactionByEventId,
                                            pendingRepostByEventId,
                                            onOpenThread,
                                            onToggleReaction,
                                            onToggleRepost,
                                            onQuote: () => onOpenQuoteComposer(withoutNoteActions(embeddedRepostNote)),
                                            onZap,
                                            zapAmounts,
                                            ...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {}),
                                        });
                                    }

                                    const note = item.kind === 'repost' && embeddedRepostNote
                                        ? {
                                            ...baseNote,
                                            content: '',
                                            embedded: embeddedRepostNote,
                                        }
                                        : baseNote;

                                    note.actions = buildFeedActionState({
                                        item,
                                        canWrite,
                                        engagementByEventId,
                                        reactionByEventId,
                                        viewerReactionByEventId,
                                        repostByEventId,
                                        pendingReactionByEventId,
                                        pendingRepostByEventId,
                                        onOpenThread,
                                        onToggleReaction,
                                        onToggleRepost,
                                        onQuote: () => onOpenQuoteComposer(withoutNoteActions(note)),
                                        onZap,
                                        zapAmounts,
                                        ...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {}),
                                    });

                                    return (
                                        <div key={item.id} className="nostr-following-feed-note-shell grid gap-2">
                                            <NoteCard
                                                note={note}
                                                profilesByPubkey={profilesByPubkey}
                                                {...noteCardProps}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <ListLoadingFooter loading={isLoadingFeed && items.length > 0} label={t('feed.loadingMorePosts')} />

                    </div>
                </>
            ) : (
                <>
                    {activeThread.error ? <p className="nostr-following-feed-error">{activeThread.error}</p> : null}
                    {publishError ? <p className="nostr-following-feed-error">{publishError}</p> : null}

                    <div
                        className="nostr-following-feed-thread-list nostr-following-feed-thread-list-detail min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
                        data-testid="following-feed-thread-list"
                        onScroll={(event) => onThreadScroll(event.currentTarget)}
                    >
                        {showThreadBlockingEmpty ? (
                            <div className="nostr-following-feed-thread-empty-state flex min-h-full items-center justify-center">
                                <Empty className="nostr-following-feed-empty">
                                    <EmptyHeader>
                                        <EmptyMedia variant="icon">
                                            <Spinner />
                                        </EmptyMedia>
                                        <EmptyTitle>{t('feed.loadingThreadTitle')}</EmptyTitle>
                                        <EmptyDescription>{t('feed.loadingThreadDescription')}</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            </div>
                        ) : (
                            <>
                                {activeThread.root ? (
                                    (() => {
                                        const rootNote = fromThreadItem(activeThread.root, 'root');

                                        if (!rootNote) {
                                            return null;
                                        }

                                        rootNote.actions = buildRootActionState({
                                            item: activeThread.root,
                                            canWrite,
                                            engagementByEventId,
                                            reactionByEventId,
                                            viewerReactionByEventId,
                                            repostByEventId,
                                            pendingReactionByEventId,
                                            pendingRepostByEventId,
                                            onReply: () => {
                                                setReplyTargetEventId(activeThread.root?.id || null);
                                                setReplyTargetPubkey(activeThread.root?.pubkey);
                                            },
                                            onViewDetail: () => {
                                                void onOpenThread(activeThread.root?.id || '');
                                            },
                                            onToggleReaction,
                                            onToggleRepost,
                                            onQuote: () => onOpenQuoteComposer(withoutNoteActions(rootNote)),
                                            onZap,
                                            zapAmounts,
                                            ...(onConfigureZapAmounts ? { onConfigureZapAmounts } : {}),
                                        });
                                        delete rootNote.kindLabel;

                                        return (
                                            <div className="nostr-following-feed-thread-node" data-depth={0} data-visual-depth={0}>
                                                <div className="nostr-following-feed-thread-row">
                                                    <div className="nostr-following-feed-thread-indent" aria-hidden="true" />
                                                    <div className="nostr-following-feed-thread-body">
                                                        <NoteCard
                                                            note={rootNote}
                                                            profilesByPubkey={profilesByPubkey}
                                                            {...noteCardProps}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                ) : null}

                                <Card
                                    variant="elevated"
                                    className="nostr-following-feed-reply-box w-full shadow-none"
                                >
                                    <CardContent className="px-4 py-4">
                                        <MentionTextarea
                                            value={replyDraft}
                                            aria-label={t('feed.replyComposer')}
                                            className="nostr-following-feed-textarea"
                                            placeholder={t('feed.replyPlaceholder')}
                                            rows={3}
                                            onSearch={onSearchUsers}
                                            ownerPubkey={ownerPubkey}
                                            searchRelaySetKey={searchRelaySetKey}
                                            onChangeDraft={setReplyDraft}
                                            onChange={(event) => {
                                                event.currentTarget.style.height = '0px';
                                                event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
                                            }}
                                        />
                                        <div className="nostr-following-feed-compose-actions mt-3 flex items-center justify-between gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                aria-label={t('feed.attachImageSoon')}
                                                disabled
                                            >
                                                <ImageIcon aria-hidden="true" />
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="nostr-following-feed-publish"
                                                disabled={replyDisabled || replyDraft.text.trim().length === 0}
                                                onClick={async () => {
                                                    if (!replyTargetEventId) {
                                                        return;
                                                    }

                                                    const replyInput: Parameters<typeof onPublishReply>[0] = {
                                                        targetEventId: replyTargetEventId,
                                                        content: replyDraft,
                                                        ...(replyTargetPubkey ? { targetPubkey: replyTargetPubkey } : {}),
                                                        ...(activeThread.root?.id ? { rootEventId: activeThread.root.id } : {}),
                                                    };
                                                    const submitted = await onPublishReply(replyInput);
                                                    if (submitted) {
                                                        setReplyDraft(createMentionDraft(''));
                                                    }
                                                }}
                                            >
                                                {isPublishingReply ? t('feed.sendingReply') : t('feed.reply')}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>

                                {visibleThreadReplies.map((reply) => renderThreadReplyNode(reply, 1))}

                                {activeThread.replies.length === 0 && !activeThread.isLoading ? (
                                    <Empty className="nostr-following-feed-empty">
                                        <EmptyHeader>
                                            <EmptyTitle>{t('feed.emptyRepliesTitle')}</EmptyTitle>
                                            <EmptyDescription>{t('feed.emptyRepliesDescription')}</EmptyDescription>
                                        </EmptyHeader>
                                    </Empty>
                                ) : null}

                                <ListLoadingFooter loading={showThreadLoadingFooter} label={t('feed.loadingThreadFooter')} />
                            </>
                        )}

                    </div>

                </>
            )}
        </div>
    );
}
