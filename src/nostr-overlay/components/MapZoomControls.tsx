import { useEffect, useState } from 'react';
import { MoonIcon, RefreshCcwIcon, SunIcon } from 'lucide-react';
import type { MapBridge } from '../map-bridge';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { ButtonGroupText } from '@/components/ui/button-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type MapQuickTheme = 'light' | 'dark';

interface MapZoomControlsProps {
    mapBridge: MapBridge | null;
    onRegenerateMap?: () => void | Promise<void>;
    regenerateDisabled?: boolean;
    theme?: MapQuickTheme;
    onThemeChange?: (theme: MapQuickTheme) => void;
}

function clampZoom(value: number): number {
    return Math.max(0.3, Math.min(20, value));
}

function dispatchMapWheel(deltaY: number): void {
    const canvas = document.getElementById('map-canvas');
    if (!canvas) {
        return;
    }

    const event = typeof WheelEvent === 'function'
        ? new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY,
        })
        : new Event('wheel', {
            bubbles: true,
            cancelable: true,
        });
    canvas.dispatchEvent(event);
}

export function MapZoomControls({
    mapBridge,
    onRegenerateMap,
    regenerateDisabled = false,
    theme = 'light',
    onThemeChange,
}: MapZoomControlsProps) {
    const { t } = useI18n();
    const [zoom, setZoom] = useState(1);

    useEffect(() => {
        if (!mapBridge) {
            setZoom(1);
            return;
        }

        const refresh = (): void => {
            setZoom(clampZoom(mapBridge.getZoom()));
        };

        refresh();
        return mapBridge.onViewChanged(refresh);
    }, [mapBridge]);

    const onZoomIn = (): void => {
        const targetZoom = clampZoom(zoom + 1);
        setZoom(targetZoom);
        if (mapBridge?.setZoom) {
            mapBridge.setZoom(targetZoom);
            return;
        }

        dispatchMapWheel(-100);
    };

    const onZoomOut = (): void => {
        const targetZoom = clampZoom(zoom - 1);
        setZoom(targetZoom);
        if (mapBridge?.setZoom) {
            mapBridge.setZoom(targetZoom);
            return;
        }

        dispatchMapWheel(100);
    };

    return (
        <div className="nostr-map-zoom-controls" aria-label={t('mapZoom.controls')}>
            <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={1}
                value={theme}
                onValueChange={(value) => {
                    if (value === 'light' || value === 'dark') {
                        onThemeChange?.(value);
                    }
                }}
                className="nostr-map-theme-toggle-group"
                aria-label={t('settings.ui.theme.label')}
            >
                <ToggleGroupItem className="nostr-map-theme-toggle-button" value="light" aria-label={t('settings.ui.theme.lightAria')} title={t('settings.ui.theme.light')}>
                    <SunIcon aria-hidden="true" focusable="false" />
                </ToggleGroupItem>
                <ToggleGroupItem className="nostr-map-theme-toggle-button" value="dark" aria-label={t('settings.ui.theme.darkAria')} title={t('settings.ui.theme.dark')}>
                    <MoonIcon aria-hidden="true" focusable="false" />
                </ToggleGroupItem>
            </ToggleGroup>

            <div role="group" className="nostr-map-zoom-group">
                <Button type="button" variant="outline" size="icon-sm" className="nostr-map-zoom-button nostr-map-zoom-button-left" aria-label={t('mapZoom.out')} onClick={onZoomOut}>
                    -
                </Button>

                <ButtonGroupText className="nostr-map-zoom-level" aria-live="polite">{`${zoom.toFixed(2)}x`}</ButtonGroupText>

                <Button type="button" variant="outline" size="icon-sm" className="nostr-map-zoom-button nostr-map-zoom-button-right" aria-label={t('mapZoom.in')} onClick={onZoomIn}>
                    +
                </Button>
            </div>

            <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="nostr-map-regenerate-button"
                aria-label={t('mapZoom.regenerate')}
                title={t('mapZoom.newMap')}
                disabled={regenerateDisabled || !onRegenerateMap}
                onClick={() => {
                    void onRegenerateMap?.();
                }}
            >
                <RefreshCcwIcon aria-hidden="true" focusable="false" />
            </Button>
        </div>
    );
}
