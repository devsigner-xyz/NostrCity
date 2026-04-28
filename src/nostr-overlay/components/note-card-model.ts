export type NoteCardVariant = 'default' | 'root' | 'reply' | 'nested';

export interface NoteActionState {
    canWrite: boolean;
    isReactionActive: boolean;
    isRepostActive: boolean;
    isReactionPending: boolean;
    isRepostPending: boolean;
    replies: number;
    reactions: number;
    reposts: number;
    zapSats: number;
    zapAmounts?: number[] | undefined;
    reactionEmoji?: string | undefined;
    onReply: () => void;
    onViewDetail?: (() => void) | undefined;
    onToggleReaction: () => Promise<boolean>;
    onSelectReactionEmoji?: ((emoji: string) => Promise<boolean>) | undefined;
    onRepost: () => Promise<boolean>;
    onQuote: () => void;
    onZap?: ((amount: number) => Promise<void> | void) | undefined;
    onConfigureZapAmounts?: (() => void) | undefined;
}

export interface NoteCardModel {
    id: string;
    pubkey: string;
    createdAt: number;
    content: string;
    tags: string[][];
    kindNumber?: number;
    variant: NoteCardVariant;
    showCopyId: boolean;
    nestingLevel: number;
    kindLabel?: string;
    actions?: NoteActionState;
    embedded?: NoteCardModel;
    referencedNotes?: NoteCardModel[];
}

export function shortId(value: string): string {
    return value.length >= 14 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

export function withoutNoteActions(note: NoteCardModel): NoteCardModel {
    const { actions: _actions, embedded, referencedNotes, ...rest } = note;
    return {
        ...rest,
        ...(embedded ? { embedded: withoutNoteActions(embedded) } : {}),
        ...(referencedNotes ? { referencedNotes: referencedNotes.map((referencedNote) => withoutNoteActions(referencedNote)) } : {}),
    };
}

export function kindLabel(input: { variant: NoteCardVariant; isRepost?: boolean }): string | undefined {
    if (input.variant === 'root') {
        return 'Raiz';
    }

    if (input.variant === 'reply') {
        return 'Reply';
    }

    if (input.isRepost) {
        return 'Repost';
    }

    return undefined;
}
