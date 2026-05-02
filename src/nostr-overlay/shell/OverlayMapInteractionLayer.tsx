import { useEffect, useRef, useState } from 'react';
import type { UiSettingsState, UiTheme } from '../../nostr/ui-settings';
import type { NostrProfile } from '../../nostr/types';
import { profileHasZapEndpoint } from '../../nostr/zaps';
import { encodeHexToNpub } from '../../nostr/npub';
import { translate } from '@/i18n/translate';
import { Spinner } from '@/components/ui/spinner';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MapDisplayToggleControls } from '../components/MapDisplayToggleControls';
import { MapZoomControls } from '../components/MapZoomControls';
import { PersonContextMenuItems } from '../components/PersonContextMenuItems';
import type { ZapIntentInput } from '../controllers/use-wallet-zap-controller';
import type { MapBridge, OccupiedBuildingContextPayload } from '../map-bridge';
import { resolveNostrCityMapPreset } from '../map-colour-schemes';
import type { ResolvedOverlayTheme } from '../hooks/useOverlayTheme';
import { useMapBridgeController } from './use-map-bridge-controller';

interface OccupiedBuildingContextMenuState extends OccupiedBuildingContextPayload {
    nonce: number;
}

export interface OverlayMapInteractionLayerProps {
    mapBridge: MapBridge | null;
    isMapRoute: boolean;
    showLoginGate: boolean;
    viewportInsetLeft: number;
    resolvedOverlayTheme: ResolvedOverlayTheme;
    mapLoaderText: string | null;
    language: UiSettingsState['language'];
    streetLabelsEnabled: boolean;
    streetLabelsZoomLevel: number;
    streetLabelUsernames: string[];
    trafficParticlesCount: number;
    trafficParticlesSpeed: number;
    verifiedBuildingIndexes: number[];
    specialMarkersEnabled: boolean;
    profiles: Record<string, NostrProfile>;
    followerProfiles: Record<string, NostrProfile>;
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    mutedPubkeys?: string[];
    canWrite: boolean;
    canAccessDirectMessages: boolean;
    zapAmounts: number[];
    onRegenerateMap: () => void | Promise<void>;
    onThemeChange: (theme: Extract<UiTheme, 'light' | 'dark'>) => void;
    onCarsEnabledChange: (enabled: boolean) => void;
    onStreetLabelsEnabledChange: (enabled: boolean) => void;
    onSpecialMarkersEnabledChange: (enabled: boolean) => void;
    onCopyNpub: (npub: string) => void | Promise<void>;
    onOpenDirectMessage: (pubkey: string) => void | Promise<void>;
    onOpenProfile: (pubkey: string, buildingIndex: number) => void;
    onToggleMutePerson?: (pubkey: string) => void | Promise<void>;
    onRequestZapPayment: (input: ZapIntentInput) => Promise<void>;
    onConfigureZapAmounts: () => void;
}

function encodePubkeyAsNpub(pubkey: string): string {
    try {
        return encodeHexToNpub(pubkey);
    } catch {
        return pubkey;
    }
}

export function OverlayMapInteractionLayer({
    mapBridge,
    isMapRoute,
    showLoginGate,
    viewportInsetLeft,
    resolvedOverlayTheme,
    mapLoaderText,
    language,
    streetLabelsEnabled,
    streetLabelsZoomLevel,
    streetLabelUsernames,
    trafficParticlesCount,
    trafficParticlesSpeed,
    verifiedBuildingIndexes,
    specialMarkersEnabled,
    profiles,
    followerProfiles,
    ownerPubkey,
    ownerProfile,
    mutedPubkeys = [],
    canWrite,
    canAccessDirectMessages,
    zapAmounts,
    onRegenerateMap,
    onThemeChange,
    onCarsEnabledChange,
    onStreetLabelsEnabledChange,
    onSpecialMarkersEnabledChange,
    onCopyNpub,
    onOpenDirectMessage,
    onOpenProfile,
    onToggleMutePerson,
    onRequestZapPayment,
    onConfigureZapAmounts,
}: OverlayMapInteractionLayerProps) {
    const [buildingContextMenu, setBuildingContextMenu] = useState<OccupiedBuildingContextMenuState | null>(null);
    const contextMenuTriggerRef = useRef<HTMLSpanElement | null>(null);
    const contextMenuNonceRef = useRef(0);

    useMapBridgeController({
        mapBridge,
        viewportInsetLeft,
        showLoginGate,
        streetLabelsEnabled,
        streetLabelsZoomLevel,
        streetLabelUsernames,
        trafficParticlesCount,
        trafficParticlesSpeed,
        verifiedBuildingIndexes,
    });

    useEffect(() => {
        mapBridge?.setColourScheme?.(resolveNostrCityMapPreset(resolvedOverlayTheme));
    }, [mapBridge, resolvedOverlayTheme]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        return mapBridge.onOccupiedBuildingContextMenu((payload) => {
            if (showLoginGate) {
                return;
            }

            contextMenuNonceRef.current += 1;
            setBuildingContextMenu({
                ...payload,
                nonce: contextMenuNonceRef.current,
            });
        });
    }, [mapBridge, showLoginGate]);

    useEffect(() => {
        if (showLoginGate) {
            setBuildingContextMenu(null);
        }
    }, [showLoginGate]);

    useEffect(() => {
        if (!buildingContextMenu || !contextMenuTriggerRef.current) {
            return;
        }

        const target = contextMenuTriggerRef.current;
        const timer = window.setTimeout(() => {
            target.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: buildingContextMenu.clientX,
                clientY: buildingContextMenu.clientY,
            }));
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [buildingContextMenu]);

    const closeOccupiedContextMenu = (): void => {
        setBuildingContextMenu(null);
    };

    const contextMenuProfile = buildingContextMenu
        ? profiles[buildingContextMenu.pubkey]
            ?? followerProfiles[buildingContextMenu.pubkey]
            ?? (ownerPubkey === buildingContextMenu.pubkey ? ownerProfile : undefined)
        : undefined;
    const mutedSet = new Set(mutedPubkeys);
    const zapLabel = translate(language, 'notifications.kind.zap');
    const configureZapAmountsLabel = translate(language, 'note.actions.configureZapAmounts');

    return (
        <>
            {isMapRoute && !showLoginGate ? (
                <MapZoomControls
                    mapBridge={mapBridge}
                />
            ) : null}

            {isMapRoute && !showLoginGate ? (
                <MapDisplayToggleControls
                    carsEnabled={trafficParticlesCount > 0}
                    streetLabelsEnabled={streetLabelsEnabled}
                    specialMarkersEnabled={specialMarkersEnabled}
                    onCarsEnabledChange={onCarsEnabledChange}
                    onStreetLabelsEnabledChange={onStreetLabelsEnabledChange}
                    onSpecialMarkersEnabledChange={onSpecialMarkersEnabledChange}
                    onRegenerateMap={onRegenerateMap}
                    theme={resolvedOverlayTheme}
                    onThemeChange={onThemeChange}
                />
            ) : null}

            {buildingContextMenu ? (
                <div
                    className="nostr-context-anchor"
                    style={{
                        left: `${buildingContextMenu.clientX}px`,
                        top: `${buildingContextMenu.clientY}px`,
                    }}
                >
                    <ContextMenu key={buildingContextMenu.nonce}>
                        <ContextMenuTrigger asChild>
                            <span ref={contextMenuTriggerRef} className="nostr-context-anchor-trigger" aria-hidden="true" />
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                            <PersonContextMenuItems
                                testIdPrefix="context"
                                onCopyNpub={() => onCopyNpub(encodePubkeyAsNpub(buildingContextMenu.pubkey))}
                                {...(canAccessDirectMessages
                                    ? { onSendMessage: () => onOpenDirectMessage(buildingContextMenu.pubkey) }
                                    : {})}
                                onViewDetails={() => onOpenProfile(buildingContextMenu.pubkey, buildingContextMenu.buildingIndex)}
                                isMuted={mutedSet.has(buildingContextMenu.pubkey)}
                                {...(onToggleMutePerson && ownerPubkey !== buildingContextMenu.pubkey
                                    ? { onToggleMute: () => onToggleMutePerson(buildingContextMenu.pubkey) }
                                    : {})}
                                closeMenu={closeOccupiedContextMenu}
                            />

                            {canWrite && profileHasZapEndpoint(contextMenuProfile) ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger data-testid="context-zap-submenu">{zapLabel}</ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-44">
                                        {zapAmounts.map((amount) => (
                                            <ContextMenuItem
                                                data-testid={`context-zap-${amount}`}
                                                key={`zap-${amount}`}
                                                onSelect={() => {
                                                    closeOccupiedContextMenu();
                                                    void onRequestZapPayment({ targetPubkey: buildingContextMenu.pubkey, amount });
                                                }}
                                            >
                                                {translate(language, 'zaps.amountSats', { amount: String(amount) })}
                                            </ContextMenuItem>
                                        ))}
                                        <ContextMenuSeparator />
                                        <ContextMenuItem
                                            data-testid="context-zap-configure"
                                            onSelect={() => {
                                                closeOccupiedContextMenu();
                                                onConfigureZapAmounts();
                                            }}
                                        >
                                            {configureZapAmountsLabel}
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            ) : null}
                        </ContextMenuContent>
                    </ContextMenu>
                </div>
            ) : null}

            {mapLoaderText && !showLoginGate ? (
                <div className="nostr-map-loader-overlay" role="status" aria-live="polite">
                    <div className="nostr-map-loader-card">
                        <Spinner />
                        <p className="nostr-map-loader-text">{mapLoaderText}</p>
                    </div>
                </div>
            ) : null}
        </>
    );
}
