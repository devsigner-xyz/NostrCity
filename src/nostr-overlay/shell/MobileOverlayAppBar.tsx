import { ArrowLeftIcon, MenuIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';

interface MobileOverlayAppBarProps {
    title: string;
    showBack: boolean;
    onBack: () => void;
}

export function MobileOverlayAppBar({ title, showBack, onBack }: MobileOverlayAppBarProps) {
    const { t } = useI18n();
    const { isMobile, setOpenMobile } = useSidebar();
    const isHome = !showBack;

    if (!isMobile) {
        return null;
    }

    return (
        <header
            data-testid="mobile-overlay-app-bar"
            className={cn('nostr-mobile-app-bar md:hidden', isHome && 'nostr-mobile-app-bar-home')}
            aria-label={t('navigation.mobileHeader')}
        >
            <div className="nostr-mobile-app-bar-main">
                {showBack ? (
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
                ) : (
                    <img
                        data-testid="mobile-overlay-app-bar-logo"
                        className="nostr-mobile-app-bar-logo"
                        src="/icon-light-48x48.png"
                        alt=""
                        aria-hidden="true"
                    />
                )}
                <h1 className={cn('nostr-mobile-app-bar-title', isHome && 'nostr-mobile-app-bar-title-center')}>{title}</h1>
            </div>

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
        </header>
    );
}
