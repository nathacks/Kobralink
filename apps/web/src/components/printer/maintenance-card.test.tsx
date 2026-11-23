import { MAINTENANCE_PRESETS, type MaintenanceTaskDto } from '@kobralink/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { renderWithProviders } from '@/test/render';
import { DoneForm, LogList, MaintenanceCard, presetLabel, TaskForm, taskName } from './maintenance-card';

const { tasks, maintenance, toast } = vi.hoisted(() => {
    const tasks: MaintenanceTaskDto[] = [
        {
            id: 't1',
            printerId: 'p1',
            name: 'Clean the nozzle',
            presetKey: '',
            note: 'Cold pull',
            intervalHours: 50,
            intervalJobs: 0,
            intervalDays: 0,
            lastDoneAt: null,
            usage: { hours: 62.5, jobs: 10, days: 3 },
            progress: 1.25,
            due: true,
            createdAt: '2026-10-01T00:00:00.000Z',
        },
        {
            id: 't2',
            printerId: 'p1',
            name: 'Lubricate the axes',
            presetKey: '',
            note: '',
            intervalHours: 100,
            intervalJobs: 20,
            intervalDays: 0,
            lastDoneAt: '2026-10-10T12:00:00.000Z',
            usage: { hours: 10, jobs: 2, days: 1 },
            progress: 0.1,
            due: false,
            createdAt: '2026-10-01T00:00:00.000Z',
        },
    ];
    return {
        tasks,
        maintenance: {
            list: vi.fn(),
            remove: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            complete: vi.fn(),
            logs: vi.fn(),
        },
        toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
    };
});

vi.mock('sonner', () => ({ toast }));

vi.mock('@/lib/api', () => ({
    api: new Proxy({ maintenance } as Record<string, unknown>, {
        get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
    }),
}));

beforeEach(() => {
    maintenance.list.mockReset().mockResolvedValue(tasks);
    maintenance.remove.mockReset().mockResolvedValue(undefined);
    maintenance.create.mockReset().mockResolvedValue(tasks[0]);
    maintenance.update.mockReset().mockResolvedValue(tasks[0]);
    maintenance.complete.mockReset().mockResolvedValue(tasks[0]);
    maintenance.logs.mockReset().mockResolvedValue([]);
    toast.success.mockReset();
    toast.error.mockReset();
});

describe('MaintenanceCard', () => {
    it('lists the tasks and flags the due ones', async () => {
        await renderWithProviders(<MaintenanceCard printerId="p1" />);
        expect(await screen.findByText('Clean the nozzle')).toBeTruthy();
        expect(screen.getByText('Lubricate the axes')).toBeTruthy();
        expect(screen.getByText('1 due')).toBeTruthy();
        expect(screen.getByText('Due')).toBeTruthy();
        expect(screen.getByText('every 50 h')).toBeTruthy();
        expect(screen.getByText('every 100 h · every 20 prints')).toBeTruthy();
        expect(screen.getByText('Never done')).toBeTruthy();
        expect(screen.getByText('Cold pull')).toBeTruthy();
    });

    it('shows recommended tasks in the current language and does not suggest them again', async () => {
        maintenance.list.mockResolvedValue([{ ...tasks[0], name: 'Limpar o bico', presetKey: 'clean_nozzle' }]);
        await renderWithProviders(<MaintenanceCard printerId="p1" />);
        expect(await screen.findByText(m.maintenance_preset_clean_nozzle())).toBeTruthy();
        expect(screen.queryByText('Limpar o bico')).toBeNull();
        const section = await screen.findByRole('region', { name: m.maintenance_recommended() });
        expect(section.textContent).not.toContain(m.maintenance_preset_clean_nozzle());
    });

    it('shows the empty state without tasks', async () => {
        maintenance.list.mockResolvedValue([]);
        await renderWithProviders(<MaintenanceCard printerId="p1" />);
        expect(await screen.findByText(m.maintenance_empty())).toBeTruthy();
        expect(screen.queryByText(/due/)).toBeNull();
    });

    it('suggests only the recommended tasks not added yet', async () => {
        await renderWithProviders(<MaintenanceCard printerId="p1" />);
        const section = await screen.findByRole('region', { name: m.maintenance_recommended() });
        expect(section.textContent).toContain(m.maintenance_preset_check_belts());
        expect(section.textContent).toContain(m.maintenance_preset_clean_bed());
        expect(section.textContent).toContain('every 20 prints');
        expect(section.textContent).toContain(m.maintenance_preset_clean_fans());
        expect(section.textContent).toContain('every 90 days');
        expect(section.textContent).not.toContain(m.maintenance_preset_clean_nozzle());
        expect(section.textContent).not.toContain(m.maintenance_preset_lubricate_axes());
    });

    it('enables one recommended task with its default intervals', async () => {
        await renderWithProviders(<MaintenanceCard printerId="p1" />);
        await userEvent.click(
            await screen.findByRole('button', {
                name: `${m.maintenance_enable()} · ${m.maintenance_preset_check_belts()}`,
            }),
        );
        await waitFor(() =>
            expect(maintenance.create).toHaveBeenCalledWith('p1', {
                name: m.maintenance_preset_check_belts(),
                presetKey: 'check_belts',
                intervalHours: 200,
                intervalJobs: 0,
                intervalDays: 0,
            }),
        );
        expect(maintenance.create).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith(m.maintenance_saved()));
        expect(maintenance.list.mock.calls.length).toBeGreaterThan(1);
    });

    it('enables every recommended task at once on an empty printer', async () => {
        maintenance.list.mockResolvedValue([]);
        await renderWithProviders(<MaintenanceCard printerId="p1" />);
        expect(await screen.findByText(m.maintenance_empty())).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.maintenance_enable_all() }));
        await waitFor(() => expect(maintenance.create).toHaveBeenCalledTimes(MAINTENANCE_PRESETS.length));
        for (const p of MAINTENANCE_PRESETS) {
            expect(maintenance.create).toHaveBeenCalledWith('p1', {
                name: presetLabel(p),
                presetKey: p.key,
                intervalHours: p.intervalHours,
                intervalJobs: p.intervalJobs,
                intervalDays: p.intervalDays,
            });
        }
    });

    it('hides the suggestions once every recommended task exists', async () => {
        maintenance.list.mockResolvedValue(
            MAINTENANCE_PRESETS.map((p, i) => ({ ...tasks[1], id: `t${i}`, name: presetLabel(p).toUpperCase() })),
        );
        await renderWithProviders(<MaintenanceCard printerId="p1" />);
        await screen.findAllByText(/LUBRICATE/);
        expect(screen.queryByRole('region', { name: m.maintenance_recommended() })).toBeNull();
        expect(screen.queryByRole('button', { name: m.maintenance_enable_all() })).toBeNull();
    });

    it('reports an error when enabling fails', async () => {
        maintenance.create.mockRejectedValue(new Error('boom'));
        await renderWithProviders(<MaintenanceCard printerId="p1" />);
        await userEvent.click(await screen.findByRole('button', { name: m.maintenance_enable_all() }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('boom'));
    });

    it('opens the add, done, log and edit dialogs', async () => {
        const open = vi.spyOn(confirmationDialogStore.actions, 'openDialog').mockImplementation(() => undefined);
        await renderWithProviders(<MaintenanceCard printerId="p1" />);
        await screen.findByText('Clean the nozzle');
        await userEvent.click(screen.getByRole('button', { name: m.maintenance_add() }));
        await userEvent.click(screen.getAllByRole('button', { name: m.maintenance_done() })[0]);
        await userEvent.click(screen.getAllByRole('button', { name: m.maintenance_log() })[0]);
        await userEvent.click(screen.getAllByRole('button', { name: m.maintenance_edit() })[0]);
        expect(open.mock.calls.map((c) => c[0]?.title)).toEqual([
            m.maintenance_add(),
            m.maintenance_done_title({ name: 'Clean the nozzle' }),
            `Clean the nozzle · ${m.maintenance_log()}`,
            m.maintenance_edit(),
        ]);
        open.mockRestore();
    });

    it('asks before deleting and then removes the task', async () => {
        const alert = vi
            .spyOn(alertConfirmationDialogStore.actions, 'openAlertDialog')
            .mockImplementation(() => undefined);
        await renderWithProviders(<MaintenanceCard printerId="p1" />);
        await screen.findByText('Clean the nozzle');
        await userEvent.click(screen.getAllByRole('button', { name: m.common_delete() })[0]);
        expect(alert).toHaveBeenCalledOnce();
        const data = alert.mock.calls[0][0];
        expect(data.title).toBe(m.maintenance_delete_title({ name: 'Clean the nozzle' }));
        await data.onAction?.();
        expect(maintenance.remove).toHaveBeenCalledWith('p1', 't1');
        alert.mockRestore();
    });
});

describe('TaskForm', () => {
    it('fills the form from a preset and creates the task', async () => {
        const onSaved = vi.fn();
        await renderWithProviders(<TaskForm printerId="p1" onSaved={onSaved} />);
        const preset = MAINTENANCE_PRESETS[0];
        await userEvent.click(screen.getByRole('button', { name: presetLabel(preset) }));
        expect((screen.getByLabelText(m.maintenance_name()) as HTMLInputElement).value).toBe(presetLabel(preset));
        expect((screen.getByLabelText(m.maintenance_interval_hours()) as HTMLInputElement).value).toBe(
            String(preset.intervalHours),
        );
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(maintenance.create).toHaveBeenCalledOnce());
        expect(maintenance.create).toHaveBeenCalledWith('p1', {
            name: presetLabel(preset),
            presetKey: preset.key,
            note: '',
            intervalHours: preset.intervalHours,
            intervalJobs: preset.intervalJobs,
            intervalDays: preset.intervalDays,
        });
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(toast.success).toHaveBeenCalledWith(m.maintenance_saved());
    });

    it('refuses an empty name', async () => {
        await renderWithProviders(<TaskForm printerId="p1" onSaved={vi.fn()} />);
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await new Promise((r) => setTimeout(r, 20));
        expect(maintenance.create).not.toHaveBeenCalled();
    });

    it('edits an existing task without presets', async () => {
        await renderWithProviders(<TaskForm printerId="p1" task={tasks[1]} onSaved={vi.fn()} />);
        expect(screen.queryByRole('button', { name: presetLabel(MAINTENANCE_PRESETS[0]) })).toBeNull();
        const name = screen.getByLabelText(m.maintenance_name());
        await userEvent.clear(name);
        await userEvent.type(name, 'Lubricate everything');
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(maintenance.update).toHaveBeenCalledOnce());
        expect(maintenance.update).toHaveBeenCalledWith(
            'p1',
            't2',
            expect.objectContaining({
                name: 'Lubricate everything',
                intervalHours: 100,
                intervalJobs: 20,
                presetKey: '',
            }),
        );
    });

    it('keeps a recommended task translated when it is saved without renaming', async () => {
        const preset = { ...tasks[1], name: 'Lubrifier les axes', presetKey: 'lubricate_axes' as const };
        await renderWithProviders(<TaskForm printerId="p1" task={preset} onSaved={vi.fn()} />);
        expect((screen.getByLabelText(m.maintenance_name()) as HTMLInputElement).value).toBe(
            m.maintenance_preset_lubricate_axes(),
        );
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(maintenance.update).toHaveBeenCalledOnce());
        expect(maintenance.update.mock.calls[0][2]).toMatchObject({ presetKey: 'lubricate_axes' });
    });

    it('turns a recommended task into a custom one when it is renamed', async () => {
        const preset = { ...tasks[1], presetKey: 'lubricate_axes' as const };
        await renderWithProviders(<TaskForm printerId="p1" task={preset} onSaved={vi.fn()} />);
        const name = screen.getByLabelText(m.maintenance_name());
        await userEvent.clear(name);
        await userEvent.type(name, 'Grease the Z screws');
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(maintenance.update).toHaveBeenCalledOnce());
        expect(maintenance.update.mock.calls[0][2]).toMatchObject({ name: 'Grease the Z screws', presetKey: '' });
    });
});

describe('taskName', () => {
    it('translates recommended tasks whatever language they were created in', () => {
        expect(taskName({ name: 'Limpar o bico', presetKey: 'clean_nozzle' })).toBe(
            m.maintenance_preset_clean_nozzle(),
        );
    });

    it('keeps the name of custom tasks', () => {
        expect(taskName({ name: 'Grease the Z screws', presetKey: '' })).toBe('Grease the Z screws');
    });
});

describe('DoneForm', () => {
    it('completes the task with a trimmed note', async () => {
        const onSaved = vi.fn();
        await renderWithProviders(<DoneForm printerId="p1" task={tasks[0]} onSaved={onSaved} />);
        expect(screen.getByText(m.maintenance_usage({ hours: 62.5, jobs: 10, days: 3 }))).toBeTruthy();
        await userEvent.type(screen.getByLabelText(m.maintenance_done_note()), '  new nozzle  ');
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.maintenance_done()) }));
        await waitFor(() => expect(maintenance.complete).toHaveBeenCalledWith('p1', 't1', { note: 'new nozzle' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(toast.success).toHaveBeenCalledWith(m.maintenance_completed({ name: 'Clean the nozzle' }));
    });

    it('reports an error and keeps the dialog', async () => {
        maintenance.complete.mockRejectedValueOnce(new Error('offline'));
        const onSaved = vi.fn();
        await renderWithProviders(<DoneForm printerId="p1" task={tasks[0]} onSaved={onSaved} />);
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.maintenance_done()) }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('offline'));
        expect(onSaved).not.toHaveBeenCalled();
    });
});

describe('LogList', () => {
    it('says when the task was never done', async () => {
        await renderWithProviders(<LogList printerId="p1" task={tasks[0]} />);
        expect(await screen.findByText(m.maintenance_never())).toBeTruthy();
    });

    it('lists the completions with their usage', async () => {
        maintenance.logs.mockResolvedValue([
            { id: 'l1', taskId: 't1', doneAt: '2026-10-20T10:00:00.000Z', note: 'cold pull', hours: 48, jobs: 9 },
        ]);
        await renderWithProviders(<LogList printerId="p1" task={tasks[0]} />);
        expect(await screen.findByText('cold pull')).toBeTruthy();
        expect(screen.getByText(m.maintenance_usage({ hours: 48, jobs: 9, days: 0 }))).toBeTruthy();
        expect(maintenance.logs).toHaveBeenCalledWith('p1', 't1');
    });
});
