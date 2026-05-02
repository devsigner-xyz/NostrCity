import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/i18n/useI18n';
import { useState } from 'react';

export interface NostrGroupRelaySummary {
    relayUrl: string;
    groupCount: number;
    savedCount: number;
    rememberedCount: number;
    isConfigured: boolean;
}

interface GroupRelaySelectProps {
    relays: NostrGroupRelaySummary[];
    selectedRelayUrl: string | null;
    onSelectRelay: (relayUrl: string | null) => void;
    onAddCustomGroupRelay: (relayUrl: string) => void;
}

const ADD_RELAY_VALUE = '__add_group_relay__';
const ALL_RELAYS_VALUE = '__all_group_relays__';

export function GroupRelaySelect({ relays, selectedRelayUrl, onSelectRelay, onAddCustomGroupRelay }: GroupRelaySelectProps) {
    const { t } = useI18n();
    const [customRelay, setCustomRelay] = useState('');
    const [addRelayOpen, setAddRelayOpen] = useState(false);

    const addCustomRelay = (): void => {
        const relay = customRelay.trim();
        if (!relay) {
            return;
        }

        onAddCustomGroupRelay(relay);
        setCustomRelay('');
        setAddRelayOpen(false);
    };

    const handleRelayChange = (value: string): void => {
        if (value === ADD_RELAY_VALUE) {
            setAddRelayOpen(true);
            return;
        }

        onSelectRelay(value === ALL_RELAYS_VALUE ? null : value);
    };

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
            <FieldLabel htmlFor="group-relay-select">{t('groups.relays.title')}</FieldLabel>
            <Dialog open={addRelayOpen} onOpenChange={setAddRelayOpen}>
                <Select value={selectedRelayUrl ?? ALL_RELAYS_VALUE} onValueChange={handleRelayChange}>
                    <SelectTrigger id="group-relay-select" className="w-full" aria-label={t('groups.relays.aria')}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectItem value={ADD_RELAY_VALUE}>{t('groups.relays.addCustom')}</SelectItem>
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                            <SelectItem value={ALL_RELAYS_VALUE}>{t('groups.relays.all')}</SelectItem>
                            {relays.map((relay) => (
                                <SelectItem key={relay.relayUrl} value={relay.relayUrl}>
                                    {relay.relayUrl} ({relay.groupCount})
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('groups.relays.addDialogTitle')}</DialogTitle>
                        <DialogDescription>{t('groups.relays.customDescription')}</DialogDescription>
                    </DialogHeader>
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="custom-group-relay">{t('groups.relays.customLabel')}</FieldLabel>
                            <Input
                                id="custom-group-relay"
                                aria-label={t('groups.relays.customAria')}
                                value={customRelay}
                                onChange={(event) => setCustomRelay(event.currentTarget.value)}
                                placeholder="wss://groups.example"
                            />
                            <FieldDescription>{t('groups.relays.customDescription')}</FieldDescription>
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <Button
                            type="button"
                            aria-label={t('groups.relays.addCustomAria')}
                            onClick={addCustomRelay}
                        >
                            {t('groups.relays.addCustom')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
