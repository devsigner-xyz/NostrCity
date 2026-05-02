import { useRef } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import type { AgoraFeedLayout } from '../../nostr/ui-settings';
import { FollowingFeedContent, type FollowingFeedViewProps } from './FollowingFeedContent';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { OverlaySurface } from './OverlaySurface';

interface FollowingFeedSurfaceProps extends FollowingFeedViewProps {
    agoraFeedLayout?: AgoraFeedLayout;
    onAgoraFeedLayoutChange?: (layout: AgoraFeedLayout) => void;
    activeHashtag?: string;
    onClearHashtag?: () => void;
    returnFocusEventId?: string;
    isMobile?: boolean;
}

const AGORA_LAYOUT_TOGGLE_ITEM_CLASS = 'data-[state=on]:border-primary! data-[state=on]:bg-primary! data-[state=on]:text-primary-foreground! data-[state=on]:hover:bg-primary/90!';
const FEED_REFRESH_COOLDOWN_MS = 15_000;

export function FollowingFeedSurface({ agoraFeedLayout = 'list', onAgoraFeedLayoutChange, activeHashtag, onClearHashtag, ...feedProps }: FollowingFeedSurfaceProps) {
    const { t } = useI18n();
    const lastRefreshAtRef = useRef(Number.NEGATIVE_INFINITY);
    const headerSubtitle = activeHashtag
        ? t('feed.subtitle.hashtag', { hashtag: activeHashtag })
        : t('feed.subtitle.following');
    const showFeedHeaderActions = !feedProps.activeThread;
    const isEmptyNoPostsState = !feedProps.isLoadingFeed
        && feedProps.items.length === 0
        && (Boolean(activeHashtag) || feedProps.hasFollows);
    const pendingItemsLabel = feedProps.pendingNewCount === 1
        ? t('feed.newPosts.one')
        : t('feed.newPosts.many', { count: feedProps.pendingNewCount });
    const onRefreshFeedWithCooldown = (): Promise<void> | void => {
        const now = Date.now();
        if (now - lastRefreshAtRef.current < FEED_REFRESH_COOLDOWN_MS) {
            return;
        }

        lastRefreshAtRef.current = now;
        return feedProps.onRefreshFeed();
    };

    const headerActions = showFeedHeaderActions
        ? (
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
                {feedProps.hasPendingNewItems && !feedProps.isMobile ? (
                    <Button type="button" size="sm" onClick={feedProps.onApplyPendingNewItems}>
                        {pendingItemsLabel}
                    </Button>
                ) : null}
                {!(feedProps.isMobile && isEmptyNoPostsState) ? (
                    <Button type="button" variant="outline" size="sm" className={feedProps.isMobile ? 'sr-only focus:not-sr-only focus:absolute focus:right-3 focus:top-3 focus:z-20' : undefined} onClick={() => {
                        void onRefreshFeedWithCooldown();
                    }} disabled={feedProps.isRefreshingFeed}>
                        {feedProps.isRefreshingFeed ? (
                            <>
                                <Spinner />
                                {t('feed.refreshing')}
                            </>
                        ) : (
                            <>
                                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                                {t('feed.refresh')}
                            </>
                        )}
                    </Button>
                ) : null}
                {activeHashtag && onClearHashtag ? (
                    <Button type="button" variant="outline" size="sm" onClick={onClearHashtag}>
                        {t('feed.clearFilter')}
                    </Button>
                ) : null}
            </>
        )
        : undefined;

    return (
        <OverlaySurface ariaLabel="Agora" className="nostr-following-feed-surface" contentClassName="nostr-following-feed-routed-surface-content gap-0">
            <div className="flex min-h-0 flex-1 flex-col">
                <FollowingFeedContent
                    {...feedProps}
                    onRefreshFeed={onRefreshFeedWithCooldown}
                    agoraFeedLayout={agoraFeedLayout}
                    {...(activeHashtag ? { activeHashtag } : {})}
                    className="nostr-following-feed-surface-content nostr-following-feed-page nostr-routed-surface-panel nostr-page-layout"
                    headerSubtitle={headerSubtitle}
                    {...(headerActions ? { headerActions } : {})}
                />
            </div>
        </OverlaySurface>
    );
}
