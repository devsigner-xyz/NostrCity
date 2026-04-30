import { ArrowLeftIcon, MenuIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { useI18n } from '@/i18n/useI18n';

interface MobileOverlayAppBarProps {
    title: string;
    showBack: boolean;
    onBack: () => void;
}

export function MobileOverlayAppBar({ title, showBack, onBack }: MobileOverlayAppBarProps) {
    const { t } = useI18n();
    const { isMobile, setOpenMobile } = useSidebar();

    if (!isMobile) {
        return null;
    }

    return (
        <header
            data-testid="mobile-overlay-app-bar"
            className="nostr-mobile-app-bar md:hidden"
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
                ) : null}
                <h1 className="nostr-mobile-app-bar-title">{title}</h1>
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
