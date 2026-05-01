const APP_BASENAME = '/app';

export function cleanLegacyHashRoutePath(pathname: string, hash: string): string | undefined {
    if (!hash.startsWith('#/') || !overlayRouterBasenameFromPathname(pathname)) {
        return undefined;
    }

    return `${APP_BASENAME}${hash.slice(1)}`;
}

export function overlayRouterBasenameFromPathname(pathname: string): string | undefined {
    return pathname === APP_BASENAME || pathname.startsWith(`${APP_BASENAME}/`) ? APP_BASENAME : undefined;
}
