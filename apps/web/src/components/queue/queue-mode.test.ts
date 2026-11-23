import { describe, expect, it } from 'vitest';
import { m } from '@/lib/i18n';
import { secondsLeft } from './auto-start-countdown';
import { queueModeText } from './queue-mode';

const base = { queueAutoStart: false, queueBedClearConfirm: true, queueAutoStartDelaySec: 15, lightTrigger: false };

describe('queueModeText', () => {
    it('describes a manual start, with or without the bed confirmation', () => {
        expect(queueModeText(base)).toBe(m.queue_mode_manual_confirm());
        expect(queueModeText({ ...base, queueBedClearConfirm: false })).toBe(m.queue_mode_manual());
    });

    it('describes an automatic start after the confirmation, with the wait and the light', () => {
        const auto = { ...base, queueAutoStart: true };
        expect(queueModeText(auto)).toBe(
            m.queue_mode_auto_confirm({ when: m.queue_when_after({ seconds: 15 }), how: '' }),
        );
        expect(queueModeText({ ...auto, lightTrigger: true, queueAutoStartDelaySec: 0 })).toBe(
            m.queue_mode_auto_confirm({ when: m.queue_when_now(), how: m.queue_mode_how_light() }),
        );
    });

    it('describes an automatic start without the confirmation', () => {
        expect(queueModeText({ ...base, queueAutoStart: true, queueBedClearConfirm: false })).toBe(
            m.queue_mode_auto({ when: m.queue_when_after({ seconds: 15 }) }),
        );
    });
});

describe('secondsLeft', () => {
    it('rounds up the remaining seconds and never goes below zero', () => {
        const now = Date.parse('2026-10-30T12:00:00.000Z');
        expect(secondsLeft('2026-10-30T12:00:12.300Z', now)).toBe(13);
        expect(secondsLeft('2026-10-30T11:59:50.000Z', now)).toBe(0);
    });
});
