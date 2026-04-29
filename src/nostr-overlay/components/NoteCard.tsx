import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { EllipsisVerticalIcon, HeartIcon, MessageCircleIcon, Repeat2Icon, ZapIcon } from 'lucide-react';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import { LONG_FORM_ARTICLE_KIND } from '../../nostr/articles';
import { profileHasZapEndpoint } from '../../nostr/zaps';
import { ArticlePreviewCard } from './ArticlePreviewCard';
import { RichNostrContent } from './RichNostrContent';
import { fromResolvedReferenceEvent } from './note-card-adapters';
import type { NoteActionState, NoteCardModel } from './note-card-model';
import { shortId } from './note-card-model';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import type { I18nContextValue } from '@/i18n/I18nProvider';
import { useI18n } from '@/i18n/useI18n';
import { sanitizeImageUrl } from '../media/image-url-policy';

export interface NoteCardProps {
    note: NoteCardModel;
    profilesByPubkey: Record<string, NostrProfile>;
    onCopyNoteId?: (noteId: string) => void;
    onSelectHashtag?: (hashtag: string) => void;
    onSelectProfile?: (pubkey: string) => void;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onSelectEventReference?: (eventId: string) => void;
    onResolveEventReferences?: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
    eventReferencesById?: Record<string, NostrEvent>;
}

function formatCreatedAt(createdAt: number, t: I18nContextValue['t']): { iso: string; label: string } {
    if (!Number.isFinite(createdAt) || createdAt <= 0) {
        return {
            iso: new Date(0).toISOString(),
            label: t('note.unknownDate'),
        };
    }

    const date = new Date(createdAt * 1000);
    return {
        iso: date.toISOString(),
        label: date.toLocaleString(),
    };
}

function profileDisplayName(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName || profile?.name || shortId(pubkey);
}

function profileInitials(pubkey: string, profile: NostrProfile | undefined): string {
    const label = profileDisplayName(pubkey, profile).trim();
    if (!label) {
        return pubkey.slice(0, 2).toUpperCase();
    }

    const words = label.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
        return (words[0] ?? '').slice(0, 2).toUpperCase();
    }

    return `${words[0]?.[0] || ''}${words[1]?.[0] || ''}`.toUpperCase();
}

function eventFromNote(note: NoteCardModel): NostrEvent {
    return {
        id: note.id,
        pubkey: note.pubkey,
        kind: note.kindNumber ?? 1,
        created_at: note.createdAt,
        tags: note.tags,
        content: note.content,
    };
}

function truncateTo140(content: string, _t: I18nContextValue['t']): string {
    const normalized = content.trim();
    if (!normalized) {
        return '';
    }

    if (normalized.length <= 140) {
        return normalized;
    }

    return `${normalized.slice(0, 140)}...`;
}

const MAX_NESTED_VISIBLE = 3;
const MAX_REFERENCES_VISIBLE = 2;
const DEFAULT_REACTION_EMOJI = '❤️';
const REACTION_EMOJI_PRESET = [DEFAULT_REACTION_EMOJI, '😂', '🔥', '👏', '🤯', '😮', '😢', '👍'] as const;

interface VisibleNestedEntries {
    visibleEntries: Array<{ key: string; note: NoteCardModel }>;
    hiddenReferencesCount: number;
}

function buildVisibleNestedEntries(note: NoteCardModel): VisibleNestedEntries {
    const visibleEntries: Array<{ key: string; note: NoteCardModel }> = [];
    const referencedNotes = note.referencedNotes ?? [];

    if (note.embedded) {
        visibleEntries.push({ key: `embedded-${note.embedded.id}`, note: note.embedded });
    }

    const remainingTotalSlots = Math.max(0, MAX_NESTED_VISIBLE - visibleEntries.length);
    const allowedReferenceSlots = Math.min(MAX_REFERENCES_VISIBLE, remainingTotalSlots);
    const visibleReferences = referencedNotes.slice(0, allowedReferenceSlots);
    visibleEntries.push(...visibleReferences.map((nestedNote) => ({ key: `reference-${nestedNote.id}`, note: nestedNote })));

    return {
        visibleEntries,
        hiddenReferencesCount: Math.max(0, referencedNotes.length - visibleReferences.length),
    };
}

interface NoteHeaderItemProps {
    note: NoteCardModel;
    profile: NostrProfile | undefined;
    t: I18nContextValue['t'];
}

function NoteHeaderItem({ note, profile, t }: NoteHeaderItemProps) {
    const publishedAt = formatCreatedAt(note.createdAt, t);
    const authorName = profileDisplayName(note.pubkey, profile);
    const safePicture = sanitizeImageUrl(profile?.picture);

    return (
        <Item className="px-0 py-0">
            <ItemMedia>
                <Avatar size="lg">
                    {safePicture ? <AvatarImage src={safePicture} alt={authorName} /> : null}
                    <AvatarFallback>{profileInitials(note.pubkey, profile)}</AvatarFallback>
                </Avatar>
            </ItemMedia>

            <ItemContent className="min-w-0">
                <ItemTitle>{authorName}</ItemTitle>
                <ItemDescription>
                    {note.kindLabel ? <span>{note.kindLabel} · </span> : null}
                    <time dateTime={publishedAt.iso}>{publishedAt.label}</time>
                </ItemDescription>
            </ItemContent>
        </Item>
    );
}

interface NoteActionGroupProps {
    actions: NoteActionState;
    t: I18nContextValue['t'];
}

interface NoteActionsMenuProps {
    noteId: string;
    onCopyNoteId?: (noteId: string) => void;
    onViewDetail?: () => void;
    t: I18nContextValue['t'];
}

function NoteActionsMenu({ noteId, onCopyNoteId, onViewDetail, t }: NoteActionsMenuProps) {
    if (!onCopyNoteId && !onViewDetail) {
        return null;
    }

    const openMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }));
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t('note.menu.openActions', { noteId })}
                    onClick={openMenu}
                >
                    <EllipsisVerticalIcon aria-hidden="true" />
                </Button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-40">
                <ContextMenuGroup>
                    {onViewDetail ? (
                        <ContextMenuItem aria-label={t('note.menu.viewDetailAria', { noteId })} onSelect={() => onViewDetail()}>
                            {t('note.menu.viewDetail')}
                        </ContextMenuItem>
                    ) : null}
                    {onCopyNoteId ? (
                        <ContextMenuItem aria-label={t('note.menu.copyIdAria', { noteId })} onSelect={() => onCopyNoteId(noteId)}>
                        {t('note.menu.copyId')}
                        </ContextMenuItem>
                    ) : null}
                </ContextMenuGroup>
            </ContextMenuContent>
        </ContextMenu>
    );
}

function NoteActionGroup({ actions, t }: NoteActionGroupProps) {
    const openRepostMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }));
    };

    const openZapMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }));
    };

    const canOpenZapMenu = Boolean(actions.canWrite && actions.onZap && actions.zapAmounts && actions.zapAmounts.length > 0);
    const reactionEmoji = actions.reactionEmoji || DEFAULT_REACTION_EMOJI;
    const reactionButtonLabel = actions.isReactionActive
        ? t('note.actions.removeReaction', { emoji: reactionEmoji, count: String(actions.reactions) })
        : t('note.actions.react', { count: String(actions.reactions) });
    const reactionButton = (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={actions.isReactionPending || !actions.canWrite}
            aria-label={reactionButtonLabel}
            onClick={(event) => {
                event.stopPropagation();
                if (actions.isReactionActive || !actions.onSelectReactionEmoji) {
                    void actions.onToggleReaction();
                }
            }}
        >
            {actions.isReactionActive ? (
                <span data-icon="inline-start" aria-hidden="true">{reactionEmoji}</span>
            ) : (
                <HeartIcon data-icon="inline-start" aria-hidden="true" />
            )}
            <span>{actions.reactions}</span>
        </Button>
    );

    return (
        <ButtonGroup>
            <Button type="button" variant="ghost" size="sm" aria-label={t('note.actions.reply', { count: String(actions.replies) })} onClick={(event) => {
                event.stopPropagation();
                actions.onReply();
            }}>
                {actions.isReplyActive ? (
                    <span data-icon="inline-start" aria-hidden="true">💬</span>
                ) : (
                    <MessageCircleIcon data-icon="inline-start" aria-hidden="true" />
                )}
                <span>{actions.replies}</span>
            </Button>

            {!actions.isReactionActive && actions.onSelectReactionEmoji ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        {reactionButton}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-40" align="start">
                        <DropdownMenuGroup>
                            <DropdownMenuLabel>{t('note.actions.chooseReaction')}</DropdownMenuLabel>
                            {REACTION_EMOJI_PRESET.map((emoji) => (
                                <DropdownMenuItem
                                    key={`note-reaction-${emoji}`}
                                    aria-label={t('note.actions.reactWithEmoji', { emoji })}
                                    onSelect={() => {
                                        void actions.onSelectReactionEmoji?.(emoji);
                                    }}
                                >
                                    <span>{emoji}</span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : reactionButton}

            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={actions.isRepostPending || !actions.canWrite}
                        aria-label={t('note.actions.repost', { count: String(actions.reposts) })}
                        onClick={openRepostMenu}
                    >
                        <Repeat2Icon data-icon="inline-start" aria-hidden="true" />
                        <span>{actions.reposts}</span>
                    </Button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-40">
                    <ContextMenuGroup>
                        <ContextMenuItem onSelect={() => {
                            void actions.onRepost();
                        }}>
                            {t('note.actions.repostAction')}
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={actions.onQuote}>
                            {t('note.actions.quoteAction')}
                        </ContextMenuItem>
                    </ContextMenuGroup>
                </ContextMenuContent>
            </ContextMenu>

            {canOpenZapMenu ? (
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={t('note.actions.zaps', { count: String(actions.zapSats) })}
                            onClick={openZapMenu}
                        >
                            {actions.isZapActive ? (
                                <span data-icon="inline-start" aria-hidden="true">⚡</span>
                            ) : (
                                <ZapIcon data-icon="inline-start" aria-hidden="true" />
                            )}
                            <span>{actions.zapSats}</span>
                        </Button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-44">
                        <ContextMenuGroup>
                            {actions.zapAmounts?.map((amount) => (
                                <ContextMenuItem key={`note-zap-${amount}`} onSelect={() => {
                                    void actions.onZap?.(amount);
                                }}>
                                    {t('zaps.amountSats', { amount: String(amount) })}
                                </ContextMenuItem>
                            ))}
                            <ContextMenuSeparator />
                            <ContextMenuItem {...(actions.onConfigureZapAmounts ? { onSelect: actions.onConfigureZapAmounts } : {})}>
                                {t('note.actions.configureZapAmounts')}
                            </ContextMenuItem>
                        </ContextMenuGroup>
                    </ContextMenuContent>
                </ContextMenu>
            ) : (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!actions.canWrite || !actions.onZap}
                    aria-label={t('note.actions.zaps', { count: String(actions.zapSats) })}
                    onClick={(event) => event.stopPropagation()}
                >
                    {actions.isZapActive ? (
                        <span data-icon="inline-start" aria-hidden="true">⚡</span>
                    ) : (
                        <ZapIcon data-icon="inline-start" aria-hidden="true" />
                    )}
                    <span>{actions.zapSats}</span>
                </Button>
            )}
        </ButtonGroup>
    );
}

export function NoteCard({
    note,
    profilesByPubkey,
    onCopyNoteId,
    onSelectHashtag,
    onSelectProfile,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
    eventReferencesById,
}: NoteCardProps) {
    const { t } = useI18n();
    const isDeepNested = note.nestingLevel >= 2;
    const profile = profilesByPubkey[note.pubkey];
    const { visibleEntries, hiddenReferencesCount } = buildVisibleNestedEntries(note);
    const noteActionState = note.actions
        ? {
            ...note.actions,
            ...(profileHasZapEndpoint(profile) ? {} : { onZap: undefined, zapAmounts: undefined, onConfigureZapAmounts: undefined }),
        }
        : undefined;
    const noteCardSharedProps = {
        ...(onCopyNoteId ? { onCopyNoteId } : {}),
        ...(onSelectHashtag ? { onSelectHashtag } : {}),
        ...(onSelectProfile ? { onSelectProfile } : {}),
        ...(onResolveProfiles ? { onResolveProfiles } : {}),
        ...(onSelectEventReference ? { onSelectEventReference } : {}),
        ...(onResolveEventReferences ? { onResolveEventReferences } : {}),
        ...(eventReferencesById ? { eventReferencesById } : {}),
    };

    const renderNestedReference = (eventId: string, event: NostrEvent | undefined, nestingLevel: number): ReactNode => {
        if (note.embedded?.id === eventId) {
            return <></>;
        }

        if (!event) {
            return (
                <article aria-live="polite">
                    <p>{t('note.reference.loading')}</p>
                </article>
            );
        }

        const nestedNote = fromResolvedReferenceEvent(event, nestingLevel);
        if (!nestedNote) {
            return (
                <article aria-live="polite">
                    <p>{t('note.reference.renderError')}</p>
                    {onSelectEventReference ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={t('note.reference.openAria', { eventId })}
                            onClick={() => onSelectEventReference(eventId)}
                        >
                            {t('note.reference.open')}
                        </Button>
                    ) : null}
                </article>
            );
        }

        return (
            <div>
                <NoteCard
                    note={nestedNote}
                    profilesByPubkey={profilesByPubkey}
                    {...noteCardSharedProps}
                />
                {onSelectEventReference ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t('note.reference.openAria', { eventId })}
                        onClick={() => onSelectEventReference(eventId)}
                    >
                        {t('note.reference.open')}
                    </Button>
                ) : null}
            </div>
        );
    };

    const renderNestedModel = (nestedNote: NoteCardModel, key: string) => {
        return (
            <NoteCard
                key={key}
                note={nestedNote}
                profilesByPubkey={profilesByPubkey}
                {...noteCardSharedProps}
            />
        );
    };

    const openDetail = note.actions?.onViewDetail;
    const handleCardClick = (event: ReactMouseEvent<HTMLElement>): void => {
        if (!openDetail) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, [role="button"], [data-slot="button"], [data-slot="context-menu-item"], [data-slot="context-menu-content"]')) {
            return;
        }

        openDetail();
    };

    return (
        <article onClick={handleCardClick} className={openDetail ? 'cursor-pointer' : undefined}>
            <Card size={note.variant === 'nested' ? 'sm' : 'default'} className="border border-border/70">
                <CardHeader className="px-4 py-0 group-data-[size=sm]/card:px-3">
                    <NoteHeaderItem
                        note={note}
                        profile={profile}
                        t={t}
                    />
                </CardHeader>

                <CardContent>
                    {isDeepNested ? (
                        <div aria-live="polite" className="flex flex-col gap-2">
                            <p>{t('note.reference.label')}</p>
                            {note.content.trim() ? <p>{truncateTo140(note.content, t)}</p> : null}
                            <p>{shortId(note.id)}</p>
                            {onSelectEventReference ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-label={t('note.reference.openAria', { eventId: note.id })}
                                    onClick={() => onSelectEventReference(note.id)}
                                >
                                    {t('note.reference.open')}
                                </Button>
                            ) : null}
                        </div>
                    ) : note.kindNumber === LONG_FORM_ARTICLE_KIND ? (
                        <ArticlePreviewCard event={eventFromNote(note)} authorLabel={profileDisplayName(note.pubkey, profile)} />
                    ) : (
                        <RichNostrContent
                            content={note.content}
                            tags={note.tags}
                            {...(onSelectHashtag ? { onSelectHashtag } : {})}
                            {...(onSelectProfile ? { onSelectProfile } : {})}
                            {...(onResolveProfiles ? { onResolveProfiles } : {})}
                            {...(onSelectEventReference ? { onSelectEventReference } : {})}
                            {...(onResolveEventReferences ? { onResolveEventReferences } : {})}
                            {...(eventReferencesById ? { eventReferencesById } : {})}
                            renderEventReferenceCard={({ eventId, event }) => renderNestedReference(eventId, event, note.nestingLevel + 1)}
                            profilesByPubkey={profilesByPubkey}
                        />
                    )}

                    {!isDeepNested ? visibleEntries.map((entry) => renderNestedModel(entry.note, entry.key)) : null}
                    {!isDeepNested && hiddenReferencesCount > 0 ? <p>{t('note.reference.more', { count: String(hiddenReferencesCount) })}</p> : null}
                </CardContent>

                {note.actions || (note.showCopyId && onCopyNoteId) ? (
                    <CardFooter className="items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                    {noteActionState ? <NoteActionGroup actions={noteActionState} t={t} /> : null}
                        </div>
                        {(note.showCopyId || note.actions?.onViewDetail)
                            ? <NoteActionsMenu noteId={note.id} t={t} {...(onCopyNoteId ? { onCopyNoteId } : {})} {...(note.actions?.onViewDetail ? { onViewDetail: note.actions.onViewDetail } : {})} />
                            : null}
                    </CardFooter>
                ) : null}
            </Card>
        </article>
    );
}
