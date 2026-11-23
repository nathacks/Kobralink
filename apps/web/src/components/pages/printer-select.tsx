import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PrinterWithLive } from '@/lib/api';
import { m } from '@/lib/i18n';

export const ALL_PRINTERS = '__all';

export function PrinterSelect({
    printers,
    value,
    onChange,
    allowAll = false,
}: {
    printers: PrinterWithLive[];
    value: string;
    onChange: (id: string) => void;
    allowAll?: boolean;
}) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="w-56 rounded-full" aria-label={m.stats_all_printers()}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {allowAll && <SelectItem value={ALL_PRINTERS}>{m.stats_all_printers()}</SelectItem>}
                {printers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                        {p.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
