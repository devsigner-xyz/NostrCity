import { useCallback, useEffect, useRef } from 'react';
import { useNavigationType, type Location, type NavigateFunction } from 'react-router';

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
    const navigationType = useNavigationType();

    useEffect(() => {
        const stack = stackRef.current;

        if (navigationType === 'REPLACE') {
            if (stack.length === 0) {
                stack.push(currentPath);
                return;
            }

            stack[stack.length - 1] = currentPath;
            if (stack.length > 1 && stack[stack.length - 2] === currentPath) {
                stack.pop();
            }
            return;
        }

        if (stack[stack.length - 1] === currentPath) {
            return;
        }

        stack.push(currentPath);
        if (stack.length > 30) {
            stack.shift();
        }
    }, [currentPath, navigationType]);

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
