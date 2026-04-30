import { useCallback, useEffect, useRef } from 'react';
import type { Location, NavigateFunction } from 'react-router';

interface UseOverlayNavigationStackInput {
    location: Location;
    navigate: NavigateFunction;
    fallbackPath?: string;
}

function locationToPath(location: Location): string {
    return `${location.pathname}${location.search}${location.hash}`;
}

export function useOverlayNavigationStack({
    location,
    navigate,
    fallbackPath = '/',
}: UseOverlayNavigationStackInput): { goBackWithinApp: () => void } {
    const stackRef = useRef<string[]>([]);
    const currentPath = locationToPath(location);

    useEffect(() => {
        const stack = stackRef.current;
        if (stack[stack.length - 1] === currentPath) {
            return;
        }

        stack.push(currentPath);
        if (stack.length > 30) {
            stack.shift();
        }
    }, [currentPath]);

    const goBackWithinApp = useCallback(() => {
        const stack = stackRef.current;
        const current = stack.pop();
        const previous = stack.pop();

        if (previous && previous !== current) {
            navigate(previous);
            return;
        }

        navigate(fallbackPath);
    }, [fallbackPath, navigate]);

    return { goBackWithinApp };
}
