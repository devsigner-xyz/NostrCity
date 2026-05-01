const AGORA_NOTE_DETAIL_PATHNAME_PATTERN = /^\/agora\/notes\/([^/]+)$/;

export function buildAgoraNoteDetailPath(eventId: string): string {
    return `/agora/notes/${encodeURIComponent(eventId)}`;
}

export function noteDetailEventIdFromPathname(pathname: string): string | undefined {
    const match = AGORA_NOTE_DETAIL_PATHNAME_PATTERN.exec(pathname);

    if (!match) {
        return undefined;
    }

    const encodedEventId = match[1];
    if (!encodedEventId) {
        return undefined;
    }

    try {
        return decodeURIComponent(encodedEventId);
    } catch {
        return undefined;
    }
}
