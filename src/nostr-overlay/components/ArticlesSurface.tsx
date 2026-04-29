import type { SocialFeedItem } from '../../nostr/social-feed-service';
import type { NostrProfile } from '../../nostr/types';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { OverlaySurface } from './OverlaySurface';
import { ArticlePreviewCard } from './ArticlePreviewCard';
import { ListLoadingFooter } from './ListLoadingFooter';

interface ArticlesSurfaceProps {
    items: SocialFeedItem[];
    profilesByPubkey: Record<string, NostrProfile>;
    isLoading: boolean;
    isRefreshing: boolean;
    isLoadingMore: boolean;
    error: string | null;
    hasMore: boolean;
    onRefresh: () => Promise<void> | void;
    onLoadMore: () => Promise<void> | void;
    onOpenArticle: (eventId: string) => void;
}

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
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-3"
                data-testid="articles-scroll-area"
                onScroll={(event) => onScroll(event.currentTarget)}
            >
                <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-2xl font-semibold tracking-tight">{t('articles.title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('articles.subtitle')}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={isRefreshing} onClick={() => { void onRefresh(); }}>
                        {isRefreshing ? t('articles.refreshing') : t('articles.refresh')}
                    </Button>
                </header>

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
                    <div className="flex w-full max-w-[600px] self-start flex-col gap-4" data-testid="articles-list">
                        {items.map((item) => (
                            <ArticlePreviewCard
                                key={item.id}
                                event={item.rawEvent}
                                authorLabel={profileLabel(item.pubkey, profilesByPubkey[item.pubkey])}
                                onOpenArticle={onOpenArticle}
                            />
                        ))}
                        <ListLoadingFooter loading={isLoadingMore} label={t('articles.loadingMore')} className="max-w-[600px]" />
                    </div>
                )}
            </div>
        </OverlaySurface>
    );
}
