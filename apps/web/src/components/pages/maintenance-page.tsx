import { MaintenanceCard } from '@/components/printer/maintenance-card';
import { usePrinters } from '@/hooks/use-printers';
import { m } from '@/lib/i18n';
import { PageHeader } from './page-header';

export function MaintenancePage() {
    const printers = usePrinters();
    return (
        <div className="grid gap-4">
            <PageHeader title={m.nav_maintenance()} hint={m.maintenance_page_hint()} />
            {printers.length === 0 && <p className="px-2 text-sm text-muted-foreground">{m.page_no_printer()}</p>}
            <div className="grid gap-4 lg:grid-cols-2">
                {printers.map((p) => (
                    <section key={p.id} className="grid gap-2">
                        <h3 className="px-2 text-sm font-medium text-muted-foreground">{p.name}</h3>
                        <MaintenanceCard printerId={p.id} />
                    </section>
                ))}
            </div>
        </div>
    );
}
