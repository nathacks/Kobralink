import { z } from 'zod';

export const API_KEY_USES = ['moonraker', 'metrics', 'mcp_read', 'mcp_control'] as const;
export const apiKeyUseSchema = z.enum(API_KEY_USES);
export type ApiKeyUse = z.infer<typeof apiKeyUseSchema>;

export const MCP_KEY_USES = ['mcp_read', 'mcp_control'] as const satisfies readonly ApiKeyUse[];

export const apiKeyMetadataSchema = z
    .object({
        printerId: z.string().min(1).nullable().default(null),
        uses: z.array(apiKeyUseSchema).min(1),
    })
    .refine((k) => new Set(k.uses).size === k.uses.length)
    .refine((k) => k.uses.filter((u) => u.startsWith('mcp_')).length <= 1)
    .refine((k) => k.printerId === null || !k.uses.some((u) => u.startsWith('mcp_')));
export type ApiKeyMetadata = z.infer<typeof apiKeyMetadataSchema>;

export function apiKeyMetadata(raw: unknown): ApiKeyMetadata {
    const parsed = apiKeyMetadataSchema.safeParse(typeof raw === 'string' ? safeJson(raw) : raw);
    return parsed.success ? parsed.data : { printerId: null, uses: [] };
}

function safeJson(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
