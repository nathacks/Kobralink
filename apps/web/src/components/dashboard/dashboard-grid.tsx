import { Check, LayoutTemplate, Pencil, RotateCcw, Save, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { GridLayout, type Layout, useContainerWidth } from 'react-grid-layout';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
    COLS,
    clearLayout,
    DEFAULT_LAYOUT,
    deletePreset,
    type LayoutPreset,
    loadLayout,
    loadPresets,
    ROW_HEIGHT,
    sanitize,
    saveLayout,
    savePreset,
    WIDGETS,
    type WidgetId,
} from './layout-store';

export function DashboardGrid({
    printerId,
    render,
    header,
}: {
    printerId: string;
    render: (id: WidgetId) => ReactNode;
    header: ReactNode;
}) {
    const [layout, setLayout] = useState<Layout>(() => loadLayout(printerId));
    const [editing, setEditing] = useState(false);
    const [presets, setPresets] = useState<LayoutPreset[]>(loadPresets);
    const [presetName, setPresetName] = useState('');
    const { width, containerRef, mounted } = useContainerWidth();
    const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

    const apply = (next: Layout) => {
        const clean = sanitize(next);
        setLayout(clean);
        saveLayout(printerId, clean);
    };

    const toolbar = (
        <div className="ml-auto flex flex-wrap items-center gap-2">
            {editing && (
                <>
                    <span className="hidden text-xs text-muted-foreground xl:inline">{m.dashboard_edit_hint()}</span>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                            clearLayout(printerId);
                            setLayout(DEFAULT_LAYOUT);
                        }}
                    >
                        <RotateCcw /> {m.dashboard_reset()}
                    </Button>
                    <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const name = presetName.trim();
                            if (!name) return;
                            setPresets(savePreset(name, layout));
                            setPresetName('');
                            toast.success(m.dashboard_preset_saved({ name }));
                        }}
                    >
                        <Input
                            value={presetName}
                            onChange={(e) => setPresetName(e.target.value)}
                            placeholder={m.dashboard_preset_name()}
                            className="h-8 w-40 rounded-full px-3 text-xs"
                        />
                        <Button
                            type="submit"
                            size="sm"
                            variant="secondary"
                            className="rounded-full"
                            disabled={!presetName.trim()}
                        >
                            <Save /> {m.dashboard_save_preset()}
                        </Button>
                    </form>
                </>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" className="rounded-full">
                        <LayoutTemplate /> {m.dashboard_presets()}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
                    <DropdownMenuLabel>{m.dashboard_presets()}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {presets.length === 0 ? (
                        <DropdownMenuItem disabled>{m.dashboard_no_presets()}</DropdownMenuItem>
                    ) : (
                        presets.map((p) => (
                            <DropdownMenuItem
                                key={p.name}
                                className="flex justify-between gap-3"
                                onSelect={() => apply(p.layout)}
                            >
                                <span className="truncate">{p.name}</span>
                                <button
                                    type="button"
                                    className="rounded-full p-1 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setPresets(deletePreset(p.name));
                                        toast.success(m.dashboard_preset_deleted());
                                    }}
                                    title={m.common_delete()}
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </DropdownMenuItem>
                        ))
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => apply(DEFAULT_LAYOUT)}>
                        <RotateCcw /> {m.dashboard_reset()}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <Button
                variant={editing ? 'default' : 'secondary'}
                size="sm"
                className="rounded-full"
                onClick={() => setEditing((v) => !v)}
            >
                {editing ? <Check /> : <Pencil />} {editing ? m.dashboard_done() : m.dashboard_customize()}
            </Button>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 px-2">
                {header}
                {wide && toolbar}
            </div>
            {!wide ? (
                <div className="grid gap-4">
                    {[...layout]
                        .sort((a, b) => a.y - b.y || a.x - b.x)
                        .map((l) => (
                            <div key={l.i}>{render(l.i as WidgetId)}</div>
                        ))}
                </div>
            ) : (
                <div ref={containerRef} className={cn(editing && 'dashboard-editing')}>
                    {mounted && (
                        <GridLayout
                            width={width}
                            layout={layout}
                            gridConfig={{
                                cols: COLS,
                                rowHeight: ROW_HEIGHT,
                                margin: [16, 16],
                                containerPadding: [0, 0],
                            }}
                            dragConfig={{ enabled: editing, handle: '.dashboard-drag-handle', bounded: false }}
                            resizeConfig={{ enabled: editing, handles: ['se'] }}
                            onLayoutChange={(next) => {
                                if (editing) apply(next);
                            }}
                        >
                            {WIDGETS.map((id) => (
                                <div key={id} className="group/tile relative h-full min-h-0">
                                    {editing && (
                                        <div className="dashboard-drag-handle absolute inset-x-0 top-0 z-10 h-14 cursor-grab rounded-t-3xl active:cursor-grabbing" />
                                    )}
                                    <div
                                        className={cn(
                                            'h-full min-h-0 [&>*]:h-full',
                                            editing && 'pointer-events-none select-none',
                                        )}
                                    >
                                        {render(id)}
                                    </div>
                                </div>
                            ))}
                        </GridLayout>
                    )}
                </div>
            )}
        </div>
    );
}
