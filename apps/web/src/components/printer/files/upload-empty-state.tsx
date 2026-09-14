import { Plus, Upload } from 'lucide-react';
import { m } from '@/lib/i18n';

export function UploadEmptyState({
    title,
    hint,
    uploading,
    onPick,
}: {
    title: string;
    hint: string;
    uploading: boolean;
    onPick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onPick}
            disabled={uploading}
            className="flex min-h-64 w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-primary/40 bg-secondary/30 p-8 text-center transition-colors hover:border-primary hover:bg-secondary/50 disabled:opacity-50"
        >
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Upload className="size-7" />
            </div>
            <div className="max-w-sm space-y-1">
                <h3 className="text-base font-semibold text-foreground">{title}</h3>
                <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <span className="mt-2 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
                <Plus className="mr-1.5 size-4" />
                {uploading ? m.files_uploading() : m.files_add_gcode()}
            </span>
        </button>
    );
}

export function DropOverlay() {
    return (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-card/95 p-6 text-center text-sm text-foreground backdrop-blur-xs">
            <div className="flex size-16 items-center justify-center rounded-3xl bg-primary/15 text-primary">
                <Upload className="size-8" />
            </div>
            <div className="space-y-1">
                <p className="text-base font-medium">{m.files_drop_hint()}</p>
                <p className="text-xs text-muted-foreground">.gcode, .bgcode</p>
            </div>
        </div>
    );
}
