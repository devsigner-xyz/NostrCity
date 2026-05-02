import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { nip19 } from 'nostr-tools';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import { useI18n } from '@/i18n/useI18n';
import { Spinner } from '@/components/ui/spinner';

type RichToken =
    | { kind: 'text'; value: string }
    | { kind: 'url'; value: string }
    | { kind: 'hashtag'; value: string }
    | { kind: 'mention'; value: string; pubkey: string }
    | { kind: 'event-reference'; value: string; eventId: string; relayHints: string[] };

export interface RichMediaAttachment {
    url: string;
    kind: 'image' | 'video';
    alt?: string;
}

interface ImetaEntry {
    mime?: string;
    alt?: string;
}

export interface RichNostrContentProps {
    content: string;
    tags?: string[][];
    onSelectHashtag?: (hashtag: string) => void;
    onSelectProfile?: (pubkey: string) => void;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onSelectEventReference?: (eventId: string) => void;
    onResolveEventReferences?: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
    profilesByPubkey?: Record<string, NostrProfile>;
    eventReferencesById?: Record<string, NostrEvent>;
    renderEventReferenceCard?: (input: { eventId: string; event?: NostrEvent }) => ReactNode;
    textClassName?: string;
    emptyFallback?: ReactNode;
}

function isHexPubkey(value: string): boolean {
    return /^[a-f0-9]{64}$/.test(value);
}

type DecodedNostrEntity =
    | { kind: 'mention'; pubkey: string }
    | { kind: 'event-reference'; eventId: string; relayHints: string[] }
    | null;

function decodeNostrEntity(value: string): DecodedNostrEntity {
    const bech32Entity = value.replace(/^(?:web\+nostr:|nostr:)/i, '');

    try {
        const decoded = nip19.decode(bech32Entity);
        if (decoded.type === 'npub' && typeof decoded.data === 'string' && isHexPubkey(decoded.data)) {
            return { kind: 'mention', pubkey: decoded.data };
        }

        if (decoded.type === 'nprofile' && typeof decoded.data?.pubkey === 'string' && isHexPubkey(decoded.data.pubkey)) {
            return { kind: 'mention', pubkey: decoded.data.pubkey };
        }

        if (decoded.type === 'note' && typeof decoded.data === 'string' && isHexPubkey(decoded.data)) {
            return { kind: 'event-reference', eventId: decoded.data, relayHints: [] };
        }

        if (decoded.type === 'nevent' && typeof decoded.data?.id === 'string' && isHexPubkey(decoded.data.id)) {
            const relayHints = Array.isArray(decoded.data.relays)
                ? decoded.data.relays.filter((relay): relay is string => typeof relay === 'string' && relay.length > 0)
                : [];
            return { kind: 'event-reference', eventId: decoded.data.id, relayHints };
        }

        return null;
    } catch {
        return null;
    }
}

function shortPubkey(pubkey: string, t: ReturnType<typeof useI18n>['t']): string {
    if (!pubkey || pubkey.length < 14) {
        return pubkey || t('richContent.unknown');
    }

    return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

function resolveMentionLabel(pubkey: string, profilesByPubkey: Record<string, NostrProfile> | undefined, t: ReturnType<typeof useI18n>['t']): string {
    const profile = profilesByPubkey?.[pubkey];
    const displayName = profile?.displayName?.trim() || profile?.name?.trim();
    return displayName || shortPubkey(pubkey, t);
}

function formatCreatedAt(createdAt: number, t: ReturnType<typeof useI18n>['t']): string {
    if (!Number.isFinite(createdAt) || createdAt <= 0) {
        return t('richContent.unknownDate');
    }

    return new Date(createdAt * 1000).toLocaleString();
}

function summarizeEventContent(content: string): string | null {
    const normalized = content.trim();
    if (!normalized) {
        return null;
    }

    if (normalized.length <= 220) {
        return normalized;
    }

    return `${normalized.slice(0, 220)}...`;
}

function sanitizeUrlToken(value: string): string {
    return value.replace(/[),.!?]+$/g, '');
}

function normalizeHashtag(value: string): string {
    return value.replace(/^#+/, '').trim().toLowerCase();
}

function tokenizeContent(content: string): RichToken[] {
    const tokens: RichToken[] = [];
    const pattern = /https?:\/\/[^\s]+|(?:web\+nostr:|nostr:)?(?:npub|nprofile|note|nevent)1[023456789acdefghjklmnpqrstuvwxyz]+|#[A-Za-z0-9_]+/gi;
    let lastIndex = 0;

    for (const match of content.matchAll(pattern)) {
        if (typeof match.index !== 'number') {
            continue;
        }

        if (match.index > lastIndex) {
            tokens.push({
                kind: 'text',
                value: content.slice(lastIndex, match.index),
            });
        }

        const rawToken = match[0];
        if (rawToken.startsWith('#')) {
            tokens.push({ kind: 'hashtag', value: rawToken });
        } else {
            const decodedEntity = decodeNostrEntity(rawToken);
            if (decodedEntity?.kind === 'mention') {
                tokens.push({ kind: 'mention', value: rawToken, pubkey: decodedEntity.pubkey });
            } else if (decodedEntity?.kind === 'event-reference') {
                tokens.push({
                    kind: 'event-reference',
                    value: rawToken,
                    eventId: decodedEntity.eventId,
                    relayHints: decodedEntity.relayHints,
                });
            } else {
                tokens.push({ kind: 'url', value: sanitizeUrlToken(rawToken) });
            }
        }

        lastIndex = match.index + rawToken.length;
    }

    if (lastIndex < content.length) {
        tokens.push({ kind: 'text', value: content.slice(lastIndex) });
    }

    if (tokens.length === 0) {
        return [{ kind: 'text', value: content }];
    }

    return tokens;
}

function parseImetaEntries(tags: string[][]): Record<string, ImetaEntry> {
    const byUrl: Record<string, ImetaEntry> = {};

    for (const tag of tags) {
        if (!Array.isArray(tag) || tag[0] !== 'imeta') {
            continue;
        }

        let url: string | undefined;
        let mime: string | undefined;
        let alt: string | undefined;

        for (const entry of tag.slice(1)) {
            if (typeof entry !== 'string') {
                continue;
            }

            const separator = entry.indexOf(' ');
            if (separator <= 0) {
                continue;
            }

            const key = entry.slice(0, separator).trim();
            const value = entry.slice(separator + 1).trim();
            if (!value) {
                continue;
            }

            if (key === 'url') {
                url = value;
            }

            if (key === 'm') {
                mime = value;
            }

            if (key === 'alt') {
                alt = value;
            }
        }

        if (!url) {
            continue;
        }

        byUrl[url] = {
            ...(mime !== undefined ? { mime } : {}),
            ...(alt !== undefined ? { alt } : {}),
        };
    }

    return byUrl;
}

function resolveMediaKind(url: string, mime: string | undefined): 'image' | 'video' | null {
    if (mime?.startsWith('image/')) {
        return 'image';
    }

    if (mime?.startsWith('video/')) {
        return 'video';
    }

    if (/\.(png|jpe?g|gif|webp|avif|svg)([?#].*)?$/i.test(url)) {
        return 'image';
    }

    if (/\.(mp4|webm|ogg|mov|m4v)([?#].*)?$/i.test(url)) {
        return 'video';
    }

    return null;
}

function extractMediaAttachments(content: string, tags: string[][]): RichMediaAttachment[] {
    const seen = new Set<string>();
    const imetaByUrl = parseImetaEntries(tags);
    const attachments: RichMediaAttachment[] = [];

    for (const token of tokenizeContent(content)) {
        if (token.kind !== 'url') {
            continue;
        }

        const url = sanitizeUrlToken(token.value);
        if (!url || seen.has(url)) {
            continue;
        }

        const imeta = imetaByUrl[url];
        const mediaKind = resolveMediaKind(url, imeta?.mime);
        if (!mediaKind) {
            continue;
        }

        seen.add(url);
        attachments.push(
            {
                url,
                kind: mediaKind,
                ...(imeta?.alt !== undefined ? { alt: imeta.alt } : {}),
            }
        );
    }

    return attachments;
}

function renderInlineTokens(
    tokens: RichToken[],
    input: {
        t: ReturnType<typeof useI18n>['t'];
        onSelectHashtag: ((hashtag: string) => void) | undefined;
        onSelectProfile: ((pubkey: string) => void) | undefined;
        profilesByPubkey: Record<string, NostrProfile> | undefined;
        mediaAttachmentUrls: Set<string>;
    }
): ReactNode[] {
    return tokens.map((token, index) => {
        if (token.kind === 'text') {
            return <span key={`text-${index}`}>{token.value}</span>;
        }

        if (token.kind === 'url') {
            const url = sanitizeUrlToken(token.value);
            if (input.mediaAttachmentUrls.has(url)) {
                return null;
            }

            return (
                <a key={`url-${index}`} className="nostr-rich-link" href={url} target="_blank" rel="noreferrer">
                    {url}
                </a>
            );
        }

        if (token.kind === 'event-reference') {
            return null;
        }

        if (token.kind === 'mention') {
            const label = resolveMentionLabel(token.pubkey, input.profilesByPubkey, input.t);

            if (!input.onSelectProfile) {
                return <span key={`mention-${index}`} className="nostr-rich-mention">@{label}</span>;
            }

            return (
                <button
                    key={`mention-${index}`}
                    type="button"
                    className="nostr-rich-mention"
                    aria-label={input.t('richContent.openProfile', { label })}
                    onClick={() => input.onSelectProfile?.(token.pubkey)}
                >
                    @{label}
                </button>
            );
        }

        const normalized = normalizeHashtag(token.value);
        if (!normalized || !input.onSelectHashtag) {
            return <span key={`hashtag-${index}`}>{token.value}</span>;
        }

        return (
            <button
                key={`hashtag-${index}`}
                type="button"
                className="nostr-rich-hashtag"
                aria-label={input.t('richContent.filterHashtag', { hashtag: normalized })}
                onClick={() => input.onSelectHashtag?.(normalized)}
            >
                #{normalized}
            </button>
        );
    });
}

function buildVisibleEventReferenceEntries(
    tokens: RichToken[],
    maxVisible = 2
): { visibleEventIds: string[]; hiddenCount: number } {
    const uniqueEventIds: string[] = [];
    const seen = new Set<string>();

    for (const token of tokens) {
        if (token.kind !== 'event-reference' || seen.has(token.eventId)) {
            continue;
        }
        seen.add(token.eventId);
        uniqueEventIds.push(token.eventId);
    }

    const visibleEventIds = uniqueEventIds.slice(0, maxVisible);
    const hiddenCount = Math.max(0, uniqueEventIds.length - visibleEventIds.length);

    return {
        visibleEventIds,
        hiddenCount,
    };
}

function renderLoadingReference(eventId: string, t: ReturnType<typeof useI18n>['t']): ReactNode {
    return (
        <article key={`event-reference-${eventId}`} className="nostr-rich-event-reference" aria-live="polite">
            <p className="nostr-rich-event-reference-content">
                <span className="nostr-rich-event-reference-loading">
                    <Spinner className="size-3" />
                    <span>{t('richContent.loadingReference')}</span>
                </span>
            </p>
            <div className="nostr-rich-event-reference-meta">
                <span className="nostr-rich-event-reference-id">{eventId.slice(0, 8)}...{eventId.slice(-6)}</span>
            </div>
        </article>
    );
}

function renderExhaustedReference(eventId: string, t: ReturnType<typeof useI18n>['t'], onSelectEventReference: ((eventId: string) => void) | undefined): ReactNode {
    return (
        <article key={`event-reference-${eventId}`} className="nostr-rich-event-reference" aria-live="polite">
            <p className="nostr-rich-event-reference-content">{t('richContent.referenceLoadError')}</p>
            <div className="nostr-rich-event-reference-meta">
                <span className="nostr-rich-event-reference-id">{eventId.slice(0, 8)}...{eventId.slice(-6)}</span>
            </div>
            {onSelectEventReference ? (
                <button
                    type="button"
                    className="nostr-rich-event-reference-open"
                    aria-label={t('richContent.openReference', { eventId })}
                    onClick={() => onSelectEventReference(eventId)}
                >
                    {t('richContent.openNote')}
                </button>
            ) : null}
        </article>
    );
}

function renderResolvedReference(
    eventId: string,
    event: NostrEvent,
    input: {
        profilesByPubkey: Record<string, NostrProfile> | undefined;
        onSelectEventReference: ((eventId: string) => void) | undefined;
        renderEventReferenceCard: ((input: { eventId: string; event?: NostrEvent }) => ReactNode) | undefined;
        t: ReturnType<typeof useI18n>['t'];
    }
): ReactNode {
    const customNode = input.renderEventReferenceCard?.({ eventId, event });
    if (customNode) {
        return <div key={`event-reference-${eventId}`}>{customNode}</div>;
    }

    const authorLabel = resolveMentionLabel(event.pubkey, input.profilesByPubkey, input.t);
    const body = summarizeEventContent(event.content);
    const dateLabel = formatCreatedAt(event.created_at, input.t);

    const content = (
        <>
            <div className="nostr-rich-event-reference-header">
                <span className="nostr-rich-event-reference-author">@{authorLabel}</span>
            </div>
            <p className="nostr-rich-event-reference-content">{body}</p>
            <div className="nostr-rich-event-reference-meta">
                <span className="nostr-rich-event-reference-date">{dateLabel}</span>
                <span className="nostr-rich-event-reference-id">{eventId.slice(0, 8)}...{eventId.slice(-6)}</span>
            </div>
        </>
    );

    if (!input.onSelectEventReference) {
        return (
            <article key={`event-reference-${eventId}`} className="nostr-rich-event-reference">
                {content}
            </article>
        );
    }

    return (
        <button
            key={`event-reference-${eventId}`}
            type="button"
            className="nostr-rich-event-reference nostr-rich-event-reference-button"
            aria-label={input.t('richContent.openReference', { eventId })}
            onClick={() => input.onSelectEventReference?.(eventId)}
        >
            {content}
        </button>
    );
}

function renderEventReferenceCards(
    eventIds: string[],
    input: {
        eventReferencesById: Record<string, NostrEvent> | undefined;
        profilesByPubkey: Record<string, NostrProfile> | undefined;
        onSelectEventReference: ((eventId: string) => void) | undefined;
        renderEventReferenceCard: ((input: { eventId: string; event?: NostrEvent }) => ReactNode) | undefined;
        resolveAttemptsByEventId: Map<string, number>;
        t: ReturnType<typeof useI18n>['t'];
    }
): ReactNode[] {
    return eventIds.map((eventId) => {
        const event = input.eventReferencesById?.[eventId];
        if (event) {
            return renderResolvedReference(eventId, event, input);
        }

        const attempts = input.resolveAttemptsByEventId.get(eventId) ?? 0;
        if (attempts >= EVENT_REFERENCE_RESOLVE_MAX_ATTEMPTS) {
            return renderExhaustedReference(eventId, input.t, input.onSelectEventReference);
        }

        const customNode = input.renderEventReferenceCard?.({ eventId });
        if (customNode) {
            return <div key={`event-reference-${eventId}`}>{customNode}</div>;
        }

        return renderLoadingReference(eventId, input.t);
    });
}

const EVENT_REFERENCE_RESOLVE_MAX_ATTEMPTS = 3;
const EVENT_REFERENCE_RESOLVE_RETRY_MS = 1_500;

export function RichNostrContent({
    content,
    tags,
    onSelectHashtag,
    onSelectProfile,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
    profilesByPubkey,
    eventReferencesById,
    renderEventReferenceCard,
    textClassName,
    emptyFallback,
}: RichNostrContentProps) {
    const { t } = useI18n();
    const normalizedContent = content.trim();
    const tokenizedContent = useMemo(() => tokenizeContent(content), [content]);
    const mediaAttachments = useMemo(() => extractMediaAttachments(content, tags ?? []), [content, tags]);
    const imageSlides = useMemo(
        () => mediaAttachments
            .filter((attachment) => attachment.kind === 'image')
            .map((attachment) => ({
                src: attachment.url,
                ...(attachment.alt !== undefined ? { alt: attachment.alt } : {}),
            })),
        [mediaAttachments]
    );
    const [lightboxIndex, setLightboxIndex] = useState<number>(-1);
    const hasVisibleInlineToken = tokenizedContent.some((token) => token.kind === 'text' || token.kind === 'hashtag' || token.kind === 'mention');
    const hasEventReferences = tokenizedContent.some((token) => token.kind === 'event-reference');
    const requestedMentionPubkeysRef = useRef<Set<string>>(new Set());
    const requestedEventIdsRef = useRef<Set<string>>(new Set());
    const eventReferenceResolveAttemptsRef = useRef<Map<string, number>>(new Map());
    const eventReferenceRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [eventReferenceResolveTick, setEventReferenceResolveTick] = useState(0);

    useEffect(() => {
        if (!onResolveProfiles) {
            return;
        }

        const unresolvedPubkeys = new Set<string>();
        for (const token of tokenizedContent) {
            if (token.kind !== 'mention') {
                continue;
            }

            if (requestedMentionPubkeysRef.current.has(token.pubkey)) {
                continue;
            }

            const label = resolveMentionLabel(token.pubkey, profilesByPubkey, t);
            const profile = profilesByPubkey?.[token.pubkey];
            const hasResolvedName = Boolean(profile?.displayName?.trim() || profile?.name?.trim());
            if (hasResolvedName && label !== shortPubkey(token.pubkey, t)) {
                requestedMentionPubkeysRef.current.add(token.pubkey);
                continue;
            }

            unresolvedPubkeys.add(token.pubkey);
            requestedMentionPubkeysRef.current.add(token.pubkey);
        }

        if (unresolvedPubkeys.size === 0) {
            return;
        }

        void onResolveProfiles(Array.from(unresolvedPubkeys));
    }, [onResolveProfiles, profilesByPubkey, tokenizedContent]);

    useEffect(() => {
        if (!onResolveEventReferences) {
            return;
        }

        const unresolvedEventIds = new Set<string>();
        const relayHintsByEventId: Record<string, string[]> = {};
        for (const token of tokenizedContent) {
            if (token.kind !== 'event-reference') {
                continue;
            }

            if (eventReferencesById?.[token.eventId]) {
                requestedEventIdsRef.current.delete(token.eventId);
                eventReferenceResolveAttemptsRef.current.delete(token.eventId);
                continue;
            }

            if (requestedEventIdsRef.current.has(token.eventId)) {
                continue;
            }

            const attempts = eventReferenceResolveAttemptsRef.current.get(token.eventId) ?? 0;
            if (attempts >= EVENT_REFERENCE_RESOLVE_MAX_ATTEMPTS) {
                continue;
            }

            unresolvedEventIds.add(token.eventId);
            requestedEventIdsRef.current.add(token.eventId);

            if (token.relayHints.length > 0) {
                relayHintsByEventId[token.eventId] = token.relayHints;
            }
        }

        if (unresolvedEventIds.size === 0) {
            return;
        }

        const unresolved = Array.from(unresolvedEventIds);
        void (async () => {
            let resolvedById: Record<string, NostrEvent> = {};
            try {
                const resolved = await onResolveEventReferences(
                    unresolved,
                    Object.keys(relayHintsByEventId).length > 0 ? { relayHintsByEventId } : undefined
                );

                if (resolved && typeof resolved === 'object') {
                    resolvedById = resolved as Record<string, NostrEvent>;
                }
            } catch {
                resolvedById = {};
            }

            let shouldRetry = false;
            for (const eventId of unresolved) {
                requestedEventIdsRef.current.delete(eventId);
                const loaded = Boolean(resolvedById[eventId]) || Boolean(eventReferencesById?.[eventId]);
                if (loaded) {
                    eventReferenceResolveAttemptsRef.current.delete(eventId);
                    continue;
                }

                const nextAttempt = (eventReferenceResolveAttemptsRef.current.get(eventId) ?? 0) + 1;
                eventReferenceResolveAttemptsRef.current.set(eventId, nextAttempt);
                if (nextAttempt < EVENT_REFERENCE_RESOLVE_MAX_ATTEMPTS) {
                    shouldRetry = true;
                }
            }

            if (!shouldRetry) {
                setEventReferenceResolveTick((current) => current + 1);
                return;
            }

            if (eventReferenceRetryTimerRef.current) {
                clearTimeout(eventReferenceRetryTimerRef.current);
            }

            eventReferenceRetryTimerRef.current = setTimeout(() => {
                eventReferenceRetryTimerRef.current = null;
                setEventReferenceResolveTick((current) => current + 1);
            }, EVENT_REFERENCE_RESOLVE_RETRY_MS);
        })();
    }, [eventReferencesById, eventReferenceResolveTick, onResolveEventReferences, tokenizedContent]);

    useEffect(() => {
        return () => {
            if (eventReferenceRetryTimerRef.current) {
                clearTimeout(eventReferenceRetryTimerRef.current);
                eventReferenceRetryTimerRef.current = null;
            }
        };
    }, []);

    const inlineNodes = useMemo(
        () => renderInlineTokens(tokenizedContent, {
            t,
            onSelectHashtag,
            onSelectProfile,
            profilesByPubkey,
            mediaAttachmentUrls: new Set(mediaAttachments.map((attachment) => attachment.url)),
        }),
        [mediaAttachments, tokenizedContent, t, onSelectHashtag, onSelectProfile, profilesByPubkey]
    );
    const { visibleEventIds, hiddenCount: hiddenEventReferencesCount } = useMemo(
        () => buildVisibleEventReferenceEntries(tokenizedContent, 2),
        [tokenizedContent]
    );
    const eventReferenceCards = useMemo(
        () => renderEventReferenceCards(visibleEventIds, {
            eventReferencesById,
            profilesByPubkey,
            onSelectEventReference,
            renderEventReferenceCard,
            resolveAttemptsByEventId: eventReferenceResolveAttemptsRef.current,
            t,
        }),
        [eventReferenceResolveTick, eventReferencesById, onSelectEventReference, profilesByPubkey, renderEventReferenceCard, t, visibleEventIds]
    );

    const openLightbox = (imageUrl: string) => {
        const imageIndex = imageSlides.findIndex((slide) => slide.src === imageUrl);
        if (imageIndex < 0) {
            return;
        }

        setLightboxIndex(imageIndex);
    };

    const closeLightbox = () => {
        setLightboxIndex(-1);
    };
    const isLightboxOpen = lightboxIndex >= 0 && imageSlides.length > 0;
    const safeLightboxIndex = lightboxIndex < 0 ? 0 : Math.min(lightboxIndex, imageSlides.length - 1);

    return (
        <div className="nostr-rich-content-stack">
            {normalizedContent && hasVisibleInlineToken ? (
                <p className={textClassName || 'nostr-rich-content-text whitespace-pre-wrap break-words'}>
                    {inlineNodes}
                </p>
            ) : (!hasEventReferences ? (emptyFallback || null) : null)}

            {hasEventReferences ? (
                <div className="nostr-rich-event-reference-list">
                    {eventReferenceCards}
                    {hiddenEventReferencesCount > 0 ? <p>+{hiddenEventReferencesCount} referencias adicionales</p> : null}
                </div>
            ) : null}

            {mediaAttachments.length > 0 ? (
                <div className="nostr-rich-media-grid">
                    {mediaAttachments.map((attachment, index) => (
                        <div key={`${attachment.kind}-${attachment.url}`} className="nostr-rich-media-item">
                            {attachment.kind === 'image' ? (
                                <button
                                    type="button"
                                    className="nostr-rich-media-trigger"
                                    aria-label={`Abrir imagen ${index + 1} de ${mediaAttachments.length}`}
                                    onClick={() => openLightbox(attachment.url)}
                                >
                                    <img
                                        src={attachment.url}
                                        alt={attachment.alt || 'Imagen adjunta'}
                                        loading="lazy"
                                        className="nostr-rich-media-image"
                                    />
                                </button>
                            ) : (
                                <video
                                    src={attachment.url}
                                    controls
                                    preload="metadata"
                                    className="nostr-rich-media-video"
                                />
                            )}
                        </div>
                    ))}
                </div>
            ) : null}

            <Lightbox
                open={isLightboxOpen}
                close={closeLightbox}
                index={safeLightboxIndex}
                slides={imageSlides}
                portal={{
                    root: typeof document === 'undefined' ? null : document.body,
                }}
                controller={{
                    closeOnBackdropClick: true,
                }}
                on={{
                    view: ({ index }) => setLightboxIndex(index),
                }}
                styles={{
                    root: {
                        zIndex: 2147483000,
                    },
                }}
            />
        </div>
    );
}
