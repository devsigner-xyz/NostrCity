import type { SocialFeedItem } from '../../nostr/social-feed-service';
import type { NostrProfile } from '../../nostr/types';
import type { AgoraFeedLayout } from '../../nostr/ui-settings';
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
    agoraFeedLayout?: AgoraFeedLayout;
    isMobile?: boolean;
    onAgoraFeedLayoutChange?: (layout: AgoraFeedLayout) => void;
    onRefresh: () => Promise<void> | void;
    onLoadMore: () => Promise<void> | void;
    onOpenArticle: (eventId: string) => void;
}

const AGORA_LAYOUT_TOGGLE_ITEM_CLASS = 'data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground! data-[state=on]:hover:bg-primary/90!';

function profileLabel(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName?.trim() || profile?.name?.trim() || `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

function shouldLoadMore(container: HTMLDivElement): boolean {
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom < 80;
}

export function ArticlesSurface({
    items,
    profilesByPubkey,
    isLoading,
    isRefreshing,
    isLoadingMore,
    error,
    hasMore,
    agoraFeedLayout = 'list',
    isMobile = false,
    onAgoraFeedLayoutChange,
    onRefresh,
    onLoadMore,
    onOpenArticle,
}: ArticlesSurfaceProps) {
    const { t } = useI18n();

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
                    description={t('articles.subtitle')}
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
                        </>
                    )}
                />

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
