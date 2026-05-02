import { Children, isValidElement, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { NostrEvent } from '../../nostr/types';
import { parseArticleMetadata } from '../../nostr/articles';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';

interface ArticleMarkdownContentProps {
    event: NostrEvent;
}

function formatPublishedDate(createdAt: number, publishedAt: number | undefined): string {
    const timestamp = publishedAt ?? createdAt;
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '';
    }

    return new Date(timestamp * 1000).toLocaleDateString();
}

const MarkdownParagraph: NonNullable<Components['p']> = ({ node: _node, className, ...props }) => {
    return <p className={cn('my-4 text-[1.05rem] font-normal leading-7 text-foreground/90', className)} {...props} />;
};

const markdownComponents: Components = {
    h1({ node: _node, className, ...props }) {
        return <h1 className={cn('mt-12 mb-7 text-4xl font-semibold leading-tight tracking-tight text-foreground', className)} {...props} />;
    },
    h2({ node: _node, className, ...props }) {
        return <h2 className={cn('mt-14 mb-6 text-3xl font-semibold leading-tight tracking-tight text-foreground', className)} {...props} />;
    },
    h3({ node: _node, className, ...props }) {
        return <h3 className={cn('mt-12 mb-5 text-2xl font-semibold leading-snug tracking-tight text-foreground', className)} {...props} />;
    },
    p: MarkdownParagraph,
    hr({ node: _node, className, ...props }) {
        return <hr className={cn('my-12 border-border/70', className)} {...props} />;
    },
    ul({ node: _node, className, ...props }) {
        return <ul className={cn('my-5 list-disc ps-7', className)} {...props} />;
    },
    ol({ node: _node, className, ...props }) {
        return <ol className={cn('my-5 list-decimal ps-7', className)} {...props} />;
    },
    li({ node: _node, className, children, ...props }) {
        return <li className={cn('my-2 font-normal leading-7 text-foreground/90', className)} {...props}>{unwrapListParagraphs(children)}</li>;
    },
    strong({ node: _node, className, ...props }) {
        return <strong className={cn('font-semibold text-foreground', className)} {...props} />;
    },
};

function unwrapListParagraphs(children: ReactNode): ReactNode {
    return Children.map(children, (child, index) => {
        if (isValidElement<{ children?: ReactNode }>(child) && child.type === MarkdownParagraph) {
            return <span key={`list-paragraph-${index}`} className="block">{child.props.children}</span>;
        }

        return child;
    });
}

export function ArticleMarkdownContent({ event }: ArticleMarkdownContentProps) {
    const { t } = useI18n();
    const metadata = parseArticleMetadata(event);
    const title = metadata.title ?? t('articles.untitled');
    const publishedDate = formatPublishedDate(event.created_at, metadata.publishedAt);

    return (
        <article className="mx-auto flex max-w-3xl flex-col gap-6 [font-family:'Noto_Serif',Georgia,Cambria,'Times_New_Roman',serif]">
            <header className="flex flex-col gap-3">
                <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
                {publishedDate ? <p className="text-sm text-muted-foreground">{t('articles.published', { date: publishedDate })}</p> : null}
                {metadata.summary ? <p className="text-base text-muted-foreground">{metadata.summary}</p> : null}
            </header>
            {metadata.image ? (
                <img
                    src={metadata.image}
                    alt={t('articles.imageAlt', { title })}
                    loading="lazy"
                    className="aspect-video w-full rounded-xl object-cover"
                />
            ) : null}
            <div
                data-testid="article-markdown-body"
                className="prose prose-neutral max-w-none font-normal dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h1:mt-10 prose-h1:mb-5 prose-h1:text-4xl prose-h1:leading-tight prose-h2:mt-12 prose-h2:mb-5 prose-h2:text-3xl prose-h2:leading-tight prose-h3:mt-10 prose-h3:mb-4 prose-h3:text-2xl prose-h3:leading-snug prose-p:my-5 prose-p:font-normal prose-p:leading-7 prose-li:my-2 prose-li:font-normal prose-li:leading-7 prose-ul:my-6 prose-ol:my-6 prose-hr:my-10 prose-hr:border-border"
            >
                <Markdown components={markdownComponents} rehypePlugins={[rehypeSanitize]} skipHtml>
                    {event.content}
                </Markdown>
            </div>
        </article>
    );
}
