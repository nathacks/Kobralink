import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { HistoryList } from '@/components/printer/files/history-list';
import { Card, CardContent } from '@/components/ui/card';
import { usePrinters } from '@/hooks/use-printers';
import { m } from '@/lib/i18n';
import { allHistoryQuery } from '@/lib/queries';
import { PageHeader } from './page-header';
import { ALL_PRINTERS, PrinterSelect } from './printer-select';

export function HistoryPage() {
    const printers = usePrinters();
    const [printerId, setPrinterId] = useState(ALL_PRINTERS);
    const filter = printerId === ALL_PRINTERS ? undefined : printerId;
    const jobs = useQuery(allHistoryQuery(filter));
    const names = Object.fromEntries(printers.map((p) => [p.id, p.name]));
    return (
        <div className="grid gap-4">
            <PageHeader title={m.nav_history()} hint={m.history_page_hint()}>
                {printers.length > 1 && (
                    <PrinterSelect printers={printers} value={printerId} onChange={setPrinterId} allowAll />
                )}
            </PageHeader>
            <Card className="rounded-3xl border-0 shadow-none">
                <CardContent>
                    <HistoryList
                        printerId={filter ?? ''}
                        jobs={jobs.data ?? []}
                        printerNames={printers.length > 1 ? names : undefined}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
