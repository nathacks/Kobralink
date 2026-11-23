import type { GcodeFileDto } from '@farolprint/shared';
import { QueryClient } from '@tanstack/react-query';
import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrintReadyForm } from '@/components/printer/files/print-ready-form';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { openPrintReadyDialog, pendingFileReady } from './print-ready-watcher';

const { queueAdd, print, scheduleCreate, clearFileReady, toast } = vi.hoisted(() => ({
    queueAdd: vi.fn(),
    print: vi.fn(),
    scheduleCreate: vi.fn(),
    clearFileReady: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/lib/api', () => ({
    api: {
        queue: { add: queueAdd },
        files: { print },
        schedule: { create: scheduleCreate },
        control: { clearFileReady },
    },
}));

vi.mock('@/lib/queries', () => ({
    filesQuery: (printerId: string) => ({ queryKey: ['printers', printerId, 'files'] }),
}));

const file = { id: 'f1', filename: 'bracket.gcode' } as unknown as GcodeFileDto;
const chosen = {
    excludedObjects: ['cube'],
    autoLeveling: false,
    vibrationCompensation: false,
    flowCalibration: false,
    timelapse: true,
    failureDetection: false,
};

type FormProps = React.ComponentProps<typeof PrintReadyForm>;

async function openFor(filename: string): Promise<{ opened: boolean; props: FormProps | null }> {
    const qc = new QueryClient();
    qc.setQueryData(['printers', 'p1', 'files'], [file]);
    vi.spyOn(qc, 'fetchQuery').mockResolvedValue([file]);
    let props: FormProps | null = null;
    const open = vi.spyOn(confirmationDialogStore.actions, 'openDialog').mockImplementation((data) => {
        if (isValidElement<FormProps>(data?.content)) props = (data.content as ReactElement<FormProps>).props;
    });
    const opened = await openPrintReadyDialog(qc, 'p1', filename);
    open.mockRestore();
    return { opened, props };
}

beforeEach(() => {
    queueAdd.mockReset().mockResolvedValue({ filename: 'bracket.gcode' });
    print.mockReset().mockResolvedValue({ filename: 'bracket.gcode' });
    scheduleCreate.mockReset().mockResolvedValue({ filename: 'bracket.gcode', startAt: '2030-01-01T08:00:00.000Z' });
    clearFileReady.mockReset().mockResolvedValue(undefined);
    toast.success.mockReset();
    toast.error.mockReset();
});

describe('openPrintReadyDialog', () => {
    it('does not open for a file missing from the library', async () => {
        const { opened, props } = await openFor('other.gcode');
        expect(opened).toBe(false);
        expect(props).toBeNull();
    });

    it('queues the file with every option chosen in the dialog', async () => {
        const { opened, props } = await openFor('bracket.gcode');
        expect(opened).toBe(true);
        await props?.onQueue?.(chosen, { printerId: null, targetTags: ['petg'] });
        expect(queueAdd).toHaveBeenCalledWith({ fileId: 'f1', ...chosen, printerId: null, targetTags: ['petg'] });
        expect(clearFileReady).toHaveBeenCalledWith('p1');
        expect(toast.success).toHaveBeenCalledOnce();
    });

    it('prints the file with the options chosen in the dialog', async () => {
        const { props } = await openFor('bracket.gcode');
        await props?.onPrint(chosen);
        expect(print).toHaveBeenCalledWith('p1', { fileId: 'f1', ...chosen });
    });

    it('reports a failed queue add', async () => {
        queueAdd.mockRejectedValueOnce(new Error('queue full'));
        const { props } = await openFor('bracket.gcode');
        await props?.onQueue?.(chosen, { printerId: 'p1', targetTags: [] });
        expect(toast.error).toHaveBeenCalledWith('queue full');
    });

    it('schedules the file with the start time and every option chosen in the dialog', async () => {
        const { props } = await openFor('bracket.gcode');
        await props?.onSchedule?.(chosen, '2030-01-01T08:00:00.000Z');
        expect(scheduleCreate).toHaveBeenCalledWith('p1', {
            fileId: 'f1',
            startAt: '2030-01-01T08:00:00.000Z',
            ...chosen,
        });
        expect(clearFileReady).toHaveBeenCalledWith('p1');
        expect(toast.success).toHaveBeenCalledOnce();
    });

    it('reports a failed schedule and keeps the dialog open', async () => {
        scheduleCreate.mockRejectedValueOnce(new Error('start time is in the past'));
        const { props } = await openFor('bracket.gcode');
        await expect(props?.onSchedule?.(chosen, '2020-01-01T08:00:00.000Z')).rejects.toThrow(
            'start time is in the past',
        );
        expect(toast.error).toHaveBeenCalledWith('start time is in the past');
        expect(clearFileReady).not.toHaveBeenCalled();
    });
});

describe('pendingFileReady', () => {
    const printer = (printState: string, fileReady: string, printStartDialog = true) => ({
        settings: { printStartDialog },
        live: { printState, fileReady, fileReadyTs: 42 },
    });
    const state = (printers: Record<string, ReturnType<typeof printer>>) =>
        ({ order: Object.keys(printers), printers }) as unknown as Parameters<typeof pendingFileReady>[0];

    it('offers a file sent from the slicer while another print is running', () => {
        expect(pendingFileReady(state({ p1: printer('printing', 'next.gcode') }))).toEqual({
            printerId: 'p1',
            filename: 'next.gcode',
            ts: 42,
        });
        expect(pendingFileReady(state({ p1: printer('paused', 'next.gcode') }))?.filename).toBe('next.gcode');
    });

    it('offers a file on an idle printer', () => {
        expect(pendingFileReady(state({ p1: printer('standby', 'part.gcode') }))?.printerId).toBe('p1');
    });

    it('skips printers without a ready file or with the dialog turned off', () => {
        expect(pendingFileReady(state({ p1: printer('printing', '') }))).toBeNull();
        expect(
            pendingFileReady(state({ p1: printer('standby', 'a.gcode', false), p2: printer('printing', 'b.gcode') })),
        ).toMatchObject({ printerId: 'p2', filename: 'b.gcode' });
    });
});
