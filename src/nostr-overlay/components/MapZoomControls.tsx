import { useEffect, useState } from 'react';
import type { MapBridge } from '../map-bridge';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { ButtonGroupText } from '@/components/ui/button-group';

interface MapZoomControlsProps {
    mapBridge: MapBridge | null;
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
            <div role="group" className="nostr-map-zoom-group">
                <Button type="button" variant="outline" size="icon-sm" className="nostr-map-zoom-button nostr-map-zoom-button-left" aria-label={t('mapZoom.out')} onClick={onZoomOut}>
                    -
                </Button>

                <ButtonGroupText className="nostr-map-zoom-level" aria-live="polite">{`${zoom.toFixed(2)}x`}</ButtonGroupText>

                <Button type="button" variant="outline" size="icon-sm" className="nostr-map-zoom-button nostr-map-zoom-button-right" aria-label={t('mapZoom.in')} onClick={onZoomIn}>
                    +
                </Button>
            </div>

        </div>
    );
}
