import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatDuration } from '@/lib/format';
import { historyQuery } from '@/lib/queries';

const STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    printing: { label: 'En cours', variant: 'outline' },
    completed: { label: 'Terminé', variant: 'default' },
    cancelled: { label: 'Annulé', variant: 'secondary' },
    error: { label: 'Erreur', variant: 'destructive' },
};

export function HistoryCard({ printerId }: { printerId: string }) {
    const jobs = useQuery(historyQuery(printerId));
    return (
        <Card>
            <CardHeader>
                <CardTitle>Historique</CardTitle>
            </CardHeader>
            <CardContent>
                {jobs.data?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune impression enregistrée.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fichier</TableHead>
                                <TableHead>Début</TableHead>
                                <TableHead>Durée</TableHead>
                                <TableHead>Statut</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {jobs.data?.map((j) => {
                                const st = STATUS[j.status] ?? { label: j.status, variant: 'secondary' as const };
                                return (
                                    <TableRow key={j.id}>
                                        <TableCell className="max-w-64 truncate" title={j.filename}>
                                            {j.filename}
                                        </TableCell>
                                        <TableCell>{formatDate(j.startedAt)}</TableCell>
                                        <TableCell>{formatDuration(j.durationSec ?? 0)}</TableCell>
                                        <TableCell>
                                            <Badge variant={st.variant}>{st.label}</Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
