import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { VerifiedUserAvatar } from './VerifiedUserAvatar';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

function renderAvatar(picture?: string): RenderResult {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(
            <VerifiedUserAvatar
                picture={picture}
                imageAlt="Alice avatar"
                fallback="AL"
            />
        );
    });

    return { container, root };
}

describe('VerifiedUserAvatar', () => {
    beforeAll(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(() => {
        document.body.replaceChildren();
    });

    test('does not render unsafe profile image URLs', () => {
        const rendered = renderAvatar('javascript:alert(1)');

        expect(rendered.container.querySelector('img')).toBeNull();

        act(() => {
            rendered.root.unmount();
        });
    });
});
