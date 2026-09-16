import { createFileRoute } from '@tanstack/react-router';
import { Download, Pause, Play, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSse, useSseStatus } from '@/components/providers/sse-provider';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePrinters } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/logs')({ component: LogsPage });

interface LogEntry {
    id: number;
    ts: number;
    level: 'log' | 'error' | 'warn' | 'debug' | 'verbose';
    context: string;
    message: string;
    printerId?: string;
}

const LEVELS: LogEntry['level'][] = ['error', 'warn', 'log', 'debug'];
const LEVEL_LABEL: Record<string, () => string> = {
    error: m.logs_level_error,
    warn: m.logs_level_warn,
    log: m.logs_level_log,
    debug: m.logs_level_debug,
    verbose: m.logs_level_verbose,
};
const LEVEL_CLASS: Record<string, string> = {
    error: 'text-destructive',
    warn: 'text-amber-500',
    log: 'text-foreground',
    debug: 'text-muted-foreground',
    verbose: 'text-muted-foreground',
};
const MAX = 2000;

function LogsPage() {
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [paused, setPaused] = useState(false);
    const [filter, setFilter] = useState('');
    const [levels, setLevels] = useState<Set<string>>(new Set(['error', 'warn', 'log']));
    const [source, setSource] = useState('all');
    const printers = usePrinters();
    const pending = useRef<LogEntry[]>([]);
    const seq = useRef(0);
    const bottomRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const tag = (items: Omit<LogEntry, 'id'>[]): LogEntry[] => items.map((e) => ({ ...e, id: seq.current++ }));
    const push = (items: LogEntry[]) => {
        if (paused) {
            pending.current.push(...items);
            return;
        }
        setEntries((cur) => [...cur, ...items].slice(-MAX));
    };
    useSse<Omit<LogEntry, 'id'>[]>('logs', 'snapshot', (items) => setEntries(tag(items).slice(-MAX)));
    useSse<Omit<LogEntry, 'id'>>('logs', 'log', (entry) => push(tag([entry])));
    const connected = useSseStatus() === 'open';

    useEffect(() => {
        if (!paused && pending.current.length) {
            const items = pending.current;
            pending.current = [];
            setEntries((cur) => [...cur, ...items].slice(-MAX));
        }
    }, [paused]);

    const matchesSource = (e: LogEntry) =>
        source === 'all' ? true : source === 'system' ? !e.printerId : e.printerId === source;
    const visible = entries.filter(
        (e) =>
            levels.has(e.level) &&
            matchesSource(e) &&
            (!filter || `${e.context} ${e.message}`.toLowerCase().includes(filter.toLowerCase())),
    );

    const lastId = visible.at(-1)?.id;
    useEffect(() => {
        if (!paused && lastId !== undefined) bottomRef.current?.scrollIntoView({ block: 'end' });
    }, [lastId, paused]);

    const toggleLevel = (l: string) =>
        setLevels((cur) => {
            const next = new Set(cur);
            if (next.has(l)) next.delete(l);
            else next.add(l);
            return next;
        });

    return (
        <section className="flex h-[calc(100svh-9rem)] flex-col rounded-3xl bg-card p-6 text-card-foreground">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-medium">{m.logs_title()}</h2>
                <span className={cn('size-2 rounded-full', connected ? 'bg-primary' : 'bg-muted-foreground/50')} />
                <Select value={source} onValueChange={setSource}>
                    <SelectTrigger className="w-52 rounded-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{m.logs_source_all()}</SelectItem>
                        <SelectItem value="system">{m.logs_source_system()}</SelectItem>
                        {printers.length > 0 && <SelectSeparator />}
                        {printers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                {p.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="flex gap-1 rounded-full bg-secondary p-1">
                    {LEVELS.map((l) => (
                        <button
                            key={l}
                            type="button"
                            onClick={() => toggleLevel(l)}
                            className={cn(
                                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                                levels.has(l)
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {LEVEL_LABEL[l]?.() ?? l}
                        </button>
                    ))}
                </div>
                <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={m.logs_filter()}
                    className="min-w-40 flex-1 rounded-full bg-secondary px-4 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                <div className="ml-auto flex gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-full"
                        onClick={() => setPaused((p) => !p)}
                        title={paused ? m.logs_resume_scroll() : m.logs_pause_scroll()}
                    >
                        {paused ? <Play /> : <Pause />}
                        {paused
                            ? pending.current.length
                                ? m.logs_resume_pending({ count: pending.current.length })
                                : m.common_resume()
                            : m.common_pause()}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-full"
                        onClick={() => setEntries([])}
                        title={m.logs_clear()}
                    >
                        <Trash2 />
                    </Button>
                    <Button asChild size="sm" className="rounded-full">
                        <a
                            href={
                                source === 'all' ? api.logs.downloadUrl : `${api.logs.downloadUrl}?printerId=${source}`
                            }
                            download="kobralink-log.txt"
                        >
                            <Download /> {m.common_download()}
                        </a>
                    </Button>
                </div>
            </div>
            <div
                ref={listRef}
                className="mt-4 flex-1 overflow-auto rounded-2xl bg-secondary/50 p-3 font-mono text-xs leading-5"
            >
                {visible.length === 0 ? (
                    <p className="p-2 text-muted-foreground">{m.logs_empty()}</p>
                ) : (
                    visible.map((e) => (
                        <div
                            key={e.id}
                            className={cn(
                                'flex flex-wrap gap-x-3 whitespace-pre-wrap break-all md:flex-nowrap',
                                LEVEL_CLASS[e.level],
                            )}
                        >
                            <span className="shrink-0 tabular-nums text-muted-foreground">{formatTime(e.ts)}</span>
                            <span className="shrink-0 uppercase text-muted-foreground md:w-16">{e.level}</span>
                            <span className="shrink-0 text-muted-foreground">[{e.context}]</span>
                            <span className="basis-full md:basis-auto">{e.message}</span>
                        </div>
                    ))
                )}
                <div ref={bottomRef} />
            </div>
        </section>
    );
}
