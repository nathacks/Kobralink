import type { AppSettings, UpdateAppSettingsInput } from '@kobralink/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { appSettingsQuery } from '@/lib/queries';

export function useSaveSettings(onDone?: (next: AppSettings) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: UpdateAppSettingsInput) => api.settings.update(v),
        onSuccess: (next) => {
            qc.setQueryData(appSettingsQuery.queryKey, next);
            void qc.invalidateQueries({ queryKey: ['spoolman'] });
            void qc.invalidateQueries({ queryKey: ['printers'] });
            toast.success(m.settings_saved());
            onDone?.(next);
        },
        onError: (e) => toast.error(e.message),
    });
}
