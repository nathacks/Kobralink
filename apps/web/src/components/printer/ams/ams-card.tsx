import { aceSlotStatus, type FilamentMode } from '@kobralink/shared';
import { useLayoutEffect, useRef, useState } from 'react';
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
    const loaded = state.amsSlots.find((s) => s.globalIndex === state.amsLoadedSlot);
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
            <FilamentSlots printerId={printerId} />
            {state.aceUnits.length > 0 && (
                <AceControls
                    printerId={printerId}
                    units={state.aceUnits}
                    disabled={!state.connected}
                    busy={state.printState === 'printing'}
                />
            )}
        </Panel>
    );
}

export function FilamentSlots({ printerId, className }: { printerId: string; className?: string }) {
    const state = useLiveState(printerId);
    const slots = [...state.amsSlots].sort((a, b) => a.globalIndex - b.globalIndex);
    const boxIds = [...new Set(slots.map((s) => s.boxId))];
    const openDialog = confirmationDialogStore.actions.openDialog;
    const offline = !state.connected;
    const busy = state.printState === 'printing';
    const wiresRef = useRef<HTMLDivElement>(null);
    const [wires, setWires] = useState<Strand[]>([]);
    const hubMode = state.filamentMode === 'ace_hub';
    const tubed = state.filamentMode !== 'toolhead' && boxIds.some((id) => id >= 0);
    const toolheadSlots = slots.filter((s) => s.boxId < 0);
    const sideOf = (inlet: string): Side =>
        toolheadSlots.findIndex((s) => `slot-${s.globalIndex}` === inlet) % 2 === 0 ? 'left' : 'right';
    const routes = new Map(
        boxIds.filter((id) => tubed && id >= 0).map((id) => [id, aceInlet(state.filamentMode, id)] as const),
    );
    const lanes = { left: 0, right: 0 };
    for (const inlet of routes.values()) lanes[sideOf(inlet)]++;
    const gutter = (n: number) => (n ? LANE_INSET + 5 + (n - 1) * LANE_GAP : undefined);

    useLayoutEffect(() => {
        const el = wiresRef.current;
        if (!el) return;
        const draw = () => {
            const base = el.getBoundingClientRect();
            const box = (e: Element) => {
                const r = e.getBoundingClientRect();
                return {
                    left: r.left - base.left,
                    right: r.right - base.left,
                    top: r.top - base.top,
                    mid: r.top - base.top + r.height / 2,
                    height: r.height,
                };
            };
            const units = [...el.querySelectorAll<HTMLElement>('[data-ace-unit]')].flatMap((u) => {
                const inlet = el.querySelector(`[data-inlet="${u.dataset.aceUnit}"]`);
                if (!inlet) return [];
                return [
                    {
                        inlet: u.dataset.aceUnit ?? '',
                        side: (u.dataset.side === 'left' ? 'left' : 'right') as Side,
                        target: box(inlet),
                        head: box(u.querySelector('[data-ace-head]') ?? u).mid,
                        spools: [...u.querySelectorAll<HTMLElement>('[data-ace-spool]')].map((t) => ({
                            ...box(t),
                            slot: Number(t.dataset.slot),
                            color: t.dataset.color || null,
                            loaded: t.dataset.loaded === 'true',
                            flow: Number(t.dataset.flow) || 0,
                        })),
                    },
                ];
            });
            const boxes = units.flatMap((u) => [u.target, ...u.spools]);
            setWires(
                filamentPaths(units, {
                    left: Math.min(...boxes.map((b) => b.left)) - LANE_INSET,
                    right: Math.max(...boxes.map((b) => b.right)) + LANE_INSET,
                }),
            );
        };
        draw();
        const resize = new ResizeObserver(draw);
        resize.observe(el);
        const mutation = new MutationObserver(draw);
        mutation.observe(el, {
            subtree: true,
            childList: true,
            attributeFilter: ['data-color', 'data-flow', 'data-loaded', 'data-ace-unit', 'data-side'],
        });
        return () => {
            resize.disconnect();
            mutation.disconnect();
        };
    }, []);

    return (
        <div
            ref={wiresRef}
            className={cn('relative flex flex-col gap-5', className)}
            style={{ paddingLeft: gutter(lanes.left), paddingRight: gutter(lanes.right) }}
        >
            <FilamentWires wires={wires} />
            {tubed && !hubMode && (
                <div className="grid grid-cols-2 gap-x-6">
                    <div data-inlet="head" className={cn(INLET, 'col-start-2')}>
                        {m.ams_toolhead()}
                    </div>
                </div>
            )}
            {slots.length === 0 ? (
                state.externalSpoolOnly ? (
                    <ExternalSpoolSlot printerId={printerId} disabled={offline} />
                ) : (
                    <p className="text-sm text-muted-foreground">{m.ams_no_slots()}</p>
                )
            ) : (
                boxIds.map((boxId) => {
                    const ace = boxId >= 0;
                    const group = slots.filter((s) => s.boxId === boxId);
                    const inlet = routes.get(boxId);
                    return (
                        <div
                            key={boxId}
                            className="flex flex-col gap-2"
                            data-ace-unit={inlet}
                            data-side={inlet && sideOf(inlet)}
                        >
                            {(boxIds.length > 1 || tubed) && (
                                <span
                                    data-ace-head
                                    className={cn(
                                        'text-xs font-medium text-muted-foreground',
                                        inlet && sideOf(inlet) === 'left' && 'text-right',
                                    )}
                                >
                                    {boxId >= 0 ? m.ace_unit({ n: boxId + 1 }) : m.ams_toolhead()}
                                </span>
                            )}
                            <div className={ace || hubMode ? 'grid grid-cols-2 gap-x-6 gap-y-3' : GRID}>
                                {group.map((s) => {
                                    const isLoaded = s.globalIndex === state.amsLoadedSlot;
                                    const empty = s.status !== 5 && !s.type;
                                    const activity = AMS_ACTIVITY_LABEL[s.activity]?.();
                                    const slotStatus = aceSlotStatus(s.status);
                                    const statusLabel =
                                        s.boxId >= 0 && slotStatus ? ACE_SLOT_STATUS_LABEL[slotStatus]?.() : undefined;
                                    return (
                                        <div
                                            key={s.globalIndex}
                                            className="relative min-w-0"
                                            data-ace-spool={inlet ? '' : undefined}
                                            data-inlet={ace ? undefined : `slot-${s.globalIndex}`}
                                            data-slot={s.globalIndex}
                                            data-color={empty ? undefined : rgbCss(s.color)}
                                            data-loaded={isLoaded}
                                            data-flow={FLOW[s.activity] ?? (isLoaded && busy ? PRINT_FLOW : 0)}
                                        >
                                            <button
                                                type="button"
                                                disabled={offline}
                                                onClick={() =>
                                                    openDialog({
                                                        title: m.ams_slot_title({
                                                            n: s.index + 1,
                                                            unit:
                                                                s.boxId >= 0
                                                                    ? m.ace_unit({ n: s.boxId + 1 })
                                                                    : m.ams_toolhead(),
                                                        }),
                                                        description: m.ams_slot_hint(),
                                                        content: (
                                                            <SlotForm
                                                                key={s.globalIndex}
                                                                printerId={printerId}
                                                                slot={s}
                                                            />
                                                        ),
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
                                        </div>
                                    );
                                })}
                                {hubMode && !ace && (
                                    <div data-inlet="hub" title={m.ams_hub_hint()} className={INLET}>
                                        {m.ams_hub()}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
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

const INLET =
    'flex items-center justify-center rounded-2xl border border-dashed border-border p-3 text-sm text-muted-foreground';

function FilamentWires({ wires }: { wires: Strand[] }) {
    return (
        <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {wires.map((w) =>
                w.kind === 'tube' ? (
                    <g key={w.key}>
                        <path d={w.d} className="stroke-muted-foreground/25" strokeWidth={9} />
                        <path d={w.d} className="stroke-card" strokeWidth={6} />
                    </g>
                ) : w.kind === 'filament' ? (
                    <path key={w.key} d={w.d} stroke={w.color} strokeOpacity={0.5} strokeWidth={2} />
                ) : (
                    <g key={w.key}>
                        <path
                            d={w.d}
                            pathLength={1}
                            strokeDasharray="1"
                            stroke={w.color}
                            strokeWidth={3}
                            className="animate-filament-draw transition-[stroke-opacity] duration-700 motion-reduce:animate-none"
                            style={{ strokeOpacity: Math.abs(w.flow ?? 0) >= 1 ? 0.4 : 1 }}
                        />
                        {w.flow ? (
                            <g className="motion-reduce:hidden">
                                <path
                                    d={w.d}
                                    pathLength={1}
                                    stroke={w.color}
                                    strokeOpacity={0.35}
                                    strokeWidth={9}
                                    className="animate-filament-flow"
                                    style={cometTiming(w.flow, w.length ?? 1)}
                                />
                                <path
                                    d={w.d}
                                    pathLength={1}
                                    strokeWidth={2.5}
                                    className="animate-filament-flow"
                                    style={{
                                        ...cometTiming(w.flow, w.length ?? 1),
                                        stroke: `color-mix(in oklab, ${w.color} 50%, white)`,
                                    }}
                                />
                            </g>
                        ) : null}
                    </g>
                ),
            )}
            {wires.flatMap((w) =>
                (w.ports ?? []).map(([x, y]) => (
                    <circle
                        key={`${w.key}:${x}:${y}`}
                        cx={x}
                        cy={y}
                        r={4}
                        className="fill-card stroke-muted-foreground/40"
                        strokeWidth={1.5}
                    />
                )),
            )}
        </svg>
    );
}

function cometTiming(flow: number, length: number): React.CSSProperties {
    const comet = Math.min(0.5, COMET_PX / length);
    return {
        '--comet': comet,
        strokeDasharray: `${comet} ${1 + comet}`,
        animationDuration: `${(length + COMET_PX) / (FLOW_SPEED * Math.abs(flow))}s`,
        animationDirection: flow < 0 ? 'reverse' : 'normal',
    } as React.CSSProperties;
}

export function aceInlet(mode: FilamentMode, _boxId: number): string {
    return mode === 'ace_hub' ? 'hub' : 'head';
}

export type Side = 'left' | 'right';

export interface SpoolBox {
    left: number;
    right: number;
    top: number;
    mid: number;
    slot: number;
    color: string | null;
    loaded: boolean;
    flow: number;
}

export interface AceRoute {
    inlet: string;
    side: Side;
    target: { left: number; right: number; mid: number; height: number };
    head: number;
    spools: SpoolBox[];
}

export interface Strand {
    kind: 'tube' | 'filament' | 'active';
    key: string;
    d: string;
    color?: string;
    flow?: number;
    length?: number;
    ports?: [number, number][];
}

const FLOW: Record<string, number> = { feeding: 1, retracting: -1 };
const PRINT_FLOW = 0.3;
const FLOW_SPEED = 220;
const COMET_PX = 36;

const STRAND_GAP = 3;
const LANE_INSET = 10;
const LANE_GAP = 11;
const ENTRY_GAP = 12;
const R = 10;

export function filamentPaths(units: AceRoute[], gutter: Record<Side, number>): Strand[] {
    const lanes = new Map<AceRoute, number>();
    const used = { left: 0, right: 0 };
    for (const u of units) if (u.spools.length) lanes.set(u, used[u.side]++);
    return units.flatMap((u) => {
        const lane = lanes.get(u);
        if (lane === undefined) return [];
        const { head, spools, side, target } = u;
        const dir = side === 'right' ? 1 : -1;
        const peers = units.filter((p) => p.inlet === u.inlet && lanes.has(p));
        const gap = peers.length > 1 ? Math.min(ENTRY_GAP, (target.height - 2 * R) / (peers.length - 1)) : 0;
        const entry = target.mid + ((peers.length - 1) / 2 - peers.indexOf(u)) * gap;
        const center = (Math.min(...spools.map((s) => s.left)) + Math.max(...spools.map((s) => s.right))) / 2;
        const fed = spools.filter((s) => s.color).sort((a, b) => a.top - b.top);
        const order = [...fed.filter((s) => s.right <= center), ...fed.filter((s) => s.right > center).reverse()];
        const spread = ((order.length - 1) / 2) * STRAND_GAP;
        const merge = center + dir * (spread + R);
        const x = gutter[side] + dir * lane * LANE_GAP;
        const up = entry < head ? 1 : -1;
        const edge = side === 'right' ? target.right : target.left;
        const route = `H${x - dir * R}Q${x} ${head} ${x} ${head - up * R}V${entry + up * R}Q${x} ${entry} ${x - dir * R} ${entry}H${edge}`;
        const routeLength = Math.abs(x - merge) + Math.abs(head - entry) + Math.abs(x - edge);
        const channel = (s: SpoolBox) => center - spread + order.indexOf(s) * STRAND_GAP;
        const from = (s: SpoolBox) => (s.right <= center ? s.right : s.left);
        const strandLength = (s: SpoolBox) =>
            Math.abs(channel(s) - from(s)) + s.mid - head + Math.abs(merge - channel(s));
        const strand = (s: SpoolBox) => {
            const sx = channel(s);
            const r = Math.min(R, Math.abs(sx - from(s)), (s.mid - head) / 2);
            return `M${from(s)} ${s.mid}H${sx - Math.sign(sx - from(s)) * r}Q${sx} ${s.mid} ${sx} ${s.mid - r}V${head + R}Q${sx} ${head} ${merge} ${head}`;
        };
        const active = fed.find((s) => Math.abs(s.flow) >= 1) ?? fed.find((s) => s.loaded);
        return [
            {
                kind: 'tube',
                key: `tube-${side}${lane}`,
                d: `M${merge} ${head}${route}`,
                ports: [
                    [merge, head],
                    [edge, entry],
                ],
            },
            ...fed
                .filter((s) => s !== active)
                .map(
                    (s): Strand => ({ kind: 'filament', key: `s${s.slot}`, d: strand(s), color: s.color ?? undefined }),
                ),
            ...(active
                ? [
                      {
                          kind: 'active' as const,
                          key: `a${active.slot}`,
                          d: `${strand(active)}${route}`,
                          color: active.color ?? undefined,
                          flow: active.flow,
                          length: strandLength(active) + routeLength,
                      },
                  ]
                : []),
        ];
    });
}
