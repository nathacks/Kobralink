import { createFileRoute } from '@tanstack/react-router';
import { Check, Copy, ExternalLink, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiKeysCard } from '@/components/slicer/api-keys-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHosts } from '@/hooks/use-hosts';
import { usePrinters } from '@/hooks/use-printers';
import { m } from '@/lib/i18n';

export const Route = createFileRoute('/_app/slicer')({ component: SlicerPage });

const ORCA_WIKI = 'https://github.com/SoftFever/OrcaSlicer/wiki';
function CopyButton({ value }: { value: string }) {
    const [done, setDone] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            toast.success(m.slicer_copied());
            setTimeout(() => setDone(false), 1500);
        } catch (e) {
            toast.error((e as Error).message);
        }
    };
    return (
        <Button size="sm" className="rounded-full" onClick={copy} title={m.slicer_copy()}>
            {done ? <Check /> : <Copy />} {m.slicer_copy()}
        </Button>
    );
}

function SlicerPage() {
    const printers = usePrinters();
    const hosts = useHosts();
    const [primary, ...others] = hosts;
    const steps = [
        [m.slicer_step_1_title(), m.slicer_step_1()],
        [m.slicer_step_2_title(), m.slicer_step_2()],
        [m.slicer_step_3_title(), m.slicer_step_3()],
        [m.slicer_step_4_title(), m.slicer_step_4()],
    ];
    const firstPort = printers[0]?.httpPort ?? 7125;
    const notes = [m.slicer_note_running(), m.slicer_note_firewall({ port: firstPort }), m.slicer_note_ams()];

    return (
        <div className="space-y-4">
            <div className="px-2">
                <h2 className="text-xl font-medium">{m.slicer_title()}</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{m.slicer_intro()}</p>
            </div>

            <Card className="rounded-3xl">
                <CardHeader>
                    <CardTitle>{m.slicer_addresses_title()}</CardTitle>
                    <CardDescription>{m.slicer_addresses_hint()}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {printers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{m.slicer_addresses_empty()}</p>
                    ) : (
                        printers.map((p) => {
                            const url = `http://${primary}:${p.httpPort}`;
                            return (
                                <div
                                    key={p.id}
                                    className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/50 px-4 py-3"
                                >
                                    <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                                        <Printer className="size-5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-baseline gap-x-3">
                                            <span className="font-medium">{p.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {m.slicer_port({ port: p.httpPort })}
                                            </span>
                                        </div>
                                        <code className="block truncate font-mono text-sm text-primary">{url}</code>
                                        {others.length > 0 && (
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {m.slicer_address_other({
                                                    hosts: others.map((h) => `http://${h}:${p.httpPort}`).join(' · '),
                                                })}
                                            </p>
                                        )}
                                    </div>
                                    <CopyButton value={url} />
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>

            <ApiKeysCard />

            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-3xl">
                    <CardHeader>
                        <CardTitle>{m.slicer_steps_title()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ol className="space-y-4">
                            {steps.map(([title, text], i) => (
                                <li key={title} className="flex gap-3">
                                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                                        {i + 1}
                                    </span>
                                    <div>
                                        <p className="font-medium">{title}</p>
                                        <p className="text-sm text-muted-foreground">{text}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </CardContent>
                </Card>

                <Card className="rounded-3xl">
                    <CardHeader>
                        <CardTitle>{m.slicer_notes_title()}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ul className="space-y-3">
                            {notes.map((n) => (
                                <li key={n} className="flex gap-3 text-sm text-muted-foreground">
                                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                                    <span>{n}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                            <Button asChild variant="secondary" size="sm" className="rounded-full">
                                <a href={ORCA_WIKI} target="_blank" rel="noreferrer">
                                    <ExternalLink /> {m.slicer_open_orca_docs()}
                                </a>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
