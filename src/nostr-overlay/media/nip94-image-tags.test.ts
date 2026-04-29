import { describe, expect, test } from 'vitest';
import { buildNip94ImageTags } from './nip94-image-tags';

describe('buildNip94ImageTags', () => {
    test('builds a note imeta tag from a generic Blossom blob', () => {
        expect(buildNip94ImageTags({
            url: `https://blossom.example/${'a'.repeat(64)}.png`,
            sha256: 'a'.repeat(64),
            size: 8,
            type: 'image/png',
        })).toEqual([[
            'imeta',
            `url https://blossom.example/${'a'.repeat(64)}.png`,
            'm image/png',
            `x ${'a'.repeat(64)}`,
            'size 8',
        ]]);
    });
});
