import { describe, expect, test } from 'vitest';
import { sanitizeImageUrl } from './image-url-policy';

describe('sanitizeImageUrl', () => {
    test('allows safe https image URLs', () => {
        expect(sanitizeImageUrl('https://example.com/avatar.jpg')).toBe('https://example.com/avatar.jpg');
    });

    test.each([
        'http://example.com/avatar.jpg',
        'data:image/png;base64,AAAA',
        'blob:https://example.com/id',
        'javascript:alert(1)',
        'file:///tmp/avatar.jpg',
        '/avatar.jpg',
        'https://user:pass@example.com/avatar.jpg',
        'https://example.com/avatar.svg',
        'https://example.com/avatar.svg?cache=1',
        'not a url',
    ])('rejects unsafe image URL %s', (url) => {
        expect(sanitizeImageUrl(url)).toBeUndefined();
    });
});
