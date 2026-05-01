import { describe, expect, test } from 'vitest';
import { buildAgoraNoteDetailPath, noteDetailEventIdFromPathname } from './note-detail-routing';

describe('note-detail-routing', () => {
    test('builds canonical agora note detail paths', () => {
        expect(buildAgoraNoteDetailPath('abc')).toBe('/agora/notes/abc');
        expect(buildAgoraNoteDetailPath('abc/def?tag=nostr')).toBe('/agora/notes/abc%2Fdef%3Ftag%3Dnostr');
    });

    test('extracts event id from canonical note detail pathname', () => {
        expect(noteDetailEventIdFromPathname('/agora/notes/abc')).toBe('abc');
        expect(noteDetailEventIdFromPathname('/agora/notes/abc%2Fdef%3Ftag%3Dnostr')).toBe('abc/def?tag=nostr');
    });

    test('ignores unrelated routes', () => {
        expect(noteDetailEventIdFromPathname('/agora')).toBeUndefined();
        expect(noteDetailEventIdFromPathname('/agora/articles/abc')).toBeUndefined();
        expect(noteDetailEventIdFromPathname('/notifications')).toBeUndefined();
        expect(noteDetailEventIdFromPathname('/agora/notes/abc/extra')).toBeUndefined();
    });

    test('returns undefined for malformed encoded note detail paths', () => {
        expect(() => noteDetailEventIdFromPathname('/agora/notes/%E0%A4%A')).not.toThrow();
        expect(noteDetailEventIdFromPathname('/agora/notes/%E0%A4%A')).toBeUndefined();
    });
});
