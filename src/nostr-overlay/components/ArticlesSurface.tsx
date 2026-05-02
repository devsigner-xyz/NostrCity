import type { SocialFeedItem } from '../../nostr/social-feed-service';
import type { NostrProfile } from '../../nostr/types';
import type { AgoraFeedLayout } from '../../nostr/ui-settings';
import { parseArticleMetadata } from '../../nostr/articles';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { OverlaySurface } from './OverlaySurface';
import { OverlayPageHeader } from './OverlayPageHeader';
import { ArticlePreviewCard } from './ArticlePreviewCard';
import { ListLoadingFooter } from './ListLoadingFooter';
import { cn } from '@/lib/utils';

interface ArticlesSurfaceProps {
    items: SocialFeedItem[];
    profilesByPubkey: Record<string, NostrProfile>;
    isLoading: boolean;
    isRefreshing: boolean;
    isLoadingMore: boolean;
    error: string | null;
    hasMore: boolean;
    activeHashtags?: string[];
    agoraFeedLayout?: AgoraFeedLayout;
    isMobile?: boolean;
    onAgoraFeedLayoutChange?: (layout: AgoraFeedLayout) => void;
    onRefresh: () => Promise<void> | void;
    onLoadMore: () => Promise<void> | void;
    onOpenArticle: (eventId: string) => void;
    onSelectedHashtagsChange?: (hashtags: string[]) => void;
    onClearHashtag?: () => void;
}

const AGORA_LAYOUT_TOGGLE_ITEM_CLASS = 'data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground! data-[state=on]:hover:bg-primary/90!';

function profileLabel(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName?.trim() || profile?.name?.trim() || `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

function shouldLoadMore(container: HTMLDivElement): boolean {
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom < 80;
}

function topicsFromArticles(items: SocialFeedItem[]): string[] {
    return [...new Set(items.flatMap((item) => parseArticleMetadata(item.rawEvent).topics))]
        .sort((left, right) => left.localeCompare(right));
}

export function ArticlesSurface({
    items,
    profilesByPubkey,
    isLoading,
    isRefreshing,
    isLoadingMore,
    error,
    hasMore,
    activeHashtags = [],
    agoraFeedLayout = 'list',
    isMobile = false,
    onAgoraFeedLayoutChange,
    onRefresh,
    onLoadMore,
    onOpenArticle,
    onSelectedHashtagsChange,
    onClearHashtag,
}: ArticlesSurfaceProps) {
    const { t } = useI18n();
    const topics = topicsFromArticles(items);
    const selectedTopics = [...new Set(activeHashtags)].sort((left, right) => left.localeCompare(right));
    const hasSelectedTopics = selectedTopics.length > 0;

    const selectTopics = (select: HTMLSelectElement): void => {
        if (!onSelectedHashtagsChange) {
            return;
        }

        onSelectedHashtagsChange(Array.from(select.selectedOptions)
            .map((option) => option.value)
            .sort((left, right) => left.localeCompare(right)));
    };

    const onScroll = (container: HTMLDivElement | null): void => {
        if (!container || isLoading || isRefreshing || isLoadingMore || !hasMore) {
            return;
        }

        if (shouldLoadMore(container)) {
            void onLoadMore();
        }
    };

    return (
        <OverlaySurface ariaLabel={t('articles.title')} contentClassName="gap-0">
            <div
                className="nostr-articles-page nostr-routed-surface-panel nostr-page-layout flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-3"
                data-testid="articles-scroll-area"
                onScroll={(event) => onScroll(event.currentTarget)}
            >
                <OverlayPageHeader
                    title={t('articles.title')}
                    description={hasSelectedTopics ? t('articles.subtitle.categories', { hashtags: selectedTopics.map((topic) => `#${topic}`).join(', ') }) : t('articles.subtitle')}
                    actions={(
                        <>
                            {onAgoraFeedLayoutChange ? (
                                <ToggleGroup
                                    type="single"
                                    variant="outline"
                                    size="default"
                                    value={agoraFeedLayout}
                                    className="hidden xl:flex"
                                    onValueChange={(value) => {
                                        if (value === 'list' || value === 'masonry') {
                                            onAgoraFeedLayoutChange(value);
                                        }
                                    }}
                                >
                                    <ToggleGroupItem value="list" aria-label={t('feed.viewList')} className={AGORA_LAYOUT_TOGGLE_ITEM_CLASS}>
                                        {t('settings.ui.agoraLayoutList')}
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="masonry" aria-label={t('feed.viewMasonry')} className={AGORA_LAYOUT_TOGGLE_ITEM_CLASS}>
                                        {t('settings.ui.agoraLayoutMasonry')}
                                    </ToggleGroupItem>
                                </ToggleGroup>
                            ) : null}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={isMobile ? 'sr-only focus:not-sr-only focus:absolute focus:right-3 focus:top-3 focus:z-20' : undefined}
                                disabled={isRefreshing}
                                onClick={() => { void onRefresh(); }}
                            >
                                {isRefreshing ? t('articles.refreshing') : t('articles.refresh')}
                            </Button>
                            {hasSelectedTopics && onClearHashtag ? (
                                <Button type="button" variant="outline" size="sm" onClick={onClearHashtag}>
                                    {t('articles.clearFilter')}
                                </Button>
                            ) : null}
                        </>
                    )}
                />

                {topics.length > 0 && onSelectedHashtagsChange ? (
                    <label className="flex max-w-[320px] flex-col gap-2 text-sm font-medium text-foreground">
                        {t('articles.categorySelectLabel')}
                        <select
                            multiple
                            size={Math.min(4, Math.max(2, topics.length))}
                            value={selectedTopics}
                            className="min-h-20 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                            data-testid="articles-category-select"
                            onChange={(event) => selectTopics(event.currentTarget)}
                        >
                            {topics.map((topic) => (
                                <option key={topic} value={topic}>{topic}</option>
                            ))}
                        </select>
                    </label>
                ) : null}

                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

                {isLoading ? (
                    <Empty className="articles-loading-state w-full max-w-[600px] self-start">
                        <EmptyHeader>
                            <Spinner />
                            <EmptyTitle>{t('articles.loadingTitle')}</EmptyTitle>
                            <EmptyDescription>{t('articles.loadingDescription')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : items.length === 0 ? (
                    <Empty>
                        <EmptyHeader>
                            <EmptyTitle>{t('articles.emptyTitle')}</EmptyTitle>
                            <EmptyDescription>{t('articles.emptyDescription')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <>
                        <div
                            className={cn(
                                'nostr-following-feed-items',
                                agoraFeedLayout === 'masonry'
                                    ? 'nostr-following-feed-list-layout-masonry'
                                    : 'nostr-following-feed-list-layout-list'
                            )}
                            data-testid="articles-list"
                        >
                            {items.map((item) => (
                                <div key={item.id} className="nostr-following-feed-note-shell">
                                    <ArticlePreviewCard
                                        event={item.rawEvent}
                                        authorLabel={profileLabel(item.pubkey, profilesByPubkey[item.pubkey])}
                                        onOpenArticle={onOpenArticle}
                                    />
                                </div>
                            ))}
                        </div>
                        <ListLoadingFooter loading={isLoadingMore} label={t('articles.loadingMore')} className="max-w-[600px] justify-self-start" />
                    </>
                )}
            </div>
        </OverlaySurface>
    );
}
