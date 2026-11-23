import { FAILURE_REASONS, type FailureReason } from '@kobralink/shared';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { m } from '@/lib/i18n';
import { failureReasonLabel } from '@/lib/labels';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

const NONE = 'none';

export function confirmCancel(cancel: (reason: FailureReason | '') => Promise<unknown>) {
    const choice: { reason: FailureReason | '' } = { reason: '' };
    alertConfirmationDialogStore.actions.openAlertDialog({
        title: m.print_cancel_title(),
        description: (
            <CancelReason
                onChange={(reason) => {
                    choice.reason = reason;
                }}
            />
        ),
        actionLabel: m.print_cancel_action(),
        cancelLabel: m.print_cancel_keep(),
        onAction: () => cancel(choice.reason),
    });
}

export function CancelReason({ onChange }: { onChange: (reason: FailureReason | '') => void }) {
    const [value, setValue] = useState(NONE);
    return (
        <span className="grid gap-3">
            <span>{m.print_cancel_hint()}</span>
            <span className="grid gap-1.5">
                <span className="text-xs font-medium text-foreground">{m.print_cancel_reason()}</span>
                <Select
                    value={value}
                    onValueChange={(v) => {
                        setValue(v);
                        onChange(v === NONE ? '' : (v as FailureReason));
                    }}
                >
                    <SelectTrigger className="w-full rounded-full" aria-label={m.print_cancel_reason()}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE}>{m.print_cancel_reason_none()}</SelectItem>
                        {FAILURE_REASONS.map((r) => (
                            <SelectItem key={r} value={r}>
                                {failureReasonLabel(r)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </span>
        </span>
    );
}
