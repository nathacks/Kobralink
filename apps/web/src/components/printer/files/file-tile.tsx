import type { GcodeFileDto } from '@farolprint/shared';
import { Box, Clock, Coins, Download, Eye, ListPlus, MoreVertical, Play, Trash2 } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { parseFilename } from '@/lib/filename';
import { formatBytes, formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { jobStatusLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';

export function FileTile({
    file,
    printerId,
    highlight,
    estimatedCost = null,
    canPrint,
    onPrint,
    onDelete,
    onQueue,
    onPreview,
}: {
    file: GcodeFileDto;
    printerId: string;
    highlight: boolean;
    estimatedCost?: string | null;
    canPrint: boolean;
    onPrint: () => void;
    onDelete: () => void;
    onQueue: () => void;
    onPreview: () => void;
}) {
    const { name, plate } = parseFilename(file.filename);
    const usedFilaments = file.filaments.filter((f) => f.isUsed);
    const muted = highlight ? 'text-primary-foreground/80' : 'text-muted-foreground';

    return (
        <article
            className={cn(
                'group flex flex-col overflow-hidden rounded-3xl',
                highlight ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
            )}
        >
            <div className="relative">
                <button
                    type="button"
                    onClick={onPreview}
                    aria-label={`${m.files_preview()}: ${name}`}
                    className="flex aspect-[4/3] w-full items-center justify-center bg-background/40 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                    {file.thumbnail ? (
                        <img
                            src={`data:image/png;base64,${file.thumbnail}`}
                            alt=""
                            className="size-full object-contain p-3 transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                    ) : (
                        <span className={cn('flex flex-col items-center gap-1 text-xs', muted)}>
                            <Box className="size-8 opacity-60" />
                            {m.files_no_preview()}
                        </span>
                    )}
                </button>
                {file.lastJob && (
                    <span
                        className={cn(
                            'absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-sm',
                            highlight
                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                : 'bg-background/70 text-foreground',
                        )}
                    >
                        {jobStatusLabel(file.lastJob.status)}
                    </span>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={m.files_actions()}
                            className={cn(
                                'absolute right-2.5 top-2.5 flex size-9 items-center justify-center rounded-full backdrop-blur-sm transition-opacity [&_svg]:size-4',
                                '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
                                highlight
                                    ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30'
                                    : 'bg-background/70 text-foreground hover:bg-background/90',
                            )}
                        >
                            <MoreVertical />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-2xl">
                        <DropdownMenuItem onSelect={onPreview} className="rounded-xl cursor-pointer">
                            <Eye />
                            <span>{m.files_preview()}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onQueue} className="rounded-xl cursor-pointer">
                            <ListPlus />
                            <span>{m.queue_add()}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="rounded-xl cursor-pointer">
                            <a href={api.files.downloadUrl(printerId, file.id)} download>
                                <Download />
                                <span>{m.common_download()}</span>
                            </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            variant="destructive"
                            onSelect={onDelete}
                            className="rounded-xl cursor-pointer"
                        >
                            <Trash2 />
                            <span>{m.common_delete()}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3.5">
                <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-medium leading-snug" title={file.filename}>
                        {name}
                    </h3>
                    {(plate !== null || file.webUnverified) && (
                        <div className={cn('mt-1 flex flex-wrap items-center gap-1.5 text-xs', muted)}>
                            {plate !== null && <span>{m.files_plate({ n: plate })}</span>}
                            {file.webUnverified && (
                                <span
                                    className={cn(
                                        'rounded-full px-2 py-0.5 font-medium',
                                        highlight
                                            ? 'bg-primary-foreground/20 text-primary-foreground'
                                            : 'bg-primary/10 text-primary-strong',
                                    )}
                                    title={m.files_web_warning_title()}
                                >
                                    {m.files_badge_web()}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <div className="mt-auto flex items-end justify-between gap-2">
                    <div className={cn('min-w-0 space-y-1 text-xs', muted)}>
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <Clock className="size-3.5 shrink-0" />
                            <span className="tabular-nums">{formatDuration(file.estPrintTimeSec)}</span>
                            {estimatedCost && (
                                <span
                                    className="inline-flex items-center gap-1 tabular-nums"
                                    title={m.cost_estimate_title({ value: estimatedCost })}
                                >
                                    <Coins className="ml-1.5 size-3.5 shrink-0" />≈ {estimatedCost}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {usedFilaments.map((f) => (
                                <span
                                    key={f.slotIndex}
                                    className="inline-block size-3 shrink-0 rounded-full ring-1 ring-black/15"
                                    style={{ background: f.colorHex }}
                                    title={`${f.material} (T${f.slotIndex})`}
                                />
                            ))}
                            <span className="truncate">
                                {[usedFilaments[0]?.material, formatBytes(file.sizeBytes)].filter(Boolean).join(', ')}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onPrint}
                        disabled={!canPrint}
                        title={m.common_print()}
                        aria-label={`${m.common_print()}: ${name}`}
                        className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 [&_svg]:size-4',
                            highlight
                                ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25'
                                : 'bg-primary text-primary-foreground hover:opacity-90',
                        )}
                    >
                        <Play />
                    </button>
                </div>
            </div>
        </article>
    );
}
