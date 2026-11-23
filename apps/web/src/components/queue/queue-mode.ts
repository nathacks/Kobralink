import type { PrinterSettings } from '@kobralink/shared';
import { m } from '@/lib/i18n';

type QueueModeSettings = Pick<
    PrinterSettings,
    'queueAutoStart' | 'queueBedClearConfirm' | 'queueAutoStartDelaySec' | 'lightTrigger'
>;

export function queueModeText(s: QueueModeSettings): string {
    if (!s.queueAutoStart) return s.queueBedClearConfirm ? m.queue_mode_manual_confirm() : m.queue_mode_manual();
    const when =
        s.queueAutoStartDelaySec > 0 ? m.queue_when_after({ seconds: s.queueAutoStartDelaySec }) : m.queue_when_now();
    if (!s.queueBedClearConfirm) return m.queue_mode_auto({ when });
    return m.queue_mode_auto_confirm({ when, how: s.lightTrigger ? m.queue_mode_how_light() : '' });
}
