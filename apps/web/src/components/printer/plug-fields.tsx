import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { m } from '@/lib/i18n';
import { haEnergySensorsQuery, haSwitchesQuery } from '@/lib/queries';

const NONE = 'none';

interface Option {
    entityId: string;
    label: string;
}

function EntitySelect({
    label,
    hint,
    none,
    value,
    options,
    error,
    onChange,
}: {
    label: string;
    hint: string;
    none: string;
    value: string;
    options: Option[];
    error: string | null;
    onChange: (v: string) => void;
}) {
    const all =
        value && !options.some((o) => o.entityId === value) ? [{ entityId: value, label: value }, ...options] : options;
    return (
        <div className="grid gap-2">
            <Label>{label}</Label>
            <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
                <SelectTrigger className="w-full rounded-full" aria-label={label}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>{none}</SelectItem>
                    {all.map((o) => (
                        <SelectItem key={o.entityId} value={o.entityId}>
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="px-4 text-xs text-muted-foreground">{hint}</p>
            {error && <p className="px-4 text-xs text-destructive">{error}</p>}
        </div>
    );
}

export function PlugSwitchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const switches = useQuery(haSwitchesQuery);
    return (
        <EntitySelect
            label={m.plug_switch()}
            hint={m.plug_switch_hint()}
            none={m.plug_switch_none()}
            value={value}
            options={(switches.data ?? []).map((s) => ({ entityId: s.entityId, label: s.name }))}
            error={switches.error?.message ?? null}
            onChange={onChange}
        />
    );
}

export function EnergySensorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const sensors = useQuery(haEnergySensorsQuery);
    return (
        <EntitySelect
            label={m.energy_sensor()}
            hint={m.energy_sensor_hint()}
            none={m.energy_sensor_none()}
            value={value}
            options={(sensors.data ?? []).map((s) => ({
                entityId: s.entityId,
                label: s.kwh === null ? s.name : `${s.name} · ${m.energy_kwh({ kwh: s.kwh.toFixed(2) })}`,
            }))}
            error={sensors.error?.message ?? null}
            onChange={onChange}
        />
    );
}
