import { describe, expect, test } from 'vitest';
import { parseGroupInviteLink } from './group-invite-links';

describe('group invite links', () => {
    test('parses NIP-29 group addresses with an optional invite code', () => {
        expect(parseGroupInviteLink("groups.example'maps", 'abc123')).toEqual({
            relay: 'wss://groups.example',
            group: 'maps',
            code: 'abc123',
        });

        expect(parseGroupInviteLink("wss://groups.example'parks")).toEqual({
            relay: 'wss://groups.example',
            group: 'parks',
        });
    });

    test('parses invite links with relay, group, and optional code params', () => {
        expect(parseGroupInviteLink('https://example.com/open/?relay=groups.fiatjaf.com&group=Maps&code=abc123')).toEqual({
            relay: 'wss://groups.fiatjaf.com',
            group: 'Maps',
            code: 'abc123',
        });

        expect(parseGroupInviteLink('https://client.example/groups?relay=wss%3A%2F%2Fgroups.example&group=parks')).toEqual({
            relay: 'wss://groups.example',
            group: 'parks',
        });
    });

    test('parses internal groups route links', () => {
        expect(parseGroupInviteLink('/groups?relay=wss%3A%2F%2Fgroups.example&group=parks&code=invite')).toEqual({
            relay: 'wss://groups.example',
            group: 'parks',
            code: 'invite',
        });
    });

    test('returns null for missing or unsafe values', () => {
        expect(parseGroupInviteLink('https://example.com/open/?relay=groups.example')).toBeNull();
        expect(parseGroupInviteLink('https://example.com/open/?relay=https://bad.example&group=parks')).toBeNull();
        expect(parseGroupInviteLink('not a link')).toBeNull();
    });
});
