import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import { installCrashGuard, isNetworkError } from '../src/common/crash-guard';

function setup() {
    const proc = Object.assign(new EventEmitter(), { exits: [] as number[] });
    const guarded = { on: proc.on.bind(proc), exit: (code: number) => proc.exits.push(code) };
    const lines = { warn: [] as string[], error: [] as string[] };
    installCrashGuard({ warn: (m) => lines.warn.push(m), error: (m) => lines.error.push(m) }, guarded);
    return { proc, lines };
}

const netError = (code: string) => Object.assign(new Error(`read ${code}`), { code });

describe('isNetworkError', () => {
    it('recognises the socket errors a printer going away causes', () => {
        for (const code of ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH']) {
            expect(isNetworkError(netError(code))).toBe(true);
        }
    });

    it('rejects anything else', () => {
        expect(isNetworkError(new Error('boom'))).toBe(false);
        expect(isNetworkError(Object.assign(new Error('in use'), { code: 'EADDRINUSE' }))).toBe(false);
        expect(isNetworkError('ECONNRESET')).toBe(false);
        expect(isNetworkError(null)).toBe(false);
    });
});

describe('installCrashGuard', () => {
    it('keeps the server running after a stray network error', () => {
        const h = setup();
        h.proc.emit('uncaughtException', netError('ECONNRESET'));
        h.proc.emit('unhandledRejection', netError('EPIPE'));
        expect(h.proc.exits).toEqual([]);
        expect(h.lines.warn).toEqual([
            'Uncaught network error ignored (ECONNRESET): read ECONNRESET',
            'Unhandled rejection network error ignored (EPIPE): read EPIPE',
        ]);
    });

    it('still stops on any other error, with its stack', () => {
        const h = setup();
        h.proc.emit('uncaughtException', new Error('boom'));
        h.proc.emit('unhandledRejection', 'bad');
        expect(h.proc.exits).toEqual([1, 1]);
        expect(h.lines.error[0]).toStartWith('Uncaught: Error: boom');
        expect(h.lines.error[1]).toBe('Unhandled rejection: bad');
    });
});
