import type { GcodeFileDto, PrinterLiveState } from '@farolprint/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrintReadyForm } from '@/components/printer/files/print-ready-form';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { renderWithProviders } from '@/test/render';
import { useFileActions } from './use-file-actions';

const { create, verify, upload, queueAdd, toast } = vi.hoisted(() => ({
    create: vi.fn(),
    verify: vi.fn(),
    upload: vi.fn(),
    queueAdd: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/lib/api', () => ({
    api: new Proxy(
        { schedule: { create }, files: { verify, upload }, queue: { add: queueAdd } } as Record<string, unknown>,
        {
            get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
        },
    ),
}));

vi.mock('@/hooks/use-printers', () => ({
    useLiveState: () => ({ connected: true, printState: 'standby' }) as unknown as PrinterLiveState,
    usePrinter: () => ({ settings: { webUploadWarning: false } }),
}));

const file = { id: 'f1', filename: 'bracket.gcode', webUnverified: false } as unknown as GcodeFileDto;
const result = {
    excludedObjects: [] as string[],
    autoLeveling: true,
    vibrationCompensation: false,
    flowCalibration: true,
    timelapse: false,
    failureDetection: false,
};

function Probe({ target }: { target: GcodeFileDto }) {
    const actions = useFileActions('p1');
    return (
        <>
            <button type="button" onClick={() => actions.requestPrint(target)}>
                open
            </button>
            <button
                type="button"
                onClick={() => void actions.uploadMany([new File(['G28'], target.filename)] as unknown as FileList)}
            >
                upload
            </button>
        </>
    );
}

type FormProps = React.ComponentProps<typeof PrintReadyForm>;

async function openDialogFor(target: GcodeFileDto, button = 'open'): Promise<FormProps> {
    let content: ReactElement<FormProps> | null = null;
    const open = vi.spyOn(confirmationDialogStore.actions, 'openDialog').mockImplementation((data) => {
        if (isValidElement<FormProps>(data?.content)) content = data.content;
    });
    await renderWithProviders(<Probe target={target} />);
    await userEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    open.mockRestore();
    if (!content) throw new Error('dialog not opened');
    const element: ReactElement<FormProps> = content;
    expect(element.type).toBe(PrintReadyForm);
    return element.props;
}

beforeEach(() => {
    create.mockReset().mockResolvedValue({ filename: 'bracket.gcode', startAt: '2026-11-01T08:00:00.000Z' });
    verify.mockReset().mockResolvedValue(undefined);
    upload.mockReset().mockResolvedValue(file);
    queueAdd.mockReset().mockResolvedValue({ filename: 'bracket.gcode' });
    toast.success.mockReset();
    toast.error.mockReset();
});

describe('useFileActions scheduling', () => {
    it('hands the dialog a schedule handler that stores the options and start time', async () => {
        const props = await openDialogFor(file);
        expect(props.onSchedule).toBeTypeOf('function');
        expect(props.onQueue).toBeUndefined();
        await act(async () => {
            await props.onSchedule?.({ ...result, excludedObjects: ['cube'] }, '2026-11-01T08:00:00.000Z');
        });
        expect(create).toHaveBeenCalledWith('p1', {
            fileId: 'f1',
            startAt: '2026-11-01T08:00:00.000Z',
            ...result,
            excludedObjects: ['cube'],
        });
        expect(verify).not.toHaveBeenCalled();
        await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
        expect(String(toast.success.mock.calls[0][0])).toContain('bracket.gcode');
    });

    it('verifies a web upload before scheduling it', async () => {
        const props = await openDialogFor({ ...file, webUnverified: true });
        await act(async () => {
            await props.onSchedule?.(result, '2026-11-01T08:00:00.000Z');
        });
        expect(verify).toHaveBeenCalledWith('p1', 'f1');
        expect(create).toHaveBeenCalledOnce();
    });

    it('reports a failed schedule', async () => {
        create.mockRejectedValueOnce(new Error('too late'));
        const props = await openDialogFor(file);
        await act(async () => {
            await props.onSchedule?.(result, '2026-11-01T08:00:00.000Z').catch(() => undefined);
        });
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('too late'));
        expect(toast.success).not.toHaveBeenCalled();
    });
});

describe('useFileActions queueing', () => {
    it('queues an upload with every option chosen in the dialog', async () => {
        const props = await openDialogFor(file, 'upload');
        expect(props.onQueue).toBeTypeOf('function');
        const chosen = {
            ...result,
            excludedObjects: ['cube'],
            autoLeveling: false,
            vibrationCompensation: false,
            filamentAssignments: [{ paintIndex: 0, slotIndex: 2, isUsed: true }],
        };
        await act(async () => {
            props.onQueue?.(chosen, { printerId: 'p1', targetTags: [] });
        });
        await waitFor(() =>
            expect(queueAdd).toHaveBeenCalledWith({ fileId: 'f1', ...chosen, printerId: 'p1', targetTags: [] }),
        );
        await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    });
});
