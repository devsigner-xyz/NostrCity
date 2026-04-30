import { RefreshCcwIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';

type MapOptionsTheme = 'light' | 'dark';

interface MapDisplayToggleControlsProps {
    carsEnabled: boolean;
    streetLabelsEnabled: boolean;
    specialMarkersEnabled: boolean;
    onCarsEnabledChange: (enabled: boolean) => void;
    onStreetLabelsEnabledChange: (enabled: boolean) => void;
    onSpecialMarkersEnabledChange: (enabled: boolean) => void;
    onRegenerateMap?: () => void | Promise<void>;
    regenerateDisabled?: boolean;
    theme?: MapOptionsTheme;
    onThemeChange?: (theme: MapOptionsTheme) => void;
}

export function MapDisplayToggleControls({
    carsEnabled,
    streetLabelsEnabled,
    specialMarkersEnabled,
    onCarsEnabledChange,
    onStreetLabelsEnabledChange,
    onSpecialMarkersEnabledChange,
    onRegenerateMap,
    regenerateDisabled = false,
    theme = 'light',
    onThemeChange,
}: MapDisplayToggleControlsProps) {
    const { t } = useI18n();
    const darkModeEnabled = theme === 'dark';
    const setDarkMode = (enabled: boolean): void => {
        onThemeChange?.(enabled ? 'dark' : 'light');
    };

    return (
        <div className="nostr-map-display-controls" aria-label={t('mapDisplay.controls')}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon-sm" className="nostr-map-options-button" aria-label={t('mapDisplay.options')} title={t('mapDisplay.options')}>
                        <SlidersHorizontalIcon aria-hidden="true" focusable="false" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-48">
                    <DropdownMenuItem
                        className="nostr-map-theme-switch-item justify-between"
                        onSelect={(event) => {
                            event.preventDefault();
                            setDarkMode(!darkModeEnabled);
                        }}
                    >
                        <span>{t('mapDisplay.darkMode')}</span>
                        <Switch
                            aria-label={t('mapDisplay.darkMode')}
                            checked={darkModeEnabled}
                            onClick={(event) => event.stopPropagation()}
                            onCheckedChange={setDarkMode}
                        />
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem checked={carsEnabled} onCheckedChange={(checked) => onCarsEnabledChange(Boolean(checked))}>
                        {t('mapDisplay.cars')}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={streetLabelsEnabled} onCheckedChange={(checked) => onStreetLabelsEnabledChange(Boolean(checked))}>
                        {t('mapDisplay.streetLabels')}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={specialMarkersEnabled} onCheckedChange={(checked) => onSpecialMarkersEnabledChange(Boolean(checked))}>
                        {t('mapDisplay.specialIcons')}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={regenerateDisabled || !onRegenerateMap} onSelect={() => { void onRegenerateMap?.(); }}>
                        <RefreshCcwIcon aria-hidden="true" focusable="false" />
                        {t('mapZoom.regenerate')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
