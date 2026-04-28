import { useEffect, useState } from 'react';
import type { UiSettingsState } from '../../nostr/ui-settings';
import type { MapBridge } from '../map-bridge';
import { useI18n } from '@/i18n/useI18n';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SettingsUiPage } from './settings-pages/SettingsUiPage';

interface UiSettingsDialogProps {
    open: boolean;
    uiSettings: UiSettingsState;
    onPersistUiSettings: (nextState: UiSettingsState) => void;
    onOpenChange: (open: boolean) => void;
    mapBridge?: MapBridge | null;
}

export function UiSettingsDialog({ open, uiSettings, onPersistUiSettings, onOpenChange, mapBridge }: UiSettingsDialogProps) {
    const { t } = useI18n();
    const [mapColourScheme, setMapColourScheme] = useState<string | undefined>(() => mapBridge?.getColourScheme?.());
    const mapColourSchemeNames = mapBridge?.listColourSchemes?.() ?? [];

    useEffect(() => {
        setMapColourScheme(mapBridge?.getColourScheme?.());
    }, [mapBridge, uiSettings.theme]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="nostr-settings-dialog nostr-settings-dialog-ui"
                overlayClassName="nostr-settings-dialog-overlay-clear"
            >
                <DialogTitle className="sr-only">{t('settings.ui.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('settings.ui.description')}</DialogDescription>
                <SettingsUiPage
                    uiSettings={uiSettings}
                    onPersistUiSettings={onPersistUiSettings}
                    mapColourScheme={mapColourScheme}
                    mapColourSchemeNames={mapColourSchemeNames}
                    onMapColourSchemeChange={(scheme) => {
                        mapBridge?.setColourScheme?.(scheme);
                        setMapColourScheme(scheme);
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}
