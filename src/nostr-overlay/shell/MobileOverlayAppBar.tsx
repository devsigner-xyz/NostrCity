import { ArrowLeftIcon, MenuIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';

interface MobileOverlayAppBarProps {
    title: string;
    showBack: boolean;
    showMenu?: boolean;
    onBack: () => void;
}

export function MobileOverlayAppBar({ title, showBack, showMenu = true, onBack }: MobileOverlayAppBarProps) {
    const { t } = useI18n();
    const { isMobile, setOpenMobile } = useSidebar();
    const isHome = !showBack;
    const menuButton = (
        <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="nostr-mobile-app-bar-button"
            aria-label={t('sidebar.openNavigation')}
            title={t('sidebar.openNavigation')}
            onClick={() => setOpenMobile(true)}
        >
            <MenuIcon aria-hidden="true" />
        </Button>
    );

    if (!isMobile) {
        return null;
    }

    return (
        <header
            data-testid="mobile-overlay-app-bar"
            className={cn('nostr-mobile-app-bar md:hidden', isHome && 'nostr-mobile-app-bar-home')}
            aria-label={t('navigation.mobileHeader')}
        >
            {isHome ? (
                <>
                    {menuButton}
                    <h1 className="nostr-mobile-app-bar-title nostr-mobile-app-bar-title-center">{title}</h1>
                    <span className="nostr-mobile-app-bar-spacer" aria-hidden="true" />
                </>
            ) : (
                <>
                    <div className="nostr-mobile-app-bar-main">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="nostr-mobile-app-bar-button"
                            aria-label={t('navigation.back')}
                            title={t('navigation.back')}
                            onClick={onBack}
                        >
                            <ArrowLeftIcon aria-hidden="true" />
                        </Button>
                        <h1 className="nostr-mobile-app-bar-title">{title}</h1>
                    </div>
                    {showMenu ? menuButton : null}
                </>
            )}
        </header>
    );
}
