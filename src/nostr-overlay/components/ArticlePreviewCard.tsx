import type { NostrEvent } from '../../nostr/types';
import { parseArticleMetadata } from '../../nostr/articles';
import { useI18n } from '@/i18n/useI18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';

interface ArticlePreviewCardProps {
    event: NostrEvent;
    authorLabel?: string;
    compact?: boolean;
    onOpenArticle?: (eventId: string) => void;
}

function formatPublishedDate(createdAt: number, publishedAt: number | undefined): string {
    const timestamp = publishedAt ?? createdAt;
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '';
    }

    return new Date(timestamp * 1000).toLocaleDateString();
}

export function ArticlePreviewCard({ event, authorLabel, compact = false, onOpenArticle }: ArticlePreviewCardProps) {
    const { t } = useI18n();
    const metadata = parseArticleMetadata(event);
    const title = metadata.title ?? t('articles.untitled');
    const publishedDate = formatPublishedDate(event.created_at, metadata.publishedAt);

    return (
        <Card size={compact ? 'sm' : 'default'}>
            {metadata.image ? (
                <img
                    src={metadata.image}
                    alt={t('articles.imageAlt', { title })}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                />
            ) : null}
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {metadata.summary ? <CardDescription>{metadata.summary}</CardDescription> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {authorLabel || publishedDate ? (
                    <p className="text-sm text-muted-foreground">
                        {[authorLabel, publishedDate ? t('articles.published', { date: publishedDate }) : ''].filter(Boolean).join(' · ')}
                    </p>
                ) : null}
                {metadata.topics.length > 0 ? (
                    <div className="flex flex-wrap gap-2" aria-label={t('articles.title')}>
                        {metadata.topics.map((topic) => (
                            <Badge key={topic} variant="secondary">{topic}</Badge>
                        ))}
                    </div>
                ) : null}
            </CardContent>
            {onOpenArticle ? (
                <CardFooter>
                    <Button type="button" size="sm" onClick={() => onOpenArticle(event.id)}>
                        {t('articles.readArticle')}
                    </Button>
                </CardFooter>
            ) : null}
        </Card>
    );
}
