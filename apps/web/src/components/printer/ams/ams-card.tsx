import { aceSlotStatus } from '@farolprint/shared';
import { Panel } from '@/components/printer/panel';
import { useLiveState } from '@/hooks/use-printers';
import { useExternalSpool } from '@/hooks/use-slot-spool';
import { rgbCss } from '@/lib/color';
import { m } from '@/lib/i18n';
import { ACE_SLOT_STATUS_LABEL, AMS_ACTIVITY_LABEL, FILAMENT_MODE_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { AceControls } from './ace-controls';
import { ExternalSpoolForm } from './external-spool-form';
import { SlotForm } from './slot-form';
import { SlotSpool, SpoolTileBody } from './spool-art';

export function AmsCard({ printerId, className }: { printerId: string; className?: string }) {
    const state = useLiveState(printerId);
    const slots = [...state.amsSlots].sort((a, b) => a.globalIndex - b.globalIndex);
    const loaded = slots.find((s) => s.globalIndex === state.amsLoadedSlot);
    const openDialog = confirmationDialogStore.actions.openDialog;
    const offline = !state.connected;
    const busy = state.printState === 'printing';

    const status = loaded
        ? m.ams_loaded_type({ type: loaded.type || '?' })
        : state.externalSpoolOnly
          ? null
          : m.ams_none_loaded();

    return (
        <Panel
            className={className}
            title={m.ams_title()}
            description={FILAMENT_MODE_LABEL[state.filamentMode]?.()}
            action={
                status && (
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{status}</span>
                )
            }
        >
            <div className="flex flex-col gap-5">
                {slots.length === 0 ? (
                    state.externalSpoolOnly ? (
                        <ExternalSpoolSlot printerId={printerId} disabled={offline} />
                    ) : (
                        <p className="text-sm text-muted-foreground">{m.ams_no_slots()}</p>
                    )
                ) : (
                    <div className={GRID}>
                        {slots.map((s) => {
                            const isLoaded = s.globalIndex === state.amsLoadedSlot;
                            const empty = s.status !== 5 && !s.type;
                            const activity = AMS_ACTIVITY_LABEL[s.activity]?.();
                            const slotStatus = aceSlotStatus(s.status);
                            const statusLabel =
                                s.boxId >= 0 && slotStatus ? ACE_SLOT_STATUS_LABEL[slotStatus]?.() : undefined;
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
                                    className={TILE}
                                    title={empty ? m.ams_slot_empty() : m.ams_slot_edit({ type: s.type })}
                                >
                                    <SlotSpool
                                        printerId={printerId}
                                        slotKey={String(s.globalIndex)}
                                        color={rgbCss(s.color)}
                                        empty={empty}
                                        remainingPct={s.remainingPct}
                                        className={cn(
                                            (s.activity === 'feeding' || s.activity === 'retracting') &&
                                                'animate-pulse',
                                        )}
                                    >
                                        <TileHeader
                                            title={
                                                empty
                                                    ? m.ams_empty()
                                                    : activity && !isLoaded
                                                      ? activity
                                                      : (statusLabel ?? (s.type || '?'))
                                            }
                                            badge={s.index + 1}
                                        />
                                    </SlotSpool>
                                </button>
                            );
                        })}
                    </div>
                )}

                {state.aceUnits.length > 0 && (
                    <AceControls printerId={printerId} units={state.aceUnits} disabled={offline} busy={busy} />
                )}
            </div>
        </Panel>
    );
}

function ExternalSpoolSlot({ printerId, disabled }: { printerId: string; disabled: boolean }) {
    const { hex, material, fraction } = useExternalSpool(printerId);
    const openDialog = confirmationDialogStore.actions.openDialog;

    return (
        <div className={GRID}>
            <button
                type="button"
                disabled={disabled}
                onClick={() =>
                    openDialog({
                        title: m.ams_external_spool(),
                        description: m.ams_external_spool_hint(),
                        content: <ExternalSpoolForm printerId={printerId} />,
                    })
                }
                className={TILE}
                title={m.ams_external_spool()}
            >
                <SpoolTileBody color={hex} fraction={hex ? fraction : undefined}>
                    <TileHeader title={material ?? m.ams_external_spool_empty()} badge="E" />
                </SpoolTileBody>
            </button>
        </div>
    );
}

const GRID = 'grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3';

const TILE =
    'flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-2xl bg-secondary/60 p-3 text-left outline-none transition-colors enabled:hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

function TileHeader({ title, badge }: { title: string; badge: React.ReactNode }) {
    return (
        <span className="flex w-full items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{title}</span>
            <span className="shrink-0 text-muted-foreground">{badge}</span>
        </span>
    );
}
