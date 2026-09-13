import type { PrinterLiveState } from '@kobralink/shared';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { rgbCss, textOn } from '@/lib/color';
import { AMS_ACTIVITY_LABEL, FILAMENT_MODE_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { useConfirmationDialogStore } from '@/stores/confirmation-dialog';
import { AceControls } from './ace-controls';
import { SlotForm } from './slot-form';

export function AmsCard({ printerId, state }: { printerId: string; state: PrinterLiveState }) {
    const slots = [...state.amsSlots].sort((a, b) => a.globalIndex - b.globalIndex);
    const loaded = slots.find((s) => s.globalIndex === state.amsLoadedSlot);
    const openDialog = useConfirmationDialogStore((s) => s.openDialog);
    const offline = !state.connected;
    const busy = state.printState === 'printing';

    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">Filaments</CardTitle>
                <CardDescription>{FILAMENT_MODE_LABEL[state.filamentMode]}</CardDescription>
                <CardAction className="text-sm text-muted-foreground">
                    {loaded ? `${loaded.type || '?'} chargé` : 'Aucun chargé'}
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-5">
                {slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun slot détecté.</p>
                ) : (
                    <div className="flex flex-wrap gap-3">
                        {slots.map((s) => {
                            const isLoaded = s.globalIndex === state.amsLoadedSlot;
                            const empty = s.status !== 5;
                            const activity = AMS_ACTIVITY_LABEL[s.activity];
                            return (
                                <button
                                    type="button"
                                    key={s.globalIndex}
                                    disabled={offline}
                                    onClick={() =>
                                        openDialog({
                                            title: `Slot ${s.index + 1} · ${s.boxId >= 0 ? `ACE ${s.boxId + 1}` : 'Tête'}`,
                                            description:
                                                'Matière et couleur sont écrites sur l\'écran de l\'imprimante. Le chargement déplace le filament jusqu\'à la buse.',
                                            content: <SlotForm key={s.globalIndex} printerId={printerId} slot={s}/>,
                                        })
                                    }
                                    className="flex w-14 flex-col items-center gap-1.5 rounded-2xl outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                                    title={empty ? 'Slot vide' : `${s.type} — modifier`}
                                >
                                    <div
                                        className={cn(
                                            'flex size-14 items-center justify-center rounded-full border-2 text-sm font-semibold',
                                            empty
                                                ? 'border-dashed border-muted-foreground/40 text-muted-foreground'
                                                : 'border-transparent',
                                            isLoaded && 'ring-4 ring-primary/40',
                                            (s.activity === 'feeding' || s.activity === 'retracting') &&
                                            'animate-pulse',
                                        )}
                                        style={
                                            empty ? undefined : { background: rgbCss(s.color), color: textOn(s.color) }
                                        }
                                    >
                                        {s.index + 1}
                                    </div>
                                    <div className="w-full truncate text-center text-xs text-muted-foreground">
                                        {empty ? 'Vide' : activity && !isLoaded ? activity : s.type || '?'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {state.aceUnits.length > 0 && (
                    <AceControls printerId={printerId} units={state.aceUnits} disabled={offline} busy={busy}/>
                )}
            </CardContent>
        </Card>
    );
}
