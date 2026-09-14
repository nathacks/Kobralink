import { EventEmitter } from 'node:events';
import { ConsoleLogger, type LogLevel } from '@nestjs/common';

export interface LogEntry {
    ts: number;
    level: LogLevel;
    context: string;
    message: string;
}

const MAX = 2000;

class LogBuffer extends EventEmitter<{ entry: [LogEntry] }> {
    private readonly entries: LogEntry[] = [];

    push(entry: LogEntry): void {
        this.entries.push(entry);
        if (this.entries.length > MAX) this.entries.splice(0, this.entries.length - MAX);
        this.emit('entry', entry);
    }

    all(): LogEntry[] {
        return [...this.entries];
    }
}

export const logBuffer = new LogBuffer();
logBuffer.setMaxListeners(100);

export class BufferedLogger extends ConsoleLogger {
    private record(level: LogLevel, message: unknown, context?: string): void {
        if (!this.isLevelEnabled(level)) return;
        const text =
            message instanceof Error
                ? (message.stack ?? message.message)
                : typeof message === 'string'
                  ? message
                  : JSON.stringify(message);
        logBuffer.push({ ts: Date.now(), level, context: context ?? '', message: text });
    }

    override log(message: unknown, context?: string): void {
        super.log(message, context);
        this.record('log', message, context);
    }

    override error(message: unknown, stackOrContext?: string, context?: string): void {
        super.error(message, stackOrContext, context);
        this.record('error', message, context ?? stackOrContext);
    }

    override warn(message: unknown, context?: string): void {
        super.warn(message, context);
        this.record('warn', message, context);
    }

    override debug(message: unknown, context?: string): void {
        super.debug(message, context);
        this.record('debug', message, context);
    }

    override verbose(message: unknown, context?: string): void {
        super.verbose(message, context);
        this.record('verbose', message, context);
    }
}
