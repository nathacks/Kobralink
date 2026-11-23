import { useState } from 'react';
import { FilesCard } from '@/components/printer/files/files-card';
import { usePrinters } from '@/hooks/use-printers';
import { m } from '@/lib/i18n';
import { PageHeader } from './page-header';
import { PrinterSelect } from './printer-select';

export function FilesPage() {
    const printers = usePrinters();
    const [chosen, setChosen] = useState('');
    const printerId = printers.some((p) => p.id === chosen) ? chosen : (printers[0]?.id ?? '');
    return (
        <div className="grid gap-4">
            <PageHeader title={m.nav_files()} hint={m.files_page_hint()}>
                {printers.length > 1 && <PrinterSelect printers={printers} value={printerId} onChange={setChosen} />}
            </PageHeader>
            {printerId ? (
                <FilesCard key={printerId} printerId={printerId} />
            ) : (
                <p className="px-2 text-sm text-muted-foreground">{m.page_no_printer()}</p>
            )}
        </div>
    );
}
