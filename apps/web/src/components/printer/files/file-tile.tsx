import type { GcodeFileDto } from '@kobralink/shared';
import { Download, Eye, ListPlus, Play, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatBytes, formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { jobStatusLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { IconButton } from './icon-button';

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
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <IconButton title={m.files_preview()} onClick={onPreview}>
                        <Eye />
                    </IconButton>
                    <IconButton title={m.queue_add()} onClick={onQueue}>
                        <ListPlus />
                    </IconButton>
                    <IconButton title={m.common_download()} asChild>
                        <a href={api.files.downloadUrl(printerId, file.id)} download>
                            <Download />
                        </a>
                    </IconButton>
                    <IconButton title={m.common_delete()} onClick={onDelete}>
                        <Trash2 />
                    </IconButton>
                </div>
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
