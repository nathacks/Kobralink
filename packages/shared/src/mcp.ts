import { z } from 'zod';

export const MCP_PATH = '/api/mcp';

export const MCP_ACCESS = ['read', 'control'] as const;
export const mcpAccessSchema = z.enum(MCP_ACCESS);
export type McpAccess = z.infer<typeof mcpAccessSchema>;

export const MCP_SCOPES = { read: 'mcp:read', control: 'mcp:control' } as const satisfies Record<McpAccess, string>;
export const MCP_OFFLINE_SCOPE = 'offline_access';

export function mcpAccessOf(scopes: readonly string[]): McpAccess | null {
    if (scopes.includes(MCP_SCOPES.control)) return 'control';
    return scopes.includes(MCP_SCOPES.read) ? 'read' : null;
}

export interface McpInfoDto {
    enabled: boolean;
    url: string;
    oauth: boolean;
}

export interface McpConnectionDto {
    id: string;
    name: string;
    redirectHosts: string[];
    access: McpAccess | null;
    createdAt: string;
}

export const MCP_MODES = ['allow', 'ask', 'deny'] as const;
export const mcpModeSchema = z.enum(MCP_MODES);
export type McpMode = z.infer<typeof mcpModeSchema>;

export const MCP_TOOL_NAMES = [
    'list_printers',
    'get_printer_state',
    'get_temperature_history',
    'get_camera_snapshot',
    'get_power_state',
    'list_files',
    'get_file_objects',
    'list_printer_files',
    'list_filament_slots',
    'list_spools',
    'get_queue',
    'check_queue_compatibility',
    'list_schedules',
    'get_print_history',
    'get_stats',
    'get_recent_events',
    'get_detection_status',
    'list_maintenance',
    'list_macros',
    'list_automations',
    'start_print',
    'start_printer_file',
    'pause_print',
    'resume_print',
    'cancel_print',
    'skip_objects',
    'set_print_speed',
    'set_temperature',
    'set_fan',
    'set_light',
    'home_axes',
    'move_axis',
    'disable_motors',
    'set_power',
    'set_printer_connection',
    'set_filament_slot',
    'feed_filament',
    'set_auto_feed',
    'start_drying',
    'stop_drying',
    'assign_spool',
    'add_to_queue',
    'remove_from_queue',
    'reorder_queue',
    'start_next_in_queue',
    'confirm_bed_clear',
    'cancel_queue_auto_start',
    'set_maintenance_mode',
    'schedule_print',
    'cancel_scheduled_print',
    'schedule_drying',
    'cancel_scheduled_drying',
    'run_macro',
    'set_automation_enabled',
    'complete_maintenance_task',
    'annotate_print_job',
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export interface McpToolDto {
    name: McpToolName;
    access: McpAccess;
    destructive: boolean;
    lock: 'always' | 'sometimes' | null;
    bedClear: boolean;
    defaultMode: McpMode;
}
