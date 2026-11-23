import { type PrinterSpecs, printerSpecs } from '@kobralink/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { m } from '@/lib/i18n';

const ACE_LABEL: Record<NonNullable<PrinterSpecs['ace']>, () => string> = {
    builtin: m.specs_ace_builtin,
    optional: m.specs_ace_optional,
    none: m.specs_ace_none,
};

function nozzleText(s: PrinterSpecs): string | null {
    if (s.defaultNozzleMm === null) return s.nozzleSizesMm.length ? `${s.nozzleSizesMm.join(' / ')} mm` : null;
    const others = s.nozzleSizesMm.filter((n) => n !== s.defaultNozzleMm);
    return others.length
        ? m.specs_nozzles_value({ standard: s.defaultNozzleMm, others: others.join(' / ') })
        : `${s.defaultNozzleMm} mm`;
}

function powerText(s: PrinterSpecs): string | null {
    if (s.ratedPowerByMainsW) return m.specs_power_mains(s.ratedPowerByMainsW);
    return s.ratedPowerW === null ? null : `${s.ratedPowerW} W`;
}

export function specRows(s: PrinterSpecs): { label: string; value: string; hint?: string }[] {
    const v = s.buildVolumeMm;
    const rows: { label: string; value: string | null; hint?: string }[] = [
        { label: m.specs_volume(), value: v ? `${v.x} × ${v.y} × ${v.z} mm` : null },
        { label: m.specs_nozzles(), value: nozzleText(s) },
        {
            label: m.specs_temps(),
            value:
                s.maxNozzleC !== null && s.maxBedC !== null
                    ? m.specs_temps_value({ nozzle: s.maxNozzleC, bed: s.maxBedC })
                    : null,
        },
        { label: m.specs_power(), value: powerText(s), hint: m.specs_power_hint() },
        { label: m.specs_ace(), value: s.ace ? ACE_LABEL[s.ace]() : null },
    ];
    return rows.filter((r): r is { label: string; value: string; hint?: string } => r.value !== null);
}

export function PrinterSpecsCard({ modeId, className }: { modeId: string; className?: string }) {
    const specs = printerSpecs(modeId);
    return (
        <Card className={className ?? 'rounded-3xl border-0 shadow-none'}>
            <CardHeader>
                <CardTitle>{m.specs_title()}</CardTitle>
                <CardDescription>
                    {specs ? m.specs_hint({ model: specs.name }) : m.specs_unknown({ modeId: modeId || '—' })}
                </CardDescription>
            </CardHeader>
            {specs && (
                <CardContent className="grid gap-3">
                    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                        {specRows(specs).map((r) => (
                            <div key={r.label}>
                                <dt className="text-xs text-muted-foreground">{r.label}</dt>
                                <dd className="text-sm font-medium">{r.value}</dd>
                                {r.hint && <dd className="text-xs text-muted-foreground">{r.hint}</dd>}
                            </div>
                        ))}
                    </dl>
                    <div className="text-xs text-muted-foreground">
                        {m.specs_sources()}:{' '}
                        {specs.sources.map((url, i) => (
                            <span key={url}>
                                {i > 0 && ' · '}
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary-strong underline-offset-4 hover:underline"
                                >
                                    {new URL(url).hostname}
                                </a>
                            </span>
                        ))}
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
