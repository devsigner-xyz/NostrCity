import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { buildSettingsPath } from '../settings/settings-routing';
import { useOverlayRouteState } from './use-overlay-route-state';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

let mounted: RenderResult | null = null;

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function render(element: ReactElement): RenderResult {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(element);
    });

    mounted = { container, root };
    return mounted;
}

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

function RouteStateProbe(): ReactElement {
    const routeState = useOverlayRouteState();

    return (
        <div>
            <span data-testid="pathname">{routeState.location.pathname}</span>
            <span data-testid="active-settings-view">{routeState.activeSettingsView ?? 'none'}</span>
            <span data-testid="active-agora-hashtag">{routeState.activeAgoraHashtag ?? 'none'}</span>
            <span data-testid="is-map-route">{String(routeState.isMapRoute)}</span>
            <span data-testid="is-agora-route">{String(routeState.isAgoraRoute)}</span>
            <span data-testid="is-articles-route">{String(routeState.isArticlesRoute)}</span>
            <span data-testid="is-article-detail-route">{String(routeState.isArticleDetailRoute)}</span>
            <span data-testid="is-chats-route">{String(routeState.isChatsRoute)}</span>
            <span data-testid="is-notifications-route">{String(routeState.isNotificationsRoute)}</span>
            <button type="button" onClick={() => routeState.navigate('/agora?tag=CityLife')}>open agora</button>
            <button type="button" onClick={() => routeState.navigate('/')}>open map</button>
            <button type="button" onClick={() => routeState.openSettingsPage('shortcuts')}>open shortcuts</button>
            <button type="button" onClick={routeState.openGlobalUserSearch}>open search</button>
            <button type="button" onClick={routeState.closeGlobalUserSearch}>close search</button>
            <button type="button" onClick={routeState.openUiSettingsDialog}>open ui dialog</button>
            <button type="button" onClick={routeState.closeUiSettingsDialog}>close ui dialog</button>
            <span data-testid="is-ui-settings-dialog-open">{String(routeState.isUiSettingsDialogOpen)}</span>
        </div>
    );
}

function renderRoute(initialEntry: string): RenderResult {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <RouteStateProbe />
        </MemoryRouter>,
    );
}

function text(container: HTMLElement, testId: string): string {
    return container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '';
}

function click(container: HTMLElement, label: string): void {
    const button = Array.from(container.querySelectorAll('button'))
        .find((candidate) => candidate.textContent === label);
    if (!button) {
        throw new Error(`Button not found: ${label}`);
    }

    act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

describe('useOverlayRouteState', () => {
    test('reports the initial map route as the default overlay page', () => {
        const { container } = renderRoute('/');

        expect(text(container, 'pathname')).toBe('/');
        expect(text(container, 'is-map-route')).toBe('true');
        expect(text(container, 'is-agora-route')).toBe('false');
        expect(text(container, 'active-settings-view')).toBe('none');
    });

    test('updates active route state when navigating to the following feed', () => {
        const { container } = renderRoute('/');

        click(container, 'open agora');

        expect(text(container, 'pathname')).toBe('/agora');
        expect(text(container, 'is-map-route')).toBe('false');
        expect(text(container, 'is-agora-route')).toBe('true');
        expect(text(container, 'active-agora-hashtag')).toBe('citylife');
    });

    test('detects article list and detail routes without activating Agora hashtag filters', () => {
        const list = renderRoute('/agora/articles?tag=nostr');

        expect(text(list.container, 'is-articles-route')).toBe('true');
        expect(text(list.container, 'is-article-detail-route')).toBe('false');
        expect(text(list.container, 'active-agora-hashtag')).toBe('none');

        act(() => {
            list.root.unmount();
        });
        list.container.remove();
        mounted = null;

        const detail = renderRoute(`/agora/articles/${'a'.repeat(64)}`);

        expect(text(detail.container, 'is-articles-route')).toBe('false');
        expect(text(detail.container, 'is-article-detail-route')).toBe('true');
        expect(text(detail.container, 'active-agora-hashtag')).toBe('none');
    });

    test('detects the notifications route using the english path', () => {
        const { container } = renderRoute('/notifications');

        expect(text(container, 'is-notifications-route')).toBe('true');
    });

    test('returns route state to the map default', () => {
        const { container } = renderRoute('/agora?tag=nostr');

        click(container, 'open map');

        expect(text(container, 'pathname')).toBe('/');
        expect(text(container, 'is-map-route')).toBe('true');
        expect(text(container, 'active-agora-hashtag')).toBe('none');
    });

    test('tracks settings sub-routes using the settings route helpers', () => {
        const { container } = renderRoute(buildSettingsPath('about'));

        expect(text(container, 'active-settings-view')).toBe('about');

        click(container, 'open shortcuts');

        expect(text(container, 'pathname')).toBe(buildSettingsPath('shortcuts'));
        expect(text(container, 'active-settings-view')).toBe('shortcuts');
    });

    test('redirects invalid settings sub-routes to the default settings route', () => {
        const { container } = renderRoute('/settings/not-real');

        expect(text(container, 'pathname')).toBe(buildSettingsPath('zaps'));
        expect(text(container, 'active-settings-view')).toBe('zaps');
    });

    test('keeps search route and ui dialog state available to App callers', () => {
        const { container } = renderRoute('/');

        click(container, 'open search');
        expect(text(container, 'pathname')).toBe('/user-search');

        click(container, 'close search');
        expect(text(container, 'pathname')).toBe('/');

        click(container, 'open ui dialog');
        expect(text(container, 'is-ui-settings-dialog-open')).toBe('true');

        click(container, 'close ui dialog');
        expect(text(container, 'is-ui-settings-dialog-open')).toBe('false');
    });
});
