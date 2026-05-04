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
    onOpenAuthor?: (pubkey: string) => void;
}

function formatPublishedDate(createdAt: number, publishedAt: number | undefined): string {
    const timestamp = publishedAt ?? createdAt;
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '';
    }

    return new Date(timestamp * 1000).toLocaleDateString();
}

export function ArticlePreviewCard({ event, authorLabel, compact = false, onOpenArticle, onOpenAuthor }: ArticlePreviewCardProps) {
    const { t } = useI18n();
    const metadata = parseArticleMetadata(event);
    const title = metadata.title ?? t('articles.untitled');
    const publishedDate = formatPublishedDate(event.created_at, metadata.publishedAt);
    const author = authorLabel
        ? onOpenAuthor
            ? (
                <button
                    type="button"
                    className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={t('richContent.openProfile', { label: authorLabel })}
                    onClick={() => onOpenAuthor(event.pubkey)}
                >
                    {authorLabel}
                </button>
            )
            : authorLabel
        : null;

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
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                        {author}
                        {author && publishedDate ? <span aria-hidden="true">·</span> : null}
                        {publishedDate ? <span>{t('articles.published', { date: publishedDate })}</span> : null}
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
