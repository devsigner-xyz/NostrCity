export interface RouteReturnState {
    returnTo?: string;
    returnFocusEventId?: string;
}

export function buildLocationTarget(input: { pathname: string; search: string }): string {
    return `${input.pathname}${input.search}`;
}

function isAppLocalRouteTarget(value: string): boolean {
    return value.trim() === value && value.startsWith('/') && !value.startsWith('//');
}

export function routeReturnStateFromUnknown(value: unknown): RouteReturnState {
    if (value === null || typeof value !== 'object') {
        return {};
    }

    const state = value as Record<string, unknown>;
    const routeReturnState: RouteReturnState = {};

    if (typeof state.returnTo === 'string' && isAppLocalRouteTarget(state.returnTo)) {
        routeReturnState.returnTo = state.returnTo;
    }

    if (typeof state.returnFocusEventId === 'string' && state.returnFocusEventId.trim() !== '') {
        routeReturnState.returnFocusEventId = state.returnFocusEventId;
    }

    return routeReturnState;
}
