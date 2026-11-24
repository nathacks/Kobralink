import type { McpAccess, McpToolDto, McpToolName } from '@kobralink/shared';
import { z } from 'zod';

export class McpRefusal extends Error {}

export class McpImage {
    constructor(
        readonly data: Buffer,
        readonly mimeType: string,
    ) {}
}

export interface McpTool {
    name: McpToolName;
    title: string;
    description: string;
    access: McpAccess;
    destructive: boolean;
    lock: McpToolDto['lock'];
    input: z.ZodObject;
    run: (args: Record<string, unknown>) => unknown;
}

interface ToolSpec<T extends z.ZodRawShape> {
    name: McpToolName;
    title: string;
    description: string;
    destructive?: boolean;
    lock?: McpToolDto['lock'];
    input: z.ZodObject<T>;
    run: (args: z.output<z.ZodObject<T>>) => unknown;
}

export function defineTool<T extends z.ZodRawShape>(access: McpAccess, spec: ToolSpec<T>): McpTool {
    return { ...spec, access, destructive: spec.destructive ?? false, lock: spec.lock ?? null } as unknown as McpTool;
}

export function toolDto(tool: McpTool): McpToolDto {
    return {
        name: tool.name,
        access: tool.access,
        destructive: tool.destructive,
        lock: tool.lock,
        bedClear: 'bedIsClear' in tool.input.shape,
        defaultMode: tool.destructive ? 'ask' : 'allow',
    };
}

export const printerInput = z.object({
    printerId: z.string().min(1).describe('Printer id, from list_printers'),
});

const HIDDEN_KEYS = new Set([
    'cameraUrl',
    'thumbnail',
    'svgB64',
    'svgImage',
    'path',
    'md5',
    'ip',
    'username',
    'password',
    'deviceId',
    'taskId',
    'detail',
]);

export function toToolJson(value: unknown): string {
    return JSON.stringify(value ?? { ok: true }, (key, v) => (HIDDEN_KEYS.has(key) ? undefined : v));
}
