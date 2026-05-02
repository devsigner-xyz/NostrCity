export const SETTINGS_ROUTE_VIEWS = ['advanced', 'shortcuts', 'about'] as const;

export type SettingsRouteView = (typeof SETTINGS_ROUTE_VIEWS)[number];

const SETTINGS_ROUTE_VIEW_SET = new Set<string>(SETTINGS_ROUTE_VIEWS);

export function isSettingsRouteView(value: string): value is SettingsRouteView {
    return SETTINGS_ROUTE_VIEW_SET.has(value);
}

export function settingsViewFromPathname(pathname: string): SettingsRouteView | null {
    if (!pathname.startsWith('/settings/')) {
        return null;
    }

    const firstSegment = pathname.slice('/settings/'.length).split('/')[0] || '';
    if (!isSettingsRouteView(firstSegment)) {
        return null;
    }

    return firstSegment;
}

export function buildSettingsPath(view: SettingsRouteView): `/settings/${SettingsRouteView}` {
    return `/settings/${view}`;
}
