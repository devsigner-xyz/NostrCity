import { ContextMenuItem } from '@/components/ui/context-menu';
import { useI18n } from '@/i18n/useI18n';

interface PersonContextMenuItemsProps {
    onCopyNpub?: () => void | Promise<void>;
    onSendMessage?: () => void | Promise<void>;
    onViewDetails?: () => void | Promise<void>;
    onLocateOnMap?: () => void | Promise<void>;
    isMuted?: boolean;
    onToggleMute?: () => void | Promise<void>;
    closeMenu?: () => void;
    testIdPrefix?: string;
}

function prefixedTestId(prefix: string | undefined, suffix: string): string | undefined {
    if (!prefix) {
        return undefined;
    }

    return `${prefix}-${suffix}`;
}

export function PersonContextMenuItems({
    onCopyNpub,
    onSendMessage,
    onViewDetails,
    onLocateOnMap,
    isMuted = false,
    onToggleMute,
    closeMenu,
    testIdPrefix,
}: PersonContextMenuItemsProps) {
    const { t } = useI18n();
    const run = (action?: () => void | Promise<void>) => {
        if (!action) {
            return;
        }

        void action();
        closeMenu?.();
    };

    return (
        <>
            {onLocateOnMap ? (
                <ContextMenuItem onSelect={() => run(onLocateOnMap)}>
                    {t('personMenu.locateOnMap')}
                </ContextMenuItem>
            ) : null}
            {onCopyNpub ? (
                <ContextMenuItem
                    data-testid={prefixedTestId(testIdPrefix, 'copy-npub')}
                    onSelect={() => run(onCopyNpub)}
                >
                    {t('personMenu.copyNpub')}
                </ContextMenuItem>
            ) : null}
            {onSendMessage ? (
                <ContextMenuItem
                    data-testid={prefixedTestId(testIdPrefix, 'write-dm')}
                    onSelect={() => run(onSendMessage)}
                >
                    {t('personMenu.sendMessage')}
                </ContextMenuItem>
            ) : null}
            {onViewDetails ? (
                <ContextMenuItem
                    data-testid={prefixedTestId(testIdPrefix, 'view-details')}
                    onSelect={() => run(onViewDetails)}
                >
                    {t('personMenu.viewDetails')}
                </ContextMenuItem>
            ) : null}
            {onToggleMute ? (
                <ContextMenuItem
                    data-testid={prefixedTestId(testIdPrefix, 'toggle-mute')}
                    onSelect={() => run(onToggleMute)}
                >
                    {isMuted ? t('personMenu.unmute') : t('personMenu.mute')}
                </ContextMenuItem>
            ) : null}
        </>
    );
}
