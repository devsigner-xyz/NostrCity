import { Fragment, useEffect, useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import type { SocialFeedItem } from '../../nostr/social-feed-service';
import type { NostrProfile } from '../../nostr/types';
import type { AgoraFeedLayout } from '../../nostr/ui-settings';
import { parseArticleMetadata } from '../../nostr/articles';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import {
    Combobox,
    ComboboxChip,
    ComboboxChips,
    ComboboxChipsInput,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxItem,
    ComboboxList,
    ComboboxValue,
    useComboboxAnchor,
} from '@/components/ui/combobox';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
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
    onOpenAuthor?: (pubkey: string) => void;
    onSelectedHashtagsChange?: (hashtags: string[]) => void;
    onClearHashtag?: () => void;
}

const AGORA_LAYOUT_TOGGLE_ITEM_CLASS = 'data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground! data-[state=on]:hover:bg-primary/90!';
const EMPTY_HASHTAGS: string[] = [];
const TOPIC_KEY_SEPARATOR = '\u0000';
const ARTICLES_EMPTY_STATE_CLASS = 'min-h-[50vh] max-w-none justify-self-stretch';

function profileLabel(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName?.trim() || profile?.name?.trim() || `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

function shouldLoadMore(container: HTMLDivElement): boolean {
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom < 80;
}

function normalizeTopics(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
}

function topicsKey(values: string[]): string {
    return values.join(TOPIC_KEY_SEPARATOR);
}

function topicsFromKey(key: string): string[] {
    return key ? key.split(TOPIC_KEY_SEPARATOR) : [];
}

function topicsFromArticles(items: SocialFeedItem[], extraTopics: string[] = []): string[] {
    return normalizeTopics([...items.flatMap((item) => parseArticleMetadata(item.rawEvent).topics), ...extraTopics])
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
    activeHashtags = EMPTY_HASHTAGS,
    agoraFeedLayout = 'list',
    isMobile = false,
    onAgoraFeedLayoutChange,
    onRefresh,
    onLoadMore,
    onOpenArticle,
    onOpenAuthor,
    onSelectedHashtagsChange,
}: ArticlesSurfaceProps) {
    const { t } = useI18n();
    const categoryAnchor = useComboboxAnchor();
    const selectedTopics = normalizeTopics(activeHashtags);
    const selectedTopicsKey = topicsKey(selectedTopics);
    const [draftTopics, setDraftTopics] = useState<string[]>(() => normalizeTopics(activeHashtags));
    const topics = topicsFromArticles(items, [...selectedTopics, ...draftTopics]);
    const hasSelectedTopics = selectedTopics.length > 0;
    const isEmptyArticlesState = !isLoading && items.length === 0;
    const usesEmptyLayout = isLoading || isEmptyArticlesState;

    useEffect(() => {
        setDraftTopics(topicsFromKey(selectedTopicsKey));
    }, [selectedTopicsKey]);

    const selectTopics = (values: string[]): void => {
        setDraftTopics(normalizeTopics(values));
    };

    const applyTopicFilter = (): void => {
        onSelectedHashtagsChange?.(draftTopics);
    };

    const clearTopicSelection = (): void => {
        setDraftTopics([]);
        onSelectedHashtagsChange?.([]);
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
                className={cn(
                    'nostr-articles-page nostr-routed-surface-panel nostr-page-layout flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-3',
                    usesEmptyLayout && 'nostr-articles-page-empty-state'
                )}
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
                            {!(isMobile && isEmptyArticlesState) ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className={isMobile ? 'sr-only focus:not-sr-only focus:absolute focus:right-3 focus:top-3 focus:z-20' : undefined}
                                    disabled={isRefreshing}
                                    onClick={() => { void onRefresh(); }}
                                >
                                    {isRefreshing ? (
                                        <>
                                            <Spinner data-icon="inline-start" />
                                            {t('articles.refreshing')}
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                                            {t('articles.refresh')}
                                        </>
                                    )}
                                </Button>
                            ) : null}
                        </>
                    )}
                />

                {topics.length > 0 && onSelectedHashtagsChange ? (
                    <div className="flex flex-col gap-2 text-sm font-medium text-foreground">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                            <Combobox
                                multiple
                                autoHighlight
                                items={topics}
                                value={draftTopics}
                                onValueChange={(values) => selectTopics(Array.isArray(values) ? values : [])}
                            >
                                <ComboboxChips ref={categoryAnchor} className="w-full max-w-xs" aria-label={t('articles.categorySelectLabel')}>
                                    <ComboboxValue>
                                        {(values) => (
                                            <Fragment>
                                                {values.map((value: string) => (
                                                    <ComboboxChip key={value}>{value}</ComboboxChip>
                                                ))}
                                                <ComboboxChipsInput
                                                    aria-label={t('articles.categorySelectLabel')}
                                                    placeholder={t('articles.categorySelectLabel')}
                                                />
                                            </Fragment>
                                        )}
                                    </ComboboxValue>
                                </ComboboxChips>
                                <ComboboxContent anchor={categoryAnchor}>
                                    <ComboboxEmpty>{t('articles.categoryEmpty')}</ComboboxEmpty>
                                    <ComboboxList>
                                        {(topic) => (
                                            <ComboboxItem key={topic} value={topic}>
                                                {topic}
                                            </ComboboxItem>
                                        )}
                                    </ComboboxList>
                                </ComboboxContent>
                            </Combobox>
                            <div className="flex gap-2">
                                <Button type="button" size="sm" onClick={applyTopicFilter}>
                                    {t('articles.searchFilter')}
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={clearTopicSelection} disabled={draftTopics.length === 0}>
                                    {t('articles.clearSelection')}
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

                {isLoading ? (
                    <Empty className={cn('articles-loading-state', ARTICLES_EMPTY_STATE_CLASS)}>
                        <EmptyHeader>
                            <Spinner />
                            <EmptyTitle>{t('articles.loadingTitle')}</EmptyTitle>
                            <EmptyDescription>{t('articles.loadingDescription')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : items.length === 0 ? (
                    <Empty data-testid="articles-empty-state" className={ARTICLES_EMPTY_STATE_CLASS}>
                        <EmptyHeader>
                            <EmptyTitle>{t('articles.emptyTitle')}</EmptyTitle>
                            <EmptyDescription>{t('articles.emptyDescription')}</EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => { void onRefresh(); }}
                                disabled={isRefreshing}
                            >
                                {isRefreshing ? (
                                    <>
                                        <Spinner data-icon="inline-start" />
                                        {t('articles.refreshing')}
                                    </>
                                ) : (
                                    <>
                                        <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                                        {t('articles.refresh')}
                                    </>
                                )}
                            </Button>
                        </EmptyContent>
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
                                        {...(onOpenAuthor ? { onOpenAuthor } : {})}
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
