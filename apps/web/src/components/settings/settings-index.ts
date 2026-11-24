import type { AppSettings, Printer } from '@kobralink/shared';
import type { LinkProps } from '@tanstack/react-router';
import { m } from '@/lib/i18n';
import { visibleSections } from './settings-sections';

type Text = () => string;

interface SettingGroup {
    to: NonNullable<LinkProps['to']>;
    card: Text;
    hint?: Text;
    items?: [label: Text, hint?: Text][];
    when?: (settings: AppSettings) => boolean;
}

export interface SettingHit {
    id: string;
    to: NonNullable<LinkProps['to']>;
    printerId?: string;
    section: string;
    card?: string;
    label: string;
    hint: string;
}

const PRINTER_SETTINGS = '/printers/$printerId/settings';

const GROUPS: SettingGroup[] = [
    {
        to: '/settings/general',
        card: m.theme_title,
        hint: m.theme_hint,
        items: [[m.theme_label, m.theme_label_hint], [m.appearance_language]],
    },
    {
        to: '/settings/general',
        card: m.settings_general,
        items: [
            [m.settings_server_locale, m.settings_server_locale_hint],
            [m.settings_update_check, m.settings_update_check_hint],
            [m.settings_currency, m.settings_currency_hint],
            [m.settings_filament_price, m.settings_filament_price_hint],
            [m.settings_public_url, m.settings_public_url_hint],
            [m.settings_verbose_http, m.settings_verbose_http_hint],
        ],
    },
    {
        to: '/settings/general',
        card: m.settings_costs,
        items: [
            [m.settings_energy_price, m.settings_energy_price_hint],
            [m.settings_printer_power, m.settings_printer_power_hint],
        ],
    },
    {
        to: '/settings/notifications',
        card: m.notif_title,
        hint: m.notif_hint,
        items: [
            [m.notif_browser, m.notif_browser_hint],
            [m.notif_push, m.notif_push_hint],
            [() => 'Discord', m.notif_discord_hint],
            [() => 'ntfy', m.notif_ntfy_hint],
            [m.notif_telegram_token],
            [m.notif_telegram_chat],
            [m.notif_webhook, m.notif_webhook_hint],
            [m.notif_events],
            [m.notif_ev_print_started],
            [m.notif_ev_print_finished],
            [m.notif_ev_print_cancelled],
            [m.notif_ev_print_paused],
            [m.notif_ev_printer_offline],
            [m.notif_ev_printer_online],
            [m.notif_ev_drying_done],
            [m.notif_ev_queue_next],
            [m.notif_ev_scheduled_print],
            [m.notif_ev_maintenance_due],
            [m.notif_ev_automation],
            [m.notif_ev_alerts],
            [m.notif_ev_print_failure],
            [m.notif_test],
        ],
    },
    {
        to: '/settings/detection',
        card: m.detection_title,
        hint: m.detection_hint,
        items: [[m.detection_model]],
    },
    {
        to: '/settings/detection',
        card: m.settings_general,
        items: [
            [m.detection_enabled, m.detection_enabled_hint],
            [m.detection_action, m.detection_action_hint],
            [m.detection_light, m.detection_light_hint],
            [m.detection_sensitivity, m.detection_sensitivity_hint],
            [m.detection_interval, m.detection_interval_hint],
        ],
    },
    { to: '/settings/detection', card: m.detection_live_title },
    {
        to: '/settings/integrations',
        card: () => 'Spoolman',
        hint: m.spoolman_hint,
        items: [[m.spoolman_server_url], [m.spoolman_sync_rate, m.spoolman_sync_rate_hint]],
    },
    {
        to: '/settings/integrations',
        card: () => 'Home Assistant (MQTT)',
        hint: m.ha_hint,
        items: [
            [m.ha_enabled],
            [m.ha_url],
            [m.ha_username],
            [m.ha_password],
            [m.ha_discovery_prefix],
            [m.ha_topic_prefix],
        ],
    },
    {
        to: '/settings/integrations',
        card: m.ha_api_title,
        hint: m.ha_api_hint,
        items: [[m.ha_api_url], [m.ha_api_token, m.ha_api_token_hint], [m.ha_api_test]],
    },
    { to: '/settings/slicer', card: m.slicer_addresses_title, hint: m.slicer_addresses_hint },
    {
        to: '/settings/slicer',
        card: m.slicer_keys_title,
        hint: m.slicer_keys_hint,
        items: [[m.slicer_keys_require, m.slicer_keys_require_hint]],
    },
    { to: '/settings/slicer', card: m.slicer_steps_title },
    { to: '/settings/slicer', card: m.slicer_notes_title },
    {
        to: '/settings/mcp',
        card: m.mcp_title,
        hint: m.mcp_hint,
        items: [[m.mcp_enable, m.mcp_enable_hint], [m.mcp_url]],
    },
    { to: '/settings/mcp', card: m.mcp_tools_title, hint: m.mcp_tools_hint },
    { to: '/settings/mcp', card: m.mcp_apps_title, hint: m.mcp_apps_hint },
    {
        to: '/settings/api-keys',
        card: m.api_keys_title,
        hint: m.api_keys_hint,
        items: [
            [m.api_keys_name],
            [m.api_keys_scope],
            [m.api_keys_use_moonraker, m.api_keys_use_moonraker_hint],
            [m.api_keys_use_metrics, m.api_keys_use_metrics_hint],
            [m.api_keys_use_mcp],
            [m.api_keys_create],
        ],
    },
    {
        to: '/settings/prometheus',
        card: () => 'Prometheus',
        hint: m.prometheus_hint,
        items: [[m.prometheus_url], [m.api_keys_created_scrape]],
    },
    { to: '/settings/macros', card: m.macros_title, hint: m.macros_hint, items: [[m.macros_add]] },
    { to: '/settings/users', card: m.users_title, hint: m.users_hint, items: [[m.users_add]] },
    {
        to: '/settings/system',
        card: m.system_title,
        items: [
            [m.system_version],
            [m.system_runtime],
            [m.system_mode],
            [m.system_uptime],
            [m.system_time_zone],
            [m.system_data_dir],
            [m.system_check_update],
            [m.system_github],
            [m.system_restart],
        ],
    },
    {
        to: '/settings/system',
        card: m.backup_title,
        hint: m.backup_hint,
        items: [[m.backup_include_timelapses], [m.backup_download], [m.backup_restore]],
    },
    {
        to: '/filament',
        card: m.spools_title,
        hint: m.spools_hint,
        items: [[m.spools_add]],
        when: (s) => !s.spoolmanUrl,
    },
    {
        to: '/filament',
        card: m.spoolman_spools_title,
        hint: m.spoolman_spools_hint,
        when: (s) => Boolean(s.spoolmanUrl),
    },
    {
        to: '/filament',
        card: m.dry_presets_title,
        hint: m.dry_presets_hint,
        items: [[m.dry_presets_add], [m.dry_presets_reset]],
    },
    { to: '/filament', card: m.profiles_title },
    {
        to: PRINTER_SETTINGS,
        card: m.profile_title,
        hint: m.profile_hint,
        items: [
            [m.profile_location],
            [m.profile_nozzle, m.profile_nozzle_hint],
            [m.profile_tags, m.profile_tags_hint],
            [m.profile_power, m.profile_power_hint],
        ],
    },
    { to: PRINTER_SETTINGS, card: m.specs_title },
    {
        to: PRINTER_SETTINGS,
        card: m.settings_connection,
        items: [
            [m.field_name],
            [m.field_ip],
            [m.settings_moonraker_port],
            [m.settings_refresh_credentials],
            [m.settings_restart_mqtt],
            [m.settings_disconnect],
        ],
    },
    {
        to: PRINTER_SETTINGS,
        card: m.settings_print,
        items: [
            [m.settings_auto_leveling, m.settings_auto_leveling_hint],
            [m.settings_vibration],
            [m.settings_flow_calibration, m.settings_flow_calibration_hint],
            [m.settings_camera_always_on, m.settings_camera_always_on_hint],
            [m.settings_camera_on_print, m.settings_camera_on_print_hint],
            [m.settings_default_slot, m.settings_default_slot_hint],
            [m.settings_web_upload_warning, m.settings_web_upload_warning_hint],
            [m.settings_print_start_dialog, m.settings_print_start_dialog_hint],
            [m.settings_queue_auto_start, m.settings_queue_auto_start_hint],
            [m.settings_queue_bed_clear, m.settings_queue_bed_clear_hint],
            [m.settings_queue_delay, m.settings_queue_delay_hint],
            [m.settings_light_trigger, m.settings_light_trigger_hint],
            [m.settings_delete_after_print, m.settings_delete_after_print_hint],
            [m.settings_poll_interval, m.settings_poll_interval_hint],
        ],
    },
    {
        to: PRINTER_SETTINGS,
        card: m.settings_timelapse,
        hint: m.settings_timelapse_hint,
        items: [[m.settings_timelapse_enabled], [m.settings_timelapse_fps, m.settings_timelapse_fps_hint]],
    },
    {
        to: PRINTER_SETTINGS,
        card: m.settings_failure_detection,
        hint: m.settings_failure_detection_hint,
        items: [[m.settings_failure_detection_enabled]],
    },
    {
        to: PRINTER_SETTINGS,
        card: m.settings_alerts,
        hint: m.settings_alerts_hint,
        items: [
            [m.settings_alert_nozzle],
            [m.settings_alert_bed],
            [m.settings_alert_offline],
            [m.settings_alert_spool],
        ],
    },
    {
        to: PRINTER_SETTINGS,
        card: m.plug_title,
        hint: m.plug_hint,
        items: [
            [m.plug_switch, m.plug_switch_hint],
            [m.energy_sensor, m.energy_sensor_hint],
        ],
        when: (s) => Boolean(s.homeAssistant.url && s.homeAssistant.token),
    },
    { to: PRINTER_SETTINGS, card: m.settings_vendors, hint: m.settings_vendors_hint },
];

export function settingHits(settings: AppSettings, printers: Pick<Printer, 'id' | 'name'>[], isAdmin: boolean) {
    const sections = visibleSections(isAdmin);
    const hits: SettingHit[] = sections.map((s) => ({
        id: s.to,
        to: s.to,
        section: m.nav_settings(),
        label: s.label(),
        hint: '',
    }));
    const add = (group: SettingGroup, section: string, printerId?: string) => {
        const base = { to: group.to, printerId, section, card: group.card() };
        const prefix = `${group.to}|${printerId ?? ''}|${base.card}`;
        if (base.card !== section) hits.push({ ...base, id: prefix, label: base.card, hint: group.hint?.() ?? '' });
        for (const [label, hint] of group.items ?? []) {
            hits.push({ ...base, id: `${prefix}|${label()}`, label: label(), hint: hint?.() ?? '' });
        }
    };
    for (const group of GROUPS) {
        if (group.when && !group.when(settings)) continue;
        if (group.to === PRINTER_SETTINGS) {
            for (const p of printers) add(group, p.name, p.id);
        } else if (group.to === '/filament') {
            add(group, m.nav_filament());
        } else {
            const section = sections.find((s) => s.to === group.to);
            if (section) add(group, section.label());
        }
    }
    return hits;
}

function fold(text: string): string {
    return text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replaceAll('’', "'")
        .toLowerCase();
}

export function searchSettings(hits: SettingHit[], query: string): SettingHit[] {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const all = (text: string) => words.every((w) => fold(text).includes(w));
    const rank = (h: SettingHit) => (all(h.label) ? 0 : all(`${h.label} ${h.card ?? ''} ${h.section}`) ? 1 : 2);
    return hits
        .filter((h) => all(`${h.label} ${h.card ?? ''} ${h.section} ${h.hint}`))
        .sort((a, b) => rank(a) - rank(b));
}
