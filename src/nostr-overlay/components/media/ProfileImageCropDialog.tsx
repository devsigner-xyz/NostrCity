import { useEffect, useState, type RefObject } from 'react';
import { MinusIcon, MoveDownIcon, MoveLeftIcon, MoveRightIcon, MoveUpIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/i18n/useI18n';
import { getProfileImageCropPolicy, type ProfileImageKind } from '../../media/profile-image-processing';

export interface ProfileImageCropValue {
    zoom: number;
    offsetX: number;
    offsetY: number;
}

interface ProfileImageCropDialogProps {
    open: boolean;
    kind: ProfileImageKind;
    previewUrl: string;
    fileName: string;
    returnFocusRef?: RefObject<HTMLElement | null>;
    onOpenChange: (open: boolean) => void;
    onApply: (crop: ProfileImageCropValue) => void;
}

const MOVE_STEP = 5;
const ZOOM_STEP = 0.1;

export function ProfileImageCropDialog({
    open,
    kind,
    previewUrl,
    fileName,
    returnFocusRef,
    onOpenChange,
    onApply,
}: ProfileImageCropDialogProps) {
    const { t } = useI18n();
    const [crop, setCrop] = useState<ProfileImageCropValue>({ zoom: 1, offsetX: 0, offsetY: 0 });
    const policy = getProfileImageCropPolicy(kind);

    useEffect(() => {
        if (open) {
            setCrop({ zoom: 1, offsetX: 0, offsetY: 0 });
        }
    }, [open, kind, previewUrl]);

    const closeDialog = (): void => {
        onOpenChange(false);
        window.setTimeout(() => returnFocusRef?.current?.focus(), 0);
    };

    const setZoom = (zoom: number): void => {
        setCrop((current) => ({ ...current, zoom: clampZoom(zoom) }));
    };

    const moveCrop = (deltaX: number, deltaY: number): void => {
        setCrop((current) => ({
            ...current,
            offsetX: current.offsetX + deltaX,
            offsetY: current.offsetY + deltaY,
        }));
    };

    const resetCrop = (): void => {
        setCrop({ zoom: 1, offsetX: 0, offsetY: 0 });
    };

    const title = kind === 'avatar' ? t('profileImageCrop.avatarTitle') : t('profileImageCrop.bannerTitle');
    const instructions = kind === 'avatar' ? t('profileImageCrop.avatarInstructions') : t('profileImageCrop.bannerInstructions');

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            if (!nextOpen) {
                closeDialog();
                return;
            }

            onOpenChange(true);
        }}>
            <DialogContent
                className="max-w-lg gap-0 overflow-hidden p-0"
                aria-describedby="profile-image-crop-instructions"
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        closeDialog();
                    }
                }}
            >
                <DialogHeader className="gap-2 px-4 pb-3 pt-4 sm:px-5">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription id="profile-image-crop-instructions">
                        {instructions}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 px-4 pb-4 sm:px-5">
                    <div className="overflow-hidden rounded-xl border bg-muted/40" data-aspect-ratio={policy.aspectRatio}>
                        <img
                            src={previewUrl}
                            alt={t('profileImageCrop.previewAlt')}
                            className="max-h-80 w-full object-contain"
                            style={{
                                transform: `translate(${crop.offsetX}px, ${crop.offsetY}px) scale(${crop.zoom})`,
                                transformOrigin: 'center',
                            }}
                        />
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="icon-sm" aria-label={t('profileImageCrop.zoomOut')} onClick={() => setZoom(crop.zoom - ZOOM_STEP)}>
                                <MinusIcon aria-hidden="true" />
                            </Button>
                            <label className="sr-only" htmlFor="profile-image-crop-zoom">{t('profileImageCrop.zoom')}</label>
                            <input
                                id="profile-image-crop-zoom"
                                type="range"
                                min="1"
                                max="3"
                                step="0.1"
                                value={crop.zoom}
                                role="slider"
                                aria-label={t('profileImageCrop.zoom')}
                                className="h-2 flex-1 accent-primary"
                                onChange={(event) => setZoom(Number(event.currentTarget.value))}
                            />
                            <Button type="button" variant="outline" size="icon-sm" aria-label={t('profileImageCrop.zoomIn')} onClick={() => setZoom(crop.zoom + ZOOM_STEP)}>
                                <PlusIcon aria-hidden="true" />
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2" aria-label={t('profileImageCrop.moveControls')}>
                            <Button type="button" variant="outline" size="icon-sm" aria-label={t('profileImageCrop.moveLeft')} onClick={() => moveCrop(-MOVE_STEP, 0)}>
                                <MoveLeftIcon aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="outline" size="icon-sm" aria-label={t('profileImageCrop.moveRight')} onClick={() => moveCrop(MOVE_STEP, 0)}>
                                <MoveRightIcon aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="outline" size="icon-sm" aria-label={t('profileImageCrop.moveUp')} onClick={() => moveCrop(0, -MOVE_STEP)}>
                                <MoveUpIcon aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="outline" size="icon-sm" aria-label={t('profileImageCrop.moveDown')} onClick={() => moveCrop(0, MOVE_STEP)}>
                                <MoveDownIcon aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={resetCrop}>
                                {t('profileImageCrop.reset')}
                            </Button>
                        </div>

                        <p className="truncate text-xs text-muted-foreground">{fileName}</p>
                    </div>
                </div>

                <DialogFooter className="px-4 sm:px-5">
                    <Button type="button" variant="outline" onClick={closeDialog}>
                        {t('profileImageCrop.cancel')}
                    </Button>
                    <Button type="button" onClick={() => onApply(crop)}>
                        {t('profileImageCrop.apply')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function clampZoom(value: number): number {
    return Math.min(3, Math.max(1, Number(value.toFixed(2))));
}
