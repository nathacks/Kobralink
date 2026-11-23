import type { PrintJobDto } from '@kobralink/shared';

const COLUMNS = [
    'started_at',
    'finished_at',
    'printer',
    'file',
    'status',
    'duration_sec',
    'estimated_sec',
    'filament_mm',
    'energy_kwh',
    'failure_reason',
    'error_code',
    'error_msg',
    'note',
    'cost_filament',
    'cost_energy',
    'cost_total',
    'currency',
] as const;

function cell(v: string | number | null | undefined): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function jobsToCsv(jobs: PrintJobDto[], printerNames: ReadonlyMap<string, string>, currency: string): string {
    const lines = [COLUMNS.join(',')];
    for (const j of jobs) {
        lines.push(
            [
                j.startedAt,
                j.finishedAt,
                printerNames.get(j.printerId) ?? j.printerId,
                j.filename,
                j.status,
                j.durationSec,
                j.estimatedSec,
                Math.round(j.filamentMm),
                j.energyKwh,
                j.failureReason,
                j.errorCode || '',
                j.errorMsg,
                j.note,
                j.cost?.filament ?? '',
                j.cost?.energy ?? '',
                j.cost?.total ?? '',
                j.cost ? currency : '',
            ]
                .map(cell)
                .join(','),
        );
    }
    return `${lines.join('\r\n')}\r\n`;
}
