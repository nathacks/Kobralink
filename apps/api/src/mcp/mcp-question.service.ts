import { Injectable } from '@nestjs/common';
import { BridgeRegistry } from '../bridge/bridge.registry';
import { m, runWithLocale } from '../i18n/locale';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { type McpTool, toolDto } from './mcp-tool';

const MAX_VALUE = 300;

@Injectable()
export class McpQuestionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: BridgeRegistry,
        private readonly settings: SettingsService,
    ) {}

    async text(tool: McpTool, args: Record<string, unknown>): Promise<string> {
        const details = await this.describe(args);
        const printerId = String(args.printerId ?? '');
        return runWithLocale(this.settings.get().locale, () => {
            const label = m[`mcp_tool_${tool.name}`]();
            const target = this.registry.has(printerId)
                ? `${label} — ${this.registry.get(printerId).config.name}`
                : label;
            return [m.mcp_ask({ target }), ...details, ...(toolDto(tool).bedClear ? [m.mcp_ask_bed()] : [])].join('\n');
        });
    }

    private describe(args: Record<string, unknown>): Promise<string[]> {
        const shown = Object.entries(args).filter(([name, v]) => name !== 'printerId' && v !== undefined);
        return Promise.all(
            shown.map(async ([name, v]) => {
                const ids = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string');
                const names = await Promise.all(ids.map((id) => this.nameOf(name, id)));
                const raw = typeof v === 'string' ? v : JSON.stringify(v);
                const value = names.some(Boolean) ? names.map((n, i) => n ?? ids[i]).join(', ') : raw;
                return `${name}: ${value.replace(/\s+/g, ' ').slice(0, MAX_VALUE)}`;
            }),
        );
    }

    private async nameOf(arg: string, id: string): Promise<string | null> {
        const db = this.prisma.client;
        const where = { id };
        switch (arg) {
            case 'fileId':
                return (await db.gcodeFile.findUnique({ where }))?.filename ?? null;
            case 'macroId':
                return (await db.macro.findUnique({ where }))?.name ?? null;
            case 'automationId':
                return (await db.automationRule.findUnique({ where }))?.name ?? null;
            case 'taskId':
                return (await db.maintenanceTask.findUnique({ where }))?.name ?? null;
            case 'jobId':
                return (await db.printJob.findUnique({ where }))?.filename ?? null;
            case 'spoolId':
                return (await db.localSpool.findUnique({ where }))?.name ?? null;
            case 'itemId':
            case 'ids': {
                const include = { file: true };
                const row =
                    (await db.queueItem.findUnique({ where, include })) ??
                    (await db.scheduledPrint.findUnique({ where, include }));
                return row?.file.filename ?? null;
            }
            default:
                return null;
        }
    }
}
