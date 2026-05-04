import type { NostrEvent, NostrProfile } from '../../nostr/types';
import type { SocialFeedItem, SocialFeedService } from '../../nostr/social-feed-service';
import { useArticleDetailQuery } from '../query/following-feed.query';
import { useI18n } from '@/i18n/useI18n';
import { Spinner } from '@/components/ui/spinner';
import { OverlaySurface } from '../components/OverlaySurface';
import { ArticleMarkdownContent } from '../components/ArticleMarkdownContent';
import { useParams } from 'react-router';

export interface ArticleDetailRouteContainerProps {
    items: SocialFeedItem[];
    profilesByPubkey: Record<string, NostrProfile>;
    service: SocialFeedService;
    enabled: boolean;
    onOpenAuthor?: (pubkey: string) => void;
}

function profileLabel(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName?.trim() || profile?.name?.trim() || `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

export function ArticleDetailRouteContainer({ items, profilesByPubkey, service, enabled, onOpenAuthor }: ArticleDetailRouteContainerProps) {
    const { t } = useI18n();
    const params = useParams();
    const eventId = params.eventId ?? null;
    const cachedEvent = items.find((item) => item.id === eventId)?.rawEvent;
    const query = useArticleDetailQuery({ eventId, service, enabled: enabled && !cachedEvent });
    const event: NostrEvent | null = cachedEvent ?? query.data ?? null;

    return (
        <OverlaySurface ariaLabel={t('articles.title')} contentClassName="overflow-y-auto">
            <div className="flex flex-col gap-4 pb-10" data-testid="article-detail-content">
                {query.isLoading && !event ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner />
                        <span>{t('articles.loadingTitle')}</span>
                    </div>
                ) : null}
                {query.error ? <p role="alert" className="text-sm text-destructive">{query.error.message}</p> : null}
                {!query.isLoading && !event ? <p>{t('articles.markdownUnavailable')}</p> : null}
                {event ? <ArticleMarkdownContent event={event} authorLabel={profileLabel(event.pubkey, profilesByPubkey[event.pubkey])} {...(onOpenAuthor ? { onOpenAuthor } : {})} /> : null}
            </div>
        </OverlaySurface>
    );
}
