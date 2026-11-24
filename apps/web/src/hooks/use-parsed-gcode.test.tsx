import type { GcodeFileDto } from '@kobralink/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testQueryClient } from '@/test/render';
import { useParsedGcode } from './use-parsed-gcode';

const file = (patch: Partial<GcodeFileDto> = {}) => ({ id: 'f1', filename: 'cube.gcode', ...patch }) as GcodeFileDto;
const fetchMock = vi.fn();
const terminate = vi.fn();

class FakeWorker {
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    terminate = terminate;
    postMessage() {
        queueMicrotask(() => this.onmessage?.({ data: { ok: true, data: { layers: [{}, {}] } } }));
    }
}

function setup() {
    const queryClient = testQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return (f: GcodeFileDto) => renderHook(() => useParsedGcode('p1', f), { wrapper });
}

beforeEach(() => {
    fetchMock.mockReset().mockImplementation(async () => new Response('G1 X1'));
    terminate.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe('useParsedGcode', () => {
    it('parses a file once for every component that shows it', async () => {
        const mount = setup();
        const first = mount(file());
        const second = mount(file());
        await waitFor(() => expect(first.result.current.kind).toBe('ready'));
        await waitFor(() => expect(second.result.current.kind).toBe('ready'));
        first.unmount();
        expect(mount(file()).result.current.kind).toBe('ready');
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(terminate).toHaveBeenCalledOnce();
    });

    it('reports a failed download', async () => {
        fetchMock.mockResolvedValue(new Response('', { status: 404 }));
        const { result } = setup()(file());
        await waitFor(() => expect(result.current).toEqual({ kind: 'error', message: 'HTTP 404' }));
    });

    it('aborts the download when nobody needs it any more', async () => {
        let signal: AbortSignal | undefined;
        fetchMock.mockImplementation((_url: string, init: RequestInit) => {
            signal = init.signal ?? undefined;
            return new Promise(() => {});
        });
        const { unmount } = setup()(file());
        await waitFor(() => expect(signal).toBeDefined());
        unmount();
        expect(signal?.aborted).toBe(true);
    });

    it('refuses binary gcode without downloading it', () => {
        expect(setup()(file({ filename: 'cube.bgcode' })).result.current.kind).toBe('error');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
