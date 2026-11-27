import {
    BUILD_PLATES,
    type BuildPlateStyle,
    buildVolumeFor,
    type GcodeFileDto,
    slotUsableForPrint,
} from '@kobralink/shared';
import { ArrowDownToDot, Box, ChevronDown, Crosshair, Move, RotateCcw } from 'lucide-react';
import { type ComponentProps, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CostEstimateCard } from '@/components/printer/files/cost-estimate';
import type { SceneMode } from '@/components/printer/files/gcode-scene';
import { defaultAssignments } from '@/components/printer/files/print-ready-form';
import { TOOLHEAD_MODELS, TOOLHEAD_NAME, type ToolheadModel, toolheadFor } from '@/components/printer/files/toolhead';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useCostEstimate } from '@/hooks/use-cost-estimate';
import { useParsedGcode } from '@/hooks/use-parsed-gcode';
import { usePrinter } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { rgbToHex } from '@/lib/color';
import type { ParsedGcode } from '@/lib/gcode-parser.worker';
import { m } from '@/lib/i18n';
import { toolAt } from '@/lib/nozzle-path';
import { toolheadFeed } from '@/lib/toolhead-feed';
import { cn } from '@/lib/utils';
import { printersStore } from '@/stores/printers';

const GcodeScene = lazy(() => import('./gcode-scene').then((mod) => ({ default: mod.GcodeScene })));

export const PREVIEW_DIALOG_CLASS = 'max-h-[96svh] overflow-y-auto rounded-3xl sm:max-w-[min(96vw,1600px)]';

export function GcodePreview({ printerId, file }: { printerId: string; file: GcodeFileDto }) {
    const status = useParsedGcode(printerId, file);
    const [layer, setLayer] = useState(0);
    const [follow, setFollow] = useState(false);
    const [mode, setMode] = useState<SceneMode>('solid');
    const [pan, setPan] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);
    const [showHead, setShowHead] = useState(true);
    const printerToolhead = usePrinter(printerId, (p) => toolheadFor(p?.modeId));
    const plate = usePrinter(printerId, (p) => buildVolumeFor(p?.modeId, p?.settings.profile.buildVolumeMm));
    const plateStyle = usePlateStyle(printerId);
    const [devToolhead, setDevToolhead] = useState<ToolheadModel | null>(null);
    const toolhead = devToolhead ?? printerToolhead;
    const live = usePrinter(
        printerId,
        (p) =>
            p?.live && {
                filename: p.live.filename,
                printState: p.live.printState,
                currLayer: p.live.currLayer,
                position: p.live.position,
                printSlots: p.live.printSlots,
                amsSlots: p.live.amsSlots,
                amsLoadedSlot: p.live.amsLoadedSlot,
                filamentMode: p.live.filamentMode,
                fanSpeed: p.live.fanSpeed,
            },
    );
    const cost = useCostEstimate(printerId);
    const printingThis = Boolean(
        live && live.filename === file.filename && (live.printState === 'printing' || live.printState === 'paused'),
    );
    const slots = live?.amsSlots;
    const filamentMode = live?.filamentMode;
    const data = status.kind === 'ready' ? status.data : null;
    const printSlots = printingThis && live?.printSlots?.filename === file.filename ? live.printSlots.slots : null;
    const [learned, setLearned] = useState<Record<number, number>>({});
    const lastSeen = useRef('');
    const position = printingThis ? live?.position : null;
    const loadedSlot = live?.amsLoadedSlot ?? -1;

    useEffect(() => {
        if (!printingThis) setLearned({});
    }, [printingThis]);

    useEffect(() => {
        if (!data || !position || loadedSlot < 0) return;
        const tool = toolAt(data, position);
        const seen = `${tool}:${loadedSlot}`;
        const confirmed = lastSeen.current === seen;
        lastSeen.current = seen;
        if (tool === null || !confirmed) return;
        setLearned((known) => (known[tool] === loadedSlot ? known : { ...known, [tool]: loadedSlot }));
    }, [data, position, loadedSlot]);

    const paletteKey = useMemo(() => {
        const usable = (slots ?? [])
            .filter((s) => filamentMode && slotUsableForPrint(s, filamentMode))
            .sort((a, b) => a.globalIndex - b.globalIndex);
        const channels = file.filaments.map((f) => ({
            paintIndex: f.slotIndex,
            colorHex: f.colorHex,
            material: f.material,
            isUsed: f.isUsed,
        }));
        const assigned = defaultAssignments(channels, usable);
        return channels
            .map((ch) => {
                const known = printSlots?.[ch.paintIndex] ?? -1;
                const index = learned[ch.paintIndex] ?? (known >= 0 ? known : assigned[ch.paintIndex]);
                const slot = (slots ?? []).find((s) => s.globalIndex === index);
                return slot ? rgbToHex(slot.color) : ch.colorHex;
            })
            .join(',');
    }, [file.filaments, slots, filamentMode, printSlots, learned]);
    const palette = useMemo(() => (paletteKey ? paletteKey.split(',') : []), [paletteKey]);
    const total = data?.layers.length ?? 0;

    useEffect(() => {
        if (data) setLayer(data.layers.length);
    }, [data]);

    useEffect(() => {
        if (printingThis && data) setFollow(true);
    }, [printingThis, data]);

    const following = follow && printingThis;
    const shown = following && live ? Math.max(1, Math.min(total, live.currLayer)) : layer;

    return (
        <div className="grid gap-3 py-2">
            <div className="relative h-[calc(100svh-17rem)] min-h-72 w-full overflow-hidden rounded-2xl bg-secondary">
                {status.kind === 'ready' ? (
                    <>
                        <Suspense fallback={null}>
                            <GcodeScene
                                data={status.data}
                                shown={shown}
                                mode={mode}
                                palette={palette}
                                pan={pan}
                                resetSignal={resetSignal}
                                nozzle={following && showHead ? live?.position : null}
                                toolhead={toolhead}
                                plate={plate}
                                plateStyle={plateStyle}
                                feed={
                                    live
                                        ? toolheadFeed(
                                              live.amsSlots,
                                              live.amsLoadedSlot,
                                              live.filamentMode,
                                              live.fanSpeed,
                                          )
                                        : undefined
                                }
                            />
                        </Suspense>
                        <SceneOverlay
                            printerId={printerId}
                            mode={mode}
                            pan={pan}
                            onToggleMode={() => setMode((v) => (v === 'solid' ? 'lines' : 'solid'))}
                            onTogglePan={() => setPan((v) => !v)}
                            onReset={() => setResetSignal((v) => v + 1)}
                            head={
                                following && live?.position
                                    ? {
                                          shown: showHead,
                                          onToggle: () => setShowHead((v) => !v),
                                          devModel: import.meta.env.DEV
                                              ? {
                                                    name: TOOLHEAD_NAME[toolhead],
                                                    onSwitch: () =>
                                                        setDevToolhead(
                                                            TOOLHEAD_MODELS[
                                                                (TOOLHEAD_MODELS.indexOf(toolhead) + 1) %
                                                                    TOOLHEAD_MODELS.length
                                                            ],
                                                        ),
                                                }
                                              : undefined,
                                      }
                                    : undefined
                            }
                        />
                    </>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                        {status.kind === 'loading'
                            ? m.preview_parsing({ pct: Math.round(status.progress * 100) })
                            : status.message}
                    </div>
                )}
            </div>
            {data && (
                <LayerControls
                    data={data}
                    shown={shown}
                    onChange={(v) => {
                        setFollow(false);
                        setLayer(v);
                    }}
                    follow={
                        printingThis
                            ? {
                                  checked: follow,
                                  onChange: (v) => {
                                      if (!v) setLayer(shown);
                                      setFollow(v);
                                  },
                              }
                            : null
                    }
                />
            )}
            <CostEstimateCard estimate={cost.estimate(file)} currency={cost.currency} />
        </div>
    );
}

export function SceneOverlay({
    printerId,
    mode,
    pan,
    onToggleMode,
    onTogglePan,
    onReset,
    head,
}: {
    printerId: string;
    mode: SceneMode;
    pan: boolean;
    onToggleMode: () => void;
    onTogglePan: () => void;
    onReset: () => void;
    head?: { shown: boolean; onToggle: () => void; devModel?: { name: string; onSwitch: () => void } };
}) {
    return (
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <PlateMenu printerId={printerId} />
            <div className="flex min-w-0 flex-col items-end gap-2 [&>button]:pointer-events-auto">
                <span className="rounded-2xl bg-background/70 px-2.5 py-1 text-right text-[11px] text-muted-foreground backdrop-blur-xs">
                    {pan ? m.preview_pan_hint() : m.preview_orbit_hint()}
                </span>
                <OverlayButton label={m.preview_reset_view()} onClick={onReset}>
                    <RotateCcw />
                </OverlayButton>
                <OverlayButton
                    label={m.preview_pan()}
                    variant={pan ? 'default' : 'secondary'}
                    aria-pressed={pan}
                    onClick={onTogglePan}
                >
                    <Move />
                </OverlayButton>
                <OverlayButton
                    label={m.preview_solid()}
                    variant={mode === 'solid' ? 'default' : 'secondary'}
                    aria-pressed={mode === 'solid'}
                    onClick={onToggleMode}
                >
                    <Box />
                </OverlayButton>
                {head && (
                    <OverlayButton
                        label={m.preview_toolhead()}
                        variant={head.shown ? 'default' : 'secondary'}
                        aria-pressed={head.shown}
                        onClick={head.onToggle}
                    >
                        <ArrowDownToDot />
                    </OverlayButton>
                )}
                {head?.devModel && (
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="rounded-full shadow"
                        onClick={head.devModel.onSwitch}
                    >
                        {head.devModel.name}
                    </Button>
                )}
            </div>
        </div>
    );
}

const PLATE_LABEL: Record<BuildPlateStyle, () => string> = {
    anycubic: () => m.preview_plate_anycubic(),
    pei: () => m.preview_plate_pei(),
    none: () => m.preview_plate_none(),
};

export function usePlateStyle(printerId: string): BuildPlateStyle {
    return usePrinter(printerId, (p) => p?.settings.buildPlate ?? 'anycubic');
}

function PlateMenu({ printerId }: { printerId: string }) {
    const style = usePlateStyle(printerId);
    const choose = (buildPlate: BuildPlateStyle) => {
        const printer = printersStore.state.printers[printerId];
        if (!printer || buildPlate === style) return;
        printersStore.actions.upsertPrinter({ ...printer, settings: { ...printer.settings, buildPlate } });
        api.printers
            .update(printerId, { settings: { buildPlate } })
            .then(printersStore.actions.upsertPrinter)
            .catch(() => printersStore.actions.upsertPrinter(printer));
    };
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="pointer-events-auto shrink-0 rounded-full shadow"
                    aria-label={`${m.preview_plate()} · ${PLATE_LABEL[style]()}`}
                    title={m.preview_plate()}
                >
                    {PLATE_LABEL[style]()}
                    <ChevronDown />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="rounded-2xl">
                <DropdownMenuRadioGroup value={style} onValueChange={(v) => choose(v as BuildPlateStyle)}>
                    {BUILD_PLATES.map((p) => (
                        <DropdownMenuRadioItem key={p} value={p} className="rounded-xl">
                            {PLATE_LABEL[p]()}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function OverlayButton({ label, ...props }: { label: string } & ComponentProps<typeof Button>) {
    return (
        <Button
            type="button"
            size="icon"
            variant="secondary"
            className="rounded-full shadow"
            title={label}
            aria-label={label}
            {...props}
        />
    );
}

function LayerControls({
    data,
    shown,
    onChange,
    follow,
}: {
    data: ParsedGcode;
    shown: number;
    onChange: (layer: number) => void;
    follow: { checked: boolean; onChange: (v: boolean) => void } | null;
}) {
    const total = data.layers.length;
    return (
        <div className="flex items-center gap-4">
            <span className="flex w-28 shrink-0 flex-col text-sm tabular-nums leading-tight">
                <span>{m.preview_layer({ n: shown, total })}</span>
                <span className="text-xs text-muted-foreground">
                    {m.preview_layer_z({ z: data.layers[Math.max(0, shown - 1)]?.z.toFixed(2) ?? '0' })}
                </span>
            </span>
            <Slider
                value={[shown]}
                min={1}
                max={Math.max(1, total)}
                step={1}
                onValueChange={([v]) => onChange(v)}
                className="flex-1"
            />
            {follow && (
                <span
                    className={cn(
                        'flex items-center gap-2 text-xs',
                        follow.checked ? 'text-foreground' : 'text-muted-foreground',
                    )}
                >
                    <Crosshair className="size-3.5" />
                    {m.preview_follow()}
                    <Switch
                        checked={follow.checked}
                        onCheckedChange={follow.onChange}
                        aria-label={m.preview_follow()}
                    />
                </span>
            )}
        </div>
    );
}
