import type { GcodeFileDto } from '@kobralink/shared';
import { Download, Eye, ListPlus, MoreVertical, Play, Trash2 } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { formatBytes, formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { jobStatusLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';

export function FileTile({
    file,
    printerId,
    highlight,
    canPrint,
    onPrint,
    onDelete,
    onQueue,
    onPreview,
}: {
    file: GcodeFileDto;
    printerId: string;
    highlight: boolean;
    canPrint: boolean;
    onPrint: () => void;
    onDelete: () => void;
    onQueue: () => void;
    onPreview: () => void;
}) {
    return (
        <div
            className={cn(
                'group flex min-h-44 flex-col rounded-3xl p-4',
                highlight ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-background/40">
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
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label="Actions"
                            className={cn(
                                'flex size-8 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-4',
                                highlight
                                    ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground'
                                    : 'bg-background/40 hover:bg-background/70 text-foreground',
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
            <div className="mt-auto space-y-1 pt-4">
                <div className="flex items-center gap-1">
                    {file.filaments
                        .filter((f) => f.isUsed)
                        .map((f) => (
                            <span
                                key={f.slotIndex}
                                className="inline-block size-2.5 rounded-full ring-1 ring-black/10"
                                style={{ background: f.colorHex }}
                                title={`${f.material} (T${f.slotIndex})`}
                            />
                        ))}
                    {file.webUnverified && (
                        <span
                            className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
                                highlight
                                    ? 'bg-primary-foreground/20 text-primary-foreground'
                                    : 'bg-primary/10 text-primary',
                            )}
                            title={m.files_web_warning_title()}
                        >
                            {m.files_badge_web()}
                        </span>
                    )}
                    {file.lastJob && (
                        <span
                            className={cn(
                                'ml-auto text-[11px]',
                                highlight ? 'text-primary-foreground/80' : 'text-muted-foreground',
                            )}
                        >
                            {jobStatusLabel(file.lastJob.status)}
                        </span>
                    )}
                </div>
                <div className="truncate font-medium" title={file.filename}>
                    {file.filename}
                </div>
                <div
                    className={cn(
                        'flex items-center justify-between text-xs',
                        highlight ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}
                >
                    <span>
                        {formatDuration(file.estPrintTimeSec)} · {formatBytes(file.sizeBytes)}
                    </span>
                    <button
                        type="button"
                        onClick={onPrint}
                        disabled={!canPrint}
                        title={m.common_print()}
                        aria-label={m.common_print()}
                        className={cn(
                            'flex size-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 [&_svg]:size-3.5',
                            highlight
                                ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25'
                                : 'bg-primary text-primary-foreground hover:opacity-90',
                        )}
                    >
                        <Play />
                    </button>
                </div>
            </div>
        </div>
    );
}
