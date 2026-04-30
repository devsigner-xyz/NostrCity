import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

import { useOverlayNavigationStack } from './use-overlay-navigation-stack';

interface NavigationStackApi {
    path: string;
    go: (path: string) => void;
    back: () => void;
}

interface HarnessProps {
    fallbackPath?: string;
    onReady: (api: NavigationStackApi) => void;
}

interface RenderResult {
    api: () => NavigationStackApi;
    container: HTMLDivElement;
    root: Root;
}

let mounted: RenderResult | null = null;

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
    if (!mounted) {
        return;
    }

    const { container, root } = mounted;
    act(() => {
        root.unmount();
    });
    container.remove();
    mounted = null;
});

function Harness({ fallbackPath, onReady }: HarnessProps): ReactElement | null {
    const location = useLocation();
    const navigate = useNavigate();
    const { goBackWithinApp } = useOverlayNavigationStack({
        location,
        navigate,
        ...(fallbackPath === undefined ? {} : { fallbackPath }),
    });

    onReady({
        path: `${location.pathname}${location.search}${location.hash}`,
        go: (path) => navigate(path),
        back: goBackWithinApp,
    });

    return null;
}

function renderRoute(initialEntry: string, fallbackPath?: string): RenderResult {
    let currentApi: NavigationStackApi | null = null;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const harness = fallbackPath === undefined
        ? <Harness onReady={(api) => { currentApi = api; }} />
        : <Harness fallbackPath={fallbackPath} onReady={(api) => { currentApi = api; }} />;

    act(() => {
        root.render(
            <MemoryRouter initialEntries={[initialEntry]}>
                {harness}
            </MemoryRouter>,
        );
    });

    mounted = {
        api: () => {
            if (!currentApi) {
                throw new Error('Navigation stack harness did not initialize');
            }

            return currentApi;
        },
        container,
        root,
    };

    return mounted;
}

function go(api: () => NavigationStackApi, path: string): void {
    act(() => {
        api().go(path);
    });
}

function back(api: () => NavigationStackApi): void {
    act(() => {
        api().back();
    });
}

describe('useOverlayNavigationStack', () => {
    test('starting directly on an overlay route navigates back to the fallback path', () => {
        const { api } = renderRoute('/agora');

        back(api);

        expect(api().path).toBe('/');
    });

    test('returns to the map after navigating from the map to Agora', () => {
        const { api } = renderRoute('/');

        go(api, '/agora');
        back(api);

        expect(api().path).toBe('/');
    });

    test('returns to Agora after navigating from Agora to notifications', () => {
        const { api } = renderRoute('/agora');

        go(api, '/notifications');
        back(api);

        expect(api().path).toBe('/agora');
    });

    test('does not add duplicate entries for duplicate location changes', () => {
        const { api } = renderRoute('/agora');

        go(api, '/agora');
        back(api);

        expect(api().path).toBe('/');
    });

    test('stores pathname, search, and hash for previous app entries', () => {
        const { api } = renderRoute('/agora?filter=hot#top');

        go(api, '/notifications?tab=mentions#new');
        back(api);

        expect(api().path).toBe('/agora?filter=hot#top');
    });

    test('uses the default fallback path when no previous app entry exists', () => {
        const { api } = renderRoute('/agora');

        back(api);

        expect(api().path).toBe('/');
    });

    test('limits stored app entries to the most recent thirty paths', () => {
        const { api } = renderRoute('/route-0');

        for (let index = 1; index <= 31; index += 1) {
            go(api, `/route-${index}`);
        }

        for (let index = 30; index >= 2; index -= 1) {
            back(api);
            expect(api().path).toBe(`/route-${index}`);
        }

        back(api);

        expect(api().path).toBe('/');
    });
});
