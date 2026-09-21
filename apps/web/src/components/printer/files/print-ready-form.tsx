import {
    type AmsSlot,
    type FilamentAssignment,
    type GcodeFilament,
    type GcodeFileDto,
    materialFamily,
    type SlotFilamentInfo,
    slotUsableForPrint,
} from '@kobralink/shared';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    ArrowRight,
    ChevronDown,
    Clock,
    Layers,
    ListPlus,
    Play,
    Scissors,
    TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { SlotForm } from '@/components/printer/ams/slot-form';
import { ObjectPicker } from '@/components/printer/skip/object-picker';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useLiveState, usePrinter } from '@/hooks/use-printers';
import { hexToRgb, rgbCss, rgbToHex, textOn } from '@/lib/color';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { filamentSlotsQuery, fileObjectsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

export interface PrintReadyResult {
    filamentAssignments?: FilamentAssignment[];
    excludedObjects: string[];
    autoLeveling: boolean;
}

interface Channel {
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

function defaultAssignments(channels: Channel[], slots: AmsSlot[]): Record<number, number> {
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
}: {
    printerId: string;
    file: GcodeFileDto;
    onPrint: (result: PrintReadyResult) => Promise<unknown>;
    onQueue?: (result: PrintReadyResult) => void;
}) {
    const state = useLiveState(printerId);
    const printer = usePrinter(printerId);
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
    const [pending, setPending] = useState(false);
    const [editing, setEditing] = useState<AmsSlot | null>(null);

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
    const remaining = names.length - excluded.length;

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
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 py-2">
            <div className="flex items-center gap-4 rounded-2xl bg-secondary p-4">
                <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-background/40">
                    {file.thumbnail ? (
                        <img
                            src={`data:image/png;base64,${file.thumbnail}`}
                            alt=""
                            className="size-full object-contain"
                        />
                    ) : (
                        <span className="text-[10px] text-muted-foreground">GCode</span>
                    )}
                </div>
                <div className="min-w-0 space-y-1">
                    <div className="truncate font-medium">{file.filename}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {file.estPrintTimeSec > 0 && (
                            <span className="inline-flex items-center gap-1">
                                <Clock className="size-3.5" /> {formatDuration(file.estPrintTimeSec)}
                            </span>
                        )}
                        {file.layerHeight > 0 && (
                            <span className="inline-flex items-center gap-1">
                                <Layers className="size-3.5" /> {file.layerHeight} mm
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        {channels.map((ch) => (
                            <Chip key={ch.paintIndex} color={ch.colorHex} className="size-6 text-[10px]">
                                {ch.paintIndex + 1}
                            </Chip>
                        ))}
                    </div>
                </div>
            </div>

            {allSlots.length > 0 && (
                <div className="grid gap-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {m.print_ready_slots()}
                    </div>
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
                                    style={empty ? undefined : { background: rgbCss(s.color), color: textOn(s.color) }}
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
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {m.print_ready_channels()}
                    </div>
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
                                                            slotInfos.data?.find((i) => i.slotIndex === s.globalIndex),
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
                                        {m.print_ready_mismatch_line({ n: ch.paintIndex + 1, material: ch.material })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
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

            <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-4 py-2 text-sm">
                <Label htmlFor="print-ready-auto-leveling">{m.settings_auto_leveling()}</Label>
                <Switch id="print-ready-auto-leveling" checked={autoLeveling} onCheckedChange={setAutoLeveling} />
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="ghost" className="rounded-full" onClick={close}>
                    {m.upload_ready_later()}
                </Button>
                <div className="flex gap-2">
                    {onQueue && (
                        <Button
                            type="button"
                            variant="secondary"
                            className="rounded-full"
                            onClick={() => {
                                close();
                                onQueue(build());
                            }}
                        >
                            <ListPlus /> {m.queue_add()}
                        </Button>
                    )}
                    <Button
                        type="button"
                        className="rounded-full px-5"
                        disabled={pending || !canPrint || blocked || (names.length > 0 && remaining <= 0)}
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
