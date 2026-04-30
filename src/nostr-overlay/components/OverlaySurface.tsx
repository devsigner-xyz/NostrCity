import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface OverlaySurfaceProps {
    ariaLabel: string;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    contentTestId?: string;
}

export function OverlaySurface({
    ariaLabel,
    children,
    className,
    contentClassName,
    contentTestId = 'overlay-surface-content',
}: OverlaySurfaceProps) {
    return (
        <section
            aria-label={ariaLabel}
            className={cn(
                'fixed inset-y-0 left-[var(--nostr-map-inset-left)] z-[9] w-[calc(100%-var(--nostr-map-inset-left))] bg-background/95 max-[720px]:left-0 max-[720px]:w-screen',
                className,
            )}
        >
            <div
                data-testid={contentTestId}
                className={cn(
                    'nostr-overlay-surface-content flex h-full w-full flex-col gap-2.5 overflow-hidden bg-overlay-surface p-3 text-foreground backdrop-blur-sm',
                    contentClassName,
                )}
            >
                <div data-slot="overlay-surface-body" className="flex min-h-0 w-full flex-1 flex-col">
                    {children}
                </div>
            </div>
        </section>
    );
}
