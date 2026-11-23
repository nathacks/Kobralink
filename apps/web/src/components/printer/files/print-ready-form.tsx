import {
    type AmsSlot,
    type FilamentAssignment,
    type GcodeFilament,
    type GcodeFileDto,
    materialFamily,
    type QueueTarget,
    type SlotFilamentInfo,
    slotUsableForPrint,
    supportsPrintOption,
} from '@kobralink/shared';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    ArrowRight,
    AudioWaveform,
    CalendarClock,
    ChevronDown,
    Clock,
    Droplets,
    Film,
    Grid3x3,
    Layers,
    ListPlus,
    Play,
    ScanEye,
    Scissors,
    TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { DateTimePicker, defaultStart } from '@/components/form/date-time-picker';
import { SlotForm } from '@/components/printer/ams/slot-form';
import { CostEstimateCard } from '@/components/printer/files/cost-estimate';
import { PrintPreview3D } from '@/components/printer/files/print-preview-3d';
import { ObjectPicker } from '@/components/printer/skip/object-picker';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCostEstimate } from '@/hooks/use-cost-estimate';
import { useLiveState, usePrinter } from '@/hooks/use-printers';
import { useSpoolLookup } from '@/hooks/use-slot-spool';
import { hexToRgb, rgbCss, rgbToHex, textOn } from '@/lib/color';
import { anyShort, checkFilament, type FilamentStatus, type SlotCheck } from '@/lib/filament-check';
import { parseFilename } from '@/lib/filename';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { filamentSlotsQuery, fileObjectsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { EXTERNAL_SLOT } from '../ams/external-spool-form';

export function queueTargetFor(choice: string, printerId: string): QueueTarget {
    if (choice === 'any') return { printerId: null, targetTags: [] };
    if (choice.startsWith('tag:')) return { printerId: null, targetTags: [choice.slice(4)] };
    return { printerId, targetTags: [] };
}

export interface PrintReadyResult {
    filamentAssignments?: FilamentAssignment[];
    excludedObjects: string[];
    autoLeveling: boolean;
    vibrationCompensation: boolean;
    flowCalibration: boolean;
    timelapse: boolean;
    failureDetection: boolean;
}

export interface Channel {
    paintIndex: number;
    colorHex: string;
    material: string;
    isUsed: boolean;
}

function colorDistance(a: string, b: string): number {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

function compatibleSlots(channel: Channel, slots: AmsSlot[]): AmsSlot[] {
    const fam = materialFamily(channel.material);
    if (!fam) return slots;
    return slots.filter((s) => materialFamily(s.type) === fam);
}

export function defaultAssignments(channels: Channel[], slots: AmsSlot[]): Record<number, number> {
    const out: Record<number, number> = {};
    const taken = new Set<number>();
    for (const ch of channels) {
        const ranked = compatibleSlots(ch, slots).sort((a, b) => {
            const da = Math.abs(a.globalIndex - ch.paintIndex);
            const db = Math.abs(b.globalIndex - ch.paintIndex);
            if (da !== db) return da - db;
            const ca = colorDistance(ch.colorHex, rgbToHex(a.color));
            const cb = colorDistance(ch.colorHex, rgbToHex(b.color));
            if (ca !== cb) return ca - cb;
            return a.globalIndex - b.globalIndex;
        });
        const chosen = ranked.find((s) => !taken.has(s.globalIndex)) ?? ranked[0];
        out[ch.paintIndex] = chosen ? chosen.globalIndex : -1;
        if (chosen) taken.add(chosen.globalIndex);
    }
    return out;
}

function slotLabel(slot: AmsSlot, info: SlotFilamentInfo | undefined): string {
    const profile = info?.override ?? info?.profile;
    const name = profile ? `${profile.name}${profile.vendor ? ` — ${profile.vendor}` : ''}` : slot.type || '?';
    return `${m.print_ready_slot({ n: slot.globalIndex + 1 })} · ${name}`;
}

function Chip({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
    const rgb = hexToRgb(color);
    return (
        <span
            className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                className,
            )}
            style={{ background: rgbCss(rgb), color: textOn(rgb) }}
        >
            {children}
        </span>
    );
}

export function PrintReadyForm({
    printerId,
    file,
    onPrint,
    onQueue,
    onSchedule,
}: {
    printerId: string;
    file: GcodeFileDto;
    onPrint: (result: PrintReadyResult) => Promise<unknown>;
    onQueue?: (result: PrintReadyResult, target: QueueTarget) => void;
    onSchedule?: (result: PrintReadyResult, startAt: string) => Promise<unknown>;
}) {
    const state = useLiveState(printerId);
    const printer = usePrinter(printerId);
    const cost = useCostEstimate(printerId);
    const slotInfos = useQuery(filamentSlotsQuery(printerId));
    const objects = useQuery(fileObjectsQuery(printerId, file.id));
    const close = confirmationDialogStore.actions.closeDialog;

    const usable = useMemo(
        () =>
            [...state.amsSlots]
                .filter((s) => slotUsableForPrint(s, state.filamentMode))
                .sort((a, b) => a.globalIndex - b.globalIndex),
        [state.amsSlots, state.filamentMode],
    );
    const channels = useMemo<Channel[]>(
        () =>
            file.filaments.length
                ? file.filaments.map((f: GcodeFilament) => ({
                      paintIndex: f.slotIndex,
                      colorHex: f.colorHex,
                      material: f.material,
                      isUsed: f.isUsed,
                  }))
                : [],
        [file.filaments],
    );
    const [assignments, setAssignments] = useState<Record<number, number>>(() => defaultAssignments(channels, usable));
    const [excluded, setExcluded] = useState<string[]>([]);
    const [showObjects, setShowObjects] = useState(false);
    const [autoLeveling, setAutoLeveling] = useState(printer?.settings.autoLeveling ?? true);
    const [vibrationCompensation, setVibrationCompensation] = useState(
        printer?.settings.vibrationCompensation ?? false,
    );
    const [flowCalibration, setFlowCalibration] = useState(printer?.settings.flowCalibration ?? true);
    const [timelapse, setTimelapse] = useState(printer?.settings.timelapseEnabled ?? false);
    const [failureDetection, setFailureDetection] = useState(printer?.settings.failureDetection ?? true);
    const [pending, setPending] = useState(false);
    const [editing, setEditing] = useState<AmsSlot | null>(null);
    const [scheduling, setScheduling] = useState(false);
    const [startAt, setStartAt] = useState<Date | null>(null);
    const [acceptShort, setAcceptShort] = useState(false);
    const [queueChoice, setQueueChoice] = useState('this');
    const spoolOf = useSpoolLookup(printerId);

    useEffect(() => {
        setAssignments((cur) => {
            const fresh = defaultAssignments(channels, usable);
            const next = { ...cur };
            for (const ch of channels) {
                const ok = compatibleSlots(ch, usable).some((s) => s.globalIndex === cur[ch.paintIndex]);
                if (!ok) next[ch.paintIndex] = fresh[ch.paintIndex] ?? -1;
            }
            return next;
        });
    }, [channels, usable]);

    const allSlots = [...state.amsSlots].sort((a, b) => a.globalIndex - b.globalIndex);
    const names = objects.data?.names.length ? objects.data.names : file.objects;
    const canPrint = state.connected && state.printState !== 'printing' && state.printState !== 'paused';
    const mismatches = channels.filter((ch) => ch.isUsed && compatibleSlots(ch, usable).length === 0);
    const blocked = usable.length > 0 && mismatches.length > 0;
    const usedG = new Map(file.filaments.map((f) => [f.slotIndex, f.usedG ?? null]));
    const checks = checkFilament(
        channels
            .filter((ch) => ch.isUsed)
            .map((ch) => ({
                slotKey: usable.length ? String(assignments[ch.paintIndex] ?? -1) : EXTERNAL_SLOT,
                colorHex: ch.colorHex,
                needG: usedG.get(ch.paintIndex) ?? null,
            }))
            .filter((need) => need.slotKey !== '-1'),
        (slotKey) => spoolOf(slotKey).remainingG,
    );
    const shortBlocked = anyShort(checks) && !acceptShort;
    const estimate = cost.estimate(
        file,
        new Map(
            channels.map((ch) => [
                ch.paintIndex,
                usable.length ? String(assignments[ch.paintIndex] ?? -1) : EXTERNAL_SLOT,
            ]),
        ),
    );
    const remaining = names.length - excluded.length;
    const { name, plate } = parseFilename(file.filename);
    const tint = channels.find((ch) => ch.isUsed)?.colorHex ?? channels[0]?.colorHex;

    const build = (): PrintReadyResult => ({
        filamentAssignments: usable.length
            ? channels.map((ch) => ({
                  paintIndex: ch.paintIndex,
                  slotIndex: assignments[ch.paintIndex] ?? -1,
                  isUsed: ch.isUsed,
              }))
            : undefined,
        excludedObjects: excluded,
        autoLeveling,
        vibrationCompensation,
        flowCalibration,
        timelapse,
        failureDetection,
    });

    if (editing) {
        const unit = editing.boxId >= 0 ? m.ace_unit({ n: editing.boxId + 1 }) : m.ams_toolhead();
        return (
            <div className="flex flex-col gap-2 py-2">
                <Button type="button" size="sm" className="self-start rounded-full" onClick={() => setEditing(null)}>
                    <ArrowLeft /> {m.ams_slot_title({ n: editing.index + 1, unit })}
                </Button>
                <p className="text-xs text-muted-foreground">{m.ams_slot_hint()}</p>
                <SlotForm
                    key={editing.globalIndex}
                    printerId={printerId}
                    slot={editing}
                    onClose={() => setEditing(null)}
                    onBack={() => setEditing(null)}
                />
            </div>
        );
    }

    return (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 py-2 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="grid content-start gap-3">
                <PrintPreview3D printerId={printerId} file={file} tint={tint} className="h-72 md:h-[26rem]" />
                <div className="min-w-0 space-y-1.5 px-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate font-medium" title={file.filename}>
                            {name}
                        </span>
                        {plate !== null && (
                            <span className="shrink-0 text-sm text-muted-foreground">
                                {m.files_plate({ n: plate })}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {file.estPrintTimeSec > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                                <Clock className="size-4" /> {formatDuration(file.estPrintTimeSec)}
                            </span>
                        )}
                        {file.layerHeight > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                                <Layers className="size-4" /> {file.layerHeight} mm
                            </span>
                        )}
                        {channels.map((ch) => (
                            <span key={ch.paintIndex} className="inline-flex items-center gap-1.5">
                                <span className="size-3 rounded-full" style={{ background: ch.colorHex }} />
                                {ch.material || '?'}
                            </span>
                        ))}
                    </div>
                </div>
                <CostEstimateCard estimate={estimate} currency={cost.currency} />
            </div>

            <div className="grid min-w-0 content-start gap-4">
                {allSlots.length > 0 && (
                    <div className="grid gap-2">
                        <div className="text-sm font-medium text-muted-foreground">{m.print_ready_slots()}</div>
                        <div className="flex flex-wrap gap-2">
                            {allSlots.map((s) => {
                                const empty = s.status !== 5 && !s.type;
                                return (
                                    <button
                                        type="button"
                                        key={s.globalIndex}
                                        disabled={!state.connected}
                                        onClick={() => setEditing(s)}
                                        title={empty ? m.ams_slot_empty() : m.ams_slot_edit({ type: s.type })}
                                        className={cn(
                                            'flex size-9 items-center justify-center rounded-full text-xs font-semibold transition-transform enabled:hover:scale-105 disabled:opacity-60',
                                            empty &&
                                                'border border-dashed border-muted-foreground/40 text-muted-foreground',
                                        )}
                                        style={
                                            empty ? undefined : { background: rgbCss(s.color), color: textOn(s.color) }
                                        }
                                    >
                                        {s.globalIndex + 1}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {channels.length > 0 && (
                    <div className="grid gap-2">
                        <div className="text-sm font-medium text-muted-foreground">{m.print_ready_channels()}</div>
                        {usable.length === 0 ? (
                            <p className="rounded-2xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
                                {m.print_ready_no_slots()}
                            </p>
                        ) : (
                            <div className="grid gap-2">
                                {channels.map((ch) => {
                                    const options = compatibleSlots(ch, usable);
                                    const current = assignments[ch.paintIndex] ?? -1;
                                    const chosen = usable.find((s) => s.globalIndex === current);
                                    return (
                                        <div
                                            key={ch.paintIndex}
                                            className={cn(
                                                'flex items-center gap-3 rounded-2xl bg-secondary/60 px-3 py-2',
                                                !ch.isUsed && 'opacity-60',
                                            )}
                                        >
                                            <Chip color={ch.colorHex}>{ch.paintIndex + 1}</Chip>
                                            <div className="w-16 shrink-0">
                                                <div className="truncate text-sm">{ch.material || '?'}</div>
                                                <div className="text-[10px] uppercase text-muted-foreground">
                                                    {ch.isUsed ? m.print_ready_used() : m.print_ready_unused()}
                                                </div>
                                            </div>
                                            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                                            {chosen ? (
                                                <Chip color={rgbToHex(chosen.color)}>{chosen.globalIndex + 1}</Chip>
                                            ) : (
                                                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-xs text-muted-foreground">
                                                    ?
                                                </span>
                                            )}
                                            <Select
                                                value={String(current)}
                                                disabled={!options.length}
                                                onValueChange={(v) =>
                                                    setAssignments((cur) => ({ ...cur, [ch.paintIndex]: Number(v) }))
                                                }
                                            >
                                                <SelectTrigger className="w-0 min-w-0 flex-1">
                                                    <SelectValue placeholder={m.print_ready_no_match()} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {options.map((s) => (
                                                        <SelectItem key={s.globalIndex} value={String(s.globalIndex)}>
                                                            {slotLabel(
                                                                s,
                                                                slotInfos.data?.find(
                                                                    (i) => i.slotIndex === s.globalIndex,
                                                                ),
                                                            )}
                                                        </SelectItem>
                                                    ))}
                                                    {!options.length && (
                                                        <SelectItem value="-1" disabled>
                                                            {m.print_ready_no_match()}
                                                        </SelectItem>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {blocked && (
                            <div className="flex items-start gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                                <div className="space-y-0.5">
                                    <div className="font-medium">{m.print_ready_mismatch_title()}</div>
                                    {mismatches.map((ch) => (
                                        <div key={ch.paintIndex} className="text-xs">
                                            {m.print_ready_mismatch_line({
                                                n: ch.paintIndex + 1,
                                                material: ch.material,
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {checks.some((c) => c.needG !== null) && (
                    <FilamentChecks
                        checks={checks}
                        external={!usable.length}
                        accepted={acceptShort}
                        onAccept={setAcceptShort}
                    />
                )}

                {names.length >= 2 && (
                    <div className="grid gap-2">
                        <button
                            type="button"
                            onClick={() => setShowObjects((v) => !v)}
                            className="flex items-center gap-2 rounded-2xl bg-secondary/60 px-4 py-2 text-left text-sm"
                        >
                            <Scissors className="size-4 text-muted-foreground" />
                            <span className="flex-1">{m.print_ready_objects()}</span>
                            <span className="text-xs text-muted-foreground">
                                {excluded.length ? m.preprint_count({ remaining, total: names.length }) : names.length}
                            </span>
                            <ChevronDown className={cn('size-4 transition-transform', showObjects && 'rotate-180')} />
                        </button>
                        {showObjects && (
                            <ObjectPicker
                                objects={names}
                                selected={excluded}
                                svgB64={objects.data?.svgB64}
                                onToggle={(n) =>
                                    setExcluded((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]))
                                }
                            />
                        )}
                    </div>
                )}

                <div className="grid gap-2">
                    <div className="text-sm font-medium text-muted-foreground">{m.print_ready_options()}</div>
                    <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-secondary/60">
                        {supportsPrintOption(state.features, 'autoLeveling') && (
                            <OptionRow
                                id="print-ready-auto-leveling"
                                icon={<Grid3x3 />}
                                label={m.settings_auto_leveling()}
                                hint={m.print_ready_leveling_hint()}
                                checked={autoLeveling}
                                onChange={setAutoLeveling}
                            />
                        )}
                        {supportsPrintOption(state.features, 'vibrationCompensation') && (
                            <OptionRow
                                id="print-ready-vibration"
                                icon={<AudioWaveform />}
                                label={m.settings_vibration()}
                                hint={m.print_ready_vibration_hint()}
                                checked={vibrationCompensation}
                                onChange={setVibrationCompensation}
                            />
                        )}
                        {supportsPrintOption(state.features, 'flowCalibration') && (
                            <OptionRow
                                id="print-ready-flow"
                                icon={<Droplets />}
                                label={m.settings_flow_calibration()}
                                hint={m.print_ready_flow_hint()}
                                checked={flowCalibration}
                                onChange={setFlowCalibration}
                            />
                        )}
                        <OptionRow
                            id="print-ready-timelapse"
                            icon={<Film />}
                            label={m.settings_timelapse_enabled()}
                            hint={m.settings_timelapse_hint()}
                            checked={timelapse}
                            onChange={setTimelapse}
                        />
                        <OptionRow
                            id="print-ready-detection"
                            icon={<ScanEye />}
                            label={m.settings_failure_detection()}
                            hint={m.print_ready_detection_hint()}
                            checked={failureDetection}
                            onChange={setFailureDetection}
                        />
                    </div>
                </div>
            </div>

            {onSchedule && scheduling && startAt && (
                <div className="md:col-span-2">
                    <DateTimePicker value={startAt} onChange={setStartAt} label={m.schedule_start_at()} />
                </div>
            )}

            <DialogFooter className="gap-2 sm:justify-between md:col-span-2">
                <Button type="button" variant="ghost" className="rounded-full" onClick={close}>
                    {m.upload_ready_later()}
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                    {onSchedule && (
                        <Button
                            type="button"
                            variant="secondary"
                            className={cn('rounded-full', scheduling && 'bg-primary/15')}
                            disabled={pending || blocked || shortBlocked || (names.length > 0 && remaining <= 0)}
                            onClick={async () => {
                                if (!scheduling) {
                                    setStartAt(defaultStart(new Date()));
                                    setScheduling(true);
                                    return;
                                }
                                if (!startAt || startAt.getTime() <= Date.now()) return;
                                setPending(true);
                                try {
                                    await onSchedule(build(), startAt.toISOString());
                                    close();
                                } finally {
                                    setPending(false);
                                }
                            }}
                        >
                            <CalendarClock /> {scheduling ? m.schedule_confirm() : m.schedule_button()}
                        </Button>
                    )}
                    {onQueue && (
                        <div className="flex items-center gap-1">
                            <Select value={queueChoice} onValueChange={setQueueChoice}>
                                <SelectTrigger className="w-44 rounded-full" aria-label={m.queue_target_label()}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="this">{m.queue_target_this()}</SelectItem>
                                    <SelectItem value="any">{m.queue_target_any()}</SelectItem>
                                    {(printer?.settings.profile.tags ?? []).map((tag) => (
                                        <SelectItem key={tag} value={`tag:${tag}`}>
                                            {m.queue_target_tag({ tag })}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                type="button"
                                variant="secondary"
                                className="rounded-full"
                                disabled={shortBlocked}
                                onClick={() => {
                                    close();
                                    onQueue(build(), queueTargetFor(queueChoice, printerId));
                                }}
                            >
                                <ListPlus /> {m.queue_add()}
                            </Button>
                        </div>
                    )}
                    <Button
                        type="button"
                        className="rounded-full px-5"
                        disabled={
                            pending || !canPrint || blocked || shortBlocked || (names.length > 0 && remaining <= 0)
                        }
                        onClick={async () => {
                            setPending(true);
                            try {
                                await onPrint(build());
                                close();
                            } finally {
                                setPending(false);
                            }
                        }}
                    >
                        <Play /> {m.common_print()}
                    </Button>
                </div>
            </DialogFooter>
        </div>
    );
}

function OptionRow({
    id,
    icon,
    label,
    hint,
    checked,
    onChange,
}: {
    id: string;
    icon: ReactNode;
    label: string;
    hint: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
            <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 font-normal">
                <span className="text-sm">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
            </Label>
            <Switch id={id} checked={checked} onCheckedChange={onChange} />
        </div>
    );
}

const CHECK_LABEL: Record<FilamentStatus, () => string> = {
    ok: m.print_ready_filament_ok,
    tight: m.print_ready_filament_tight,
    short: m.print_ready_filament_short,
    unknown: m.print_ready_filament_unknown,
};

const CHECK_CLASS: Record<FilamentStatus, string> = {
    ok: 'bg-primary/15 text-primary-strong',
    tight: 'bg-chart-2/20 text-foreground',
    short: 'bg-destructive/15 text-destructive',
    unknown: 'bg-secondary text-muted-foreground',
};

export function FilamentChecks({
    checks,
    external,
    accepted,
    onAccept,
}: {
    checks: SlotCheck[];
    external: boolean;
    accepted: boolean;
    onAccept: (accepted: boolean) => void;
}) {
    const short = anyShort(checks);
    return (
        <div className="grid gap-2">
            <div className="text-sm font-medium">{m.print_ready_filament_title()}</div>
            <ul className="grid gap-1.5">
                {checks.map((c) => (
                    <li
                        key={c.slotKey}
                        className="flex items-center gap-3 rounded-2xl bg-secondary/60 px-3 py-2 text-sm"
                    >
                        <Chip color={c.colorHex} className="size-6">
                            {external ? '' : Number(c.slotKey) + 1}
                        </Chip>
                        <span className="min-w-0 flex-1">
                            <span className="font-medium">
                                {external
                                    ? m.print_ready_filament_external()
                                    : m.print_ready_filament_slot({ n: Number(c.slotKey) + 1 })}
                            </span>
                            {c.needG !== null && (
                                <span className="text-muted-foreground">
                                    {' · '}
                                    {c.remainingG !== null
                                        ? m.print_ready_filament_line({
                                              need: Math.ceil(c.needG),
                                              left: Math.floor(c.remainingG),
                                          })
                                        : m.print_ready_filament_need({ need: Math.ceil(c.needG) })}
                                </span>
                            )}
                        </span>
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', CHECK_CLASS[c.status])}>
                            {CHECK_LABEL[c.status]()}
                        </span>
                    </li>
                ))}
            </ul>
            {short && (
                <div className="grid gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <div className="flex items-start gap-2">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        <span>{m.print_ready_filament_short_hint()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-foreground">
                        <Switch id="print-ready-accept-short" checked={accepted} onCheckedChange={onAccept} />
                        <Label htmlFor="print-ready-accept-short">{m.print_ready_filament_accept()}</Label>
                    </div>
                </div>
            )}
        </div>
    );
}
