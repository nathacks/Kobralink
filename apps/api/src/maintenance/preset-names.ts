import type { MaintenancePresetKey } from '@kobralink/shared';
import { m } from '../i18n/locale';

const PRESET_NAME: Record<MaintenancePresetKey, () => string> = {
    lubricate_axes: m.maintenance_preset_lubricate_axes,
    clean_nozzle: m.maintenance_preset_clean_nozzle,
    check_belts: m.maintenance_preset_check_belts,
    clean_bed: m.maintenance_preset_clean_bed,
    clean_fans: m.maintenance_preset_clean_fans,
};

export function maintenanceTaskName(task: { name: string; presetKey?: string | null }): string {
    const name = task.presetKey ? PRESET_NAME[task.presetKey as MaintenancePresetKey] : undefined;
    return name ? name() : task.name;
}
