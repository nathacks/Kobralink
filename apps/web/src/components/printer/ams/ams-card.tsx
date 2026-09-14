import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLiveState } from '@/hooks/use-printers';
import { rgbCss, textOn } from '@/lib/color';
import { m } from '@/lib/i18n';
import { AMS_ACTIVITY_LABEL, FILAMENT_MODE_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { AceControls } from './ace-controls';
import { SlotForm } from './slot-form';

export function AmsCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const slots = [...state.amsSlots].sort((a, b) => a.globalIndex - b.globalIndex);
    const loaded = slots.find((s) => s.globalIndex === state.amsLoadedSlot);
    const openDialog = confirmationDialogStore.actions.openDialog;
    const offline = !state.connected;
    const busy = state.printState === 'printing';

    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">{m.ams_title()}</CardTitle>
                <CardDescription>{FILAMENT_MODE_LABEL[state.filamentMode]?.()}</CardDescription>
                <CardAction className="text-sm text-muted-foreground">
                    {loaded ? m.ams_loaded_type({ type: loaded.type || '?' }) : m.ams_none_loaded()}
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-5">
                {slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{m.ams_no_slots()}</p>
                ) : (
                    <div className="flex flex-wrap gap-3">
                        {slots.map((s) => {
                            const isLoaded = s.globalIndex === state.amsLoadedSlot;
                            const empty = s.status !== 5;
                            const activity = AMS_ACTIVITY_LABEL[s.activity]?.();
                            return (
                                <button
                                    type="button"
                                    key={s.globalIndex}
                                    disabled={offline}
                                    onClick={() =>
                                        openDialog({
                                            title: m.ams_slot_title({
                                                n: s.index + 1,
                                                unit: s.boxId >= 0 ? m.ace_unit({ n: s.boxId + 1 }) : m.ams_toolhead(),
                                            }),
                                            description: m.ams_slot_hint(),
                                            content: <SlotForm key={s.globalIndex} printerId={printerId} slot={s} />,
                                        })
                                    }
                                    className="group flex w-14 cursor-pointer flex-col items-center gap-1.5 rounded-2xl outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    title={empty ? m.ams_slot_empty() : m.ams_slot_edit({ type: s.type })}
                                >
                                    <div
                                        className={cn(
                                            'flex size-14 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all group-enabled:group-hover:scale-105 group-enabled:group-hover:shadow-md',
                                            empty
                                                ? 'border-dashed border-muted-foreground/40 text-muted-foreground group-enabled:group-hover:border-muted-foreground/70 group-enabled:group-hover:bg-muted'
                                                : 'border-transparent group-enabled:group-hover:brightness-110',
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
                                        {empty ? m.ams_empty() : activity && !isLoaded ? activity : s.type || '?'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {state.aceUnits.length > 0 && (
                    <AceControls printerId={printerId} units={state.aceUnits} disabled={offline} busy={busy} />
                )}
            </CardContent>
        </Card>
    );
}
