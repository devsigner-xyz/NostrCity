import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import {
    insertMentionIntoText,
    invalidateMentionsForEdit,
    type MentionDraft,
} from '../mention-serialization';
import { type SearchUsersResult, useUserSearchQuery } from '../query/user-search.query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { useI18n } from '@/i18n/useI18n';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { sanitizeImageUrl } from '../media/image-url-policy';

const SEARCH_DEBOUNCE_MS = 300;

interface ActiveMentionQuery {
    query: string;
    start: number;
    end: number;
}

export interface MentionTextareaProps extends Omit<React.ComponentProps<typeof Textarea>, 'value'> {
    value: MentionDraft;
    onChangeDraft: (draft: MentionDraft) => void;
    onSearch: (query: string) => Promise<SearchUsersResult>;
    ownerPubkey?: string | undefined;
    searchRelaySetKey?: string | undefined;
}

function profileDisplayName(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName || profile?.name || `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

function profileShortNpub(pubkey: string): string {
    try {
        const npub = encodeHexToNpub(pubkey);
        return `${npub.slice(0, 14)}...${npub.slice(-6)}`;
    } catch {
        return `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
    }
}

function buildActiveMentionQuery(text: string, caretIndex: number): ActiveMentionQuery | null {
    if (caretIndex < 0 || caretIndex > text.length) {
        return null;
    }

    const prefix = text.slice(0, caretIndex);
    const match = prefix.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) {
        return null;
    }

    const query = match[1] ?? '';
    const start = caretIndex - query.length - 1;
    if (start < 0) {
        return null;
    }

    return {
        query,
        start,
        end: caretIndex,
    };
}

function getMentionTokenKey(activeMentionQuery: ActiveMentionQuery | null): string | null {
    if (!activeMentionQuery) {
        return null;
    }

    return `${activeMentionQuery.start}:${activeMentionQuery.query}`;
}

export function MentionTextarea({ value, onChangeDraft, onSearch, ownerPubkey, searchRelaySetKey, className, onChange, onClick, onKeyDown, onKeyUp, onSelect, ...props }: MentionTextareaProps) {
    const { t } = useI18n();
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const pendingSelectionRef = useRef<number | null>(null);
    const [caretIndex, setCaretIndex] = useState(value.text.length);
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [dismissedTokenKey, setDismissedTokenKey] = useState<string | null>(null);

    const activeMentionQuery = useMemo(
        () => buildActiveMentionQuery(value.text, caretIndex),
        [caretIndex, value.text],
    );
    const activeTokenKey = getMentionTokenKey(activeMentionQuery);

    useEffect(() => {
        const nextQuery = activeMentionQuery?.query ?? '';
        const timer = window.setTimeout(() => {
            setDebouncedQuery(nextQuery);
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [activeMentionQuery?.query]);

    useEffect(() => {
        setActiveIndex(0);
    }, [debouncedQuery]);

    useEffect(() => {
        if (!activeTokenKey) {
            setDismissedTokenKey(null);
        }
    }, [activeTokenKey]);

    useEffect(() => {
        const nextSelection = pendingSelectionRef.current;
        if (nextSelection === null || !textareaRef.current) {
            return;
        }

        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextSelection, nextSelection);
        pendingSelectionRef.current = null;
        setCaretIndex(nextSelection);
    }, [value.text]);

    const searchQuery = useUserSearchQuery({
        term: debouncedQuery,
        enabled: Boolean(activeMentionQuery),
        allowEmpty: true,
        ownerPubkey,
        searchRelaySetKey,
        onSearch,
    });

    const rows = useMemo(
        () => searchQuery.result.pubkeys.map((pubkey) => ({ pubkey, profile: searchQuery.result.profiles[pubkey] })),
        [searchQuery.result],
    );
    const suggestionCount = rows.length;
    const open = Boolean(activeMentionQuery)
        && dismissedTokenKey !== activeTokenKey;

    useEffect(() => {
        if (suggestionCount === 0) {
            setActiveIndex(0);
            return;
        }

        setActiveIndex((current) => Math.min(current, suggestionCount - 1));
    }, [suggestionCount]);

    const commitMention = (pubkey: string, label: string): void => {
        if (!activeMentionQuery) {
            return;
        }

        const nextDraft = insertMentionIntoText(value, {
            pubkey,
            label,
            replaceStart: activeMentionQuery.start,
            replaceEnd: activeMentionQuery.end,
        });
        const insertedTextLength = `@${label}`.length;
        const nextSelection = activeMentionQuery.start + insertedTextLength + 1;

        pendingSelectionRef.current = nextSelection;
        setDismissedTokenKey(null);
        onChangeDraft(nextDraft);
    };

    const updateCaretFromTarget = (target: HTMLTextAreaElement): void => {
        const nextCaret = target.selectionStart ?? target.value.length;
        setCaretIndex(nextCaret);
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
        if (!open) {
            onKeyDown?.(event);
            return;
        }

        if (event.key === 'ArrowDown' && rows.length > 0) {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % rows.length);
            return;
        }

        if (event.key === 'ArrowUp' && rows.length > 0) {
            event.preventDefault();
            setActiveIndex((current) => (current - 1 + rows.length) % rows.length);
            return;
        }

        if (event.key === 'Enter' && rows.length > 0 && !searchQuery.isLoading && !searchQuery.error) {
            event.preventDefault();
            const selected = rows[activeIndex] ?? rows[0];
            if (selected) {
                commitMention(selected.pubkey, profileDisplayName(selected.pubkey, selected.profile));
            }
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            setDismissedTokenKey(activeTokenKey);
            return;
        }

        onKeyDown?.(event);
    };

    return (
        <div className="relative">
            <Textarea
                {...props}
                ref={textareaRef}
                className={className}
                value={value.text}
                onChange={(event) => {
                    const nextDraft = invalidateMentionsForEdit(value, event.target.value);
                    onChangeDraft(nextDraft);
                    updateCaretFromTarget(event.currentTarget);
                    onChange?.(event);
                }}
                onClick={(event) => {
                    updateCaretFromTarget(event.currentTarget);
                    onClick?.(event);
                }}
                onKeyDown={handleKeyDown}
                onKeyUp={(event) => {
                    updateCaretFromTarget(event.currentTarget);
                    onKeyUp?.(event);
                }}
                onSelect={(event) => {
                    updateCaretFromTarget(event.currentTarget as HTMLTextAreaElement);
                    onSelect?.(event);
                }}
            />

            {open ? (
                <div className="absolute inset-x-0 top-full mt-2 rounded-lg border bg-popover shadow-md">
                    <Command shouldFilter={false} className="rounded-lg border-0 p-0">
                        <CommandList className="max-h-60">
                            {searchQuery.isLoading ? (
                                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                                    <Spinner />
                                    <span>{t('mentionTextarea.loadingUsers')}</span>
                                </div>
                            ) : searchQuery.error ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">{searchQuery.error}</div>
                            ) : rows.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">{t('mentionTextarea.noResults')}</div>
                            ) : (
                                <>
                                    {searchQuery.isFetching ? (
                                        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
                                            <Spinner />
                                            <span>{t('mentionTextarea.searching')}</span>
                                        </div>
                                    ) : null}
                                    <CommandGroup heading={t('mentionTextarea.suggestions')}>
                                        {rows.map(({ pubkey, profile }, index) => {
                                            const display = profileDisplayName(pubkey, profile);
                                            const isActive = index === activeIndex;
                                            const safePicture = sanitizeImageUrl(profile?.picture);

                                            return (
                                                <CommandItem
                                                    key={pubkey}
                                                    value={`${display} ${profileShortNpub(pubkey)} ${pubkey}`}
                                                    className={cn('px-0 py-0', isActive ? 'bg-muted text-foreground' : undefined)}
                                                    onSelect={() => {
                                                        commitMention(pubkey, display);
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-3 px-2 py-1.5 text-left"
                                                        aria-label={t('mentionTextarea.mentionPerson', { displayName: display })}
                                                        onMouseDown={(event) => {
                                                            event.preventDefault();
                                                        }}
                                                        onClick={() => {
                                                            commitMention(pubkey, display);
                                                        }}
                                                    >
                                                        <Avatar className="size-8">
                                                            {safePicture ? <AvatarImage src={safePicture} alt={display} /> : null}
                                                            <AvatarFallback>{display.slice(0, 2).toUpperCase()}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex min-w-0 flex-1 flex-col">
                                                            <span className="truncate">{display}</span>
                                                            <span className="truncate text-xs text-muted-foreground">{profileShortNpub(pubkey)}</span>
                                                        </div>
                                                    </button>
                                                </CommandItem>
                                            );
                                        })}
                                    </CommandGroup>
                                </>
                            )}
                        </CommandList>
                    </Command>
                </div>
            ) : null}
        </div>
    );
}
