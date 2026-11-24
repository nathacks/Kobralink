import type { AutomationRuleDto } from '@kobralink/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationsPage } from '@/components/pages/automations-page';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { renderWithProviders } from '@/test/render';
import {
    defaultAction,
    describeAction,
    parseTags,
    RuleForm,
    TRIGGER_LABEL,
    targetedPrinters,
    targetSummary,
    toInput,
} from './rule-form';

const { automations, macros, system, toast, state } = vi.hoisted(() => ({
    automations: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        setEnabled: vi.fn(),
        run: vi.fn(),
        remove: vi.fn(),
    },
    macros: { list: vi.fn() },
    system: { info: vi.fn() },
    toast: { success: vi.fn(), error: vi.fn() },
    state: { canOperate: true },
}));

vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/api', () => ({
    api: new Proxy({ automations, macros, system } as Record<string, unknown>, {
        get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
    }),
}));
vi.mock('@/hooks/use-role', () => ({ useCanOperate: () => state.canOperate }));
vi.mock('@/hooks/use-printers', () => ({
    usePrinterList: () => [
        { id: 'p1', name: 'Kobra 4', settings: { profile: { tags: ['farm'] } } },
        { id: 'p2', name: 'Kobra X', settings: { profile: { tags: [] } } },
    ],
}));

const printers = [
    { id: 'p1', name: 'Kobra 4', settings: { profile: { tags: ['farm'] } } },
    { id: 'p2', name: 'Kobra X', settings: { profile: { tags: [] } } },
];

const rule: AutomationRuleDto = {
    id: 'a1',
    name: 'Night',
    enabled: true,
    trigger: 'time',
    time: '22:00',
    printerId: null,
    targetTags: ['farm'],
    actions: [
        { type: 'light', on: false },
        { type: 'power', action: 'off' },
    ],
    lastRunAt: null,
    lastError: '',
    createdAt: '2026-10-30T00:00:00.000Z',
};

beforeEach(() => {
    automations.list.mockReset().mockResolvedValue([rule]);
    automations.create.mockReset().mockResolvedValue(rule);
    automations.update.mockReset().mockResolvedValue(rule);
    automations.setEnabled.mockReset().mockResolvedValue({ ...rule, enabled: false });
    automations.run.mockReset().mockResolvedValue({ ...rule, lastRunAt: '2026-10-30T22:00:00.000Z' });
    automations.remove.mockReset().mockResolvedValue(undefined);
    macros.list.mockReset().mockResolvedValue([{ id: 'm1', name: 'Purge', icon: 'zap', actions: [] }]);
    system.info.mockReset().mockResolvedValue({ timeZone: 'America/Sao_Paulo' });
    toast.success.mockReset();
    toast.error.mockReset();
    state.canOperate = true;
    alertConfirmationDialogStore.actions.closeAlertDialog();
    confirmationDialogStore.actions.closeDialog();
});

describe('rule helpers', () => {
    it('describes each action', () => {
        const list = [{ id: 'm1', name: 'Purge', icon: 'zap' as const, actions: [], position: 0, createdAt: '' }];
        expect(describeAction({ type: 'macro', macroId: 'm1' }, list)).toBe('Purge');
        expect(describeAction({ type: 'light', on: true })).toBe(m.macro_on());
        expect(describeAction({ type: 'feed', slotIndex: 1, direction: 'out' })).toContain(m.slot_unload());
        expect(describeAction({ type: 'power', action: 'off' })).toBe(m.automations_power_off());
        expect(describeAction({ type: 'notify', message: 'Hi' })).toContain('Hi');
        expect(describeAction({ type: 'wait', seconds: 30 })).toBe(`30 ${m.automations_seconds()}`);
    });

    it('builds a default for every action', () => {
        expect(
            defaultAction('macro', [{ id: 'm1', name: 'Purge', icon: 'zap', actions: [], position: 0, createdAt: '' }]),
        ).toEqual({
            type: 'macro',
            macroId: 'm1',
        });
        expect(defaultAction('macro')).toEqual({ type: 'macro', macroId: '' });
        expect(defaultAction('wait')).toEqual({ type: 'wait', seconds: 60 });
    });

    it('turns the form into a rule', () => {
        const base = { name: 'R', trigger: 'time' as const, time: '07:00', tagsText: ' farm , pla ,', actions: [] };
        expect(toInput({ ...base, target: 'tags' })).toMatchObject({ printerId: null, targetTags: ['farm', 'pla'] });
        expect(toInput({ ...base, target: 'p1' })).toMatchObject({ printerId: 'p1', targetTags: [], time: '07:00' });
        expect(toInput({ ...base, target: 'any', trigger: 'bed_cleared' }, false)).toMatchObject({
            printerId: null,
            targetTags: [],
            time: '',
            enabled: false,
        });
        expect(parseTags('')).toEqual([]);
    });

    it('names and finds the targeted printers', () => {
        expect(targetSummary({ printerId: 'p2', targetTags: [] }, printers)).toBe('Kobra X');
        expect(targetSummary({ printerId: null, targetTags: [] }, printers)).toBe(m.automations_target_any());
        expect(targetSummary({ printerId: null, targetTags: ['farm'] }, printers)).toContain('farm');
        expect(targetedPrinters({ printerId: null, targetTags: ['farm'] }, printers).map((p) => p.id)).toEqual(['p1']);
        expect(targetedPrinters({ printerId: null, targetTags: [] }, printers)).toHaveLength(2);
        expect(targetedPrinters({ printerId: 'p2', targetTags: [] }, printers).map((p) => p.id)).toEqual(['p2']);
    });
});

describe('AutomationsPage', () => {
    it('lists each rule with its trigger, target, actions and last run', async () => {
        await renderWithProviders(<AutomationsPage />);
        expect(await screen.findByText('Night')).toBeTruthy();
        expect(screen.getByText(new RegExp(`${TRIGGER_LABEL.time()} 22:00`))).toBeTruthy();
        expect(screen.getByText(m.automations_action_power())).toBeTruthy();
        expect(screen.getByText(m.automations_never())).toBeTruthy();
    });

    it('switches, runs and deletes a rule', async () => {
        await renderWithProviders(<AutomationsPage />);
        await screen.findByText('Night');
        await userEvent.click(screen.getByRole('switch', { name: m.automations_enabled() }));
        expect(automations.setEnabled).toHaveBeenCalledWith('a1', false);
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.automations_run()) }));
        const menu = await screen.findByRole('menu');
        expect(within(menu).queryByText('Kobra X')).toBeNull();
        await userEvent.click(within(menu).getByRole('menuitem', { name: 'Kobra 4' }));
        await waitFor(() => expect(automations.run).toHaveBeenCalledWith('a1', 'p1'));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith(m.automations_ran({ printer: 'Kobra 4' })));
        await userEvent.click(screen.getByRole('button', { name: m.common_delete() }));
        expect(alertConfirmationDialogStore.state.title).toBe(m.automations_delete_title({ name: 'Night' }));
        await alertConfirmationDialogStore.state.onAction?.();
        expect(automations.remove).toHaveBeenCalledWith('a1');
    });

    it('shows a failed run', async () => {
        automations.list.mockResolvedValue([{ ...rule, lastError: 'Plug unreachable' }]);
        automations.run.mockResolvedValue({ ...rule, lastError: 'Plug unreachable' });
        await renderWithProviders(<AutomationsPage />);
        expect(await screen.findByText(m.automations_last_error({ error: 'Plug unreachable' }))).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.automations_run()) }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Kobra 4' }));
        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(m.automations_last_error({ error: 'Plug unreachable' })),
        );
    });

    it('opens the form to add and edit rules', async () => {
        await renderWithProviders(<AutomationsPage />);
        await screen.findByText('Night');
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.automations_add()) }));
        expect(confirmationDialogStore.state.title).toBe(m.automations_new());
        await userEvent.click(screen.getByRole('button', { name: m.automations_edit() }));
        expect(confirmationDialogStore.state.title).toBe(m.automations_edit());
    });

    it('shows the empty state and hides the controls from viewers', async () => {
        automations.list.mockResolvedValue([]);
        state.canOperate = false;
        await renderWithProviders(<AutomationsPage />);
        expect(await screen.findByText(m.automations_empty())).toBeTruthy();
        expect(screen.queryByRole('button', { name: new RegExp(m.automations_add()) })).toBeNull();
    });
});

describe('RuleForm', () => {
    it('creates a rule for tagged printers', async () => {
        const onSaved = vi.fn();
        await renderWithProviders(<RuleForm onSaved={onSaved} />);
        await userEvent.type(screen.getByLabelText(m.field_name()), 'Lights off');
        await userEvent.click(screen.getByRole('combobox', { name: m.automations_target() }));
        await userEvent.click(await screen.findByRole('option', { name: m.automations_target_tags() }));
        await userEvent.type(screen.getByLabelText(m.automations_tags()), 'Farm');
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.macros_add_action()) }));
        await userEvent.type(screen.getByLabelText(m.automations_message()), 'Done');
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(automations.create).toHaveBeenCalledOnce());
        expect(automations.create.mock.calls[0][0]).toEqual({
            name: 'Lights off',
            enabled: true,
            trigger: 'print_finished',
            time: '',
            printerId: null,
            targetTags: ['Farm'],
            actions: [
                { type: 'light', on: false },
                { type: 'notify', message: 'Done' },
            ],
        });
        expect(onSaved).toHaveBeenCalledOnce();
    });

    it('refuses to save without a name and keeps the dialog open', async () => {
        await renderWithProviders(<RuleForm onSaved={vi.fn()} />);
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await new Promise((r) => setTimeout(r, 20));
        expect(automations.create).not.toHaveBeenCalled();
        expect(screen.getByLabelText(m.field_name()).getAttribute('aria-invalid')).toBe('true');
    });

    it('edits a timed rule and keeps it disabled', async () => {
        await renderWithProviders(<RuleForm rule={{ ...rule, enabled: false }} onSaved={vi.fn()} />);
        expect((screen.getByLabelText(m.automations_time()) as HTMLInputElement).value).toBe('22:00');
        expect(screen.getByText(m.automations_power_hint())).toBeTruthy();
        expect(await screen.findByText(m.automations_time_zone({ zone: 'America/Sao_Paulo' }))).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(automations.update).toHaveBeenCalledOnce());
        expect(automations.update.mock.calls[0]).toEqual([
            'a1',
            expect.objectContaining({ enabled: false, trigger: 'time', time: '22:00', targetTags: ['farm'] }),
        ]);
    });

    it('switches an action to a macro', async () => {
        await renderWithProviders(<RuleForm onSaved={vi.fn()} />);
        await userEvent.click(screen.getByRole('combobox', { name: `${m.automations_actions()} 1` }));
        await userEvent.click(await screen.findByRole('option', { name: m.automations_action_macro() }));
        await waitFor(() =>
            expect(screen.getByRole('combobox', { name: m.automations_action_macro() }).textContent).toContain('Purge'),
        );
    });
});
