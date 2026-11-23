import {
    type CompleteMaintenanceInput,
    type MaintenanceLogDto,
    type MaintenanceTaskDto,
    type MaintenanceTaskInput,
    type MaintenanceUsage,
    maintenanceProgress,
} from '@kobralink/shared';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PrinterBridge } from '../bridge/printer-bridge';
import type { MaintenanceLog, MaintenanceTask } from '../generated/prisma/client';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';

const DAILY_CHECK_MS = 6 * 60 * 60_000;

@Injectable()
export class MaintenanceService {
    private readonly log = new Logger(MaintenanceService.name);
    private readonly detached = new Map<string, () => void>();
    private readonly bridges = new Map<string, PrinterBridge>();
    private timer: NodeJS.Timeout | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationService,
    ) {}

    attach(bridge: PrinterBridge): void {
        this.bridges.set(bridge.id, bridge);
        const onJob = (phase: 'start' | 'end') => {
            if (phase === 'end') setTimeout(() => void this.checkDue(bridge.id), 1500);
        };
        bridge.on('job', onJob);
        this.detached.set(bridge.id, () => bridge.off('job', onJob));
        if (!this.timer) {
            this.timer = setInterval(() => void this.checkAll(), DAILY_CHECK_MS);
            this.timer.unref?.();
        }
    }

    detach(printerId: string): void {
        this.detached.get(printerId)?.();
        this.detached.delete(printerId);
        this.bridges.delete(printerId);
        if (!this.bridges.size && this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async checkAll(): Promise<void> {
        for (const id of this.bridges.keys()) await this.checkDue(id).catch(() => undefined);
    }

    async checkDue(printerId: string): Promise<void> {
        const bridge = this.bridges.get(printerId);
        if (!bridge) return;
        const tasks = await this.list(printerId);
        for (const t of tasks) {
            const row = await this.prisma.client.maintenanceTask.findUnique({ where: { id: t.id } });
            if (!row) continue;
            if (!t.due) {
                if (row.dueNotifiedAt) {
                    await this.prisma.client.maintenanceTask.update({
                        where: { id: t.id },
                        data: { dueNotifiedAt: null },
                    });
                }
                continue;
            }
            if (row.dueNotifiedAt) continue;
            await this.prisma.client.maintenanceTask.update({
                where: { id: t.id },
                data: { dueNotifiedAt: new Date() },
            });
            this.log.log(`Maintenance due on ${bridge.config.name}: ${t.name}`);
            this.notifications.emitCustom(printerId, bridge.config.name, 'maintenance_due', {
                task: t.name,
                presetKey: t.presetKey,
                hours: Math.round(t.usage.hours),
                jobs: t.usage.jobs,
            });
        }
    }

    async usageSince(printerId: string, since: Date | null, now = new Date()): Promise<MaintenanceUsage> {
        const agg = await this.prisma.client.printJob.aggregate({
            where: {
                printerId,
                status: { not: 'printing' },
                ...(since ? { startedAt: { gt: since } } : {}),
            },
            _sum: { durationSec: true },
            _count: { _all: true },
        });
        const first = since
            ? null
            : await this.prisma.client.printJob.findFirst({ where: { printerId }, orderBy: { startedAt: 'asc' } });
        const from = since ?? first?.startedAt ?? null;
        return {
            hours: Math.round(((agg._sum.durationSec ?? 0) / 3600) * 10) / 10,
            jobs: agg._count._all,
            days: from ? Math.floor((now.getTime() - from.getTime()) / 86_400_000) : 0,
        };
    }

    async list(printerId: string): Promise<MaintenanceTaskDto[]> {
        const rows = await this.prisma.client.maintenanceTask.findMany({
            where: { printerId },
            orderBy: { createdAt: 'asc' },
        });
        const out: MaintenanceTaskDto[] = [];
        for (const r of rows) {
            const usage = await this.usageSince(printerId, r.lastDoneAt ?? r.createdAt);
            out.push(toDto(r, usage));
        }
        return out.sort((a, b) => b.progress - a.progress);
    }

    async create(printerId: string, input: MaintenanceTaskInput): Promise<MaintenanceTaskDto> {
        const row = await this.prisma.client.maintenanceTask.create({
            data: {
                printerId,
                name: input.name,
                presetKey: input.presetKey ?? '',
                note: input.note ?? '',
                intervalHours: input.intervalHours ?? 0,
                intervalJobs: input.intervalJobs ?? 0,
                intervalDays: input.intervalDays ?? 0,
            },
        });
        return toDto(row, await this.usageSince(printerId, row.createdAt));
    }

    async update(printerId: string, id: string, input: MaintenanceTaskInput): Promise<MaintenanceTaskDto> {
        const row = await this.find(printerId, id);
        const next = await this.prisma.client.maintenanceTask.update({
            where: { id: row.id },
            data: {
                name: input.name,
                presetKey: input.presetKey ?? '',
                note: input.note ?? '',
                intervalHours: input.intervalHours ?? 0,
                intervalJobs: input.intervalJobs ?? 0,
                intervalDays: input.intervalDays ?? 0,
                dueNotifiedAt: null,
            },
        });
        return toDto(next, await this.usageSince(printerId, next.lastDoneAt ?? next.createdAt));
    }

    async complete(printerId: string, id: string, input: CompleteMaintenanceInput): Promise<MaintenanceTaskDto> {
        const row = await this.find(printerId, id);
        const usage = await this.usageSince(printerId, row.lastDoneAt ?? row.createdAt);
        const now = new Date();
        await this.prisma.client.maintenanceLog.create({
            data: { taskId: row.id, doneAt: now, note: input.note ?? '', hours: usage.hours, jobs: usage.jobs },
        });
        const next = await this.prisma.client.maintenanceTask.update({
            where: { id: row.id },
            data: { lastDoneAt: now, dueNotifiedAt: null },
        });
        return toDto(next, { hours: 0, jobs: 0, days: 0 });
    }

    async logs(printerId: string, id: string, limit = 20): Promise<MaintenanceLogDto[]> {
        const row = await this.find(printerId, id);
        const rows = await this.prisma.client.maintenanceLog.findMany({
            where: { taskId: row.id },
            orderBy: { doneAt: 'desc' },
            take: limit,
        });
        return rows.map(toLogDto);
    }

    async remove(printerId: string, id: string): Promise<void> {
        const row = await this.find(printerId, id);
        await this.prisma.client.maintenanceTask.delete({ where: { id: row.id } });
    }

    private async find(printerId: string, id: string): Promise<MaintenanceTask> {
        const row = await this.prisma.client.maintenanceTask.findFirst({ where: { id, printerId } });
        if (!row) throw new NotFoundException();
        return row;
    }
}

export function toDto(r: MaintenanceTask, usage: MaintenanceUsage): MaintenanceTaskDto {
    const { progress, due } = maintenanceProgress(r, usage);
    return {
        id: r.id,
        printerId: r.printerId,
        name: r.name,
        presetKey: (r.presetKey as MaintenanceTaskDto['presetKey']) || '',
        note: r.note,
        intervalHours: r.intervalHours,
        intervalJobs: r.intervalJobs,
        intervalDays: r.intervalDays,
        lastDoneAt: r.lastDoneAt?.toISOString() ?? null,
        usage,
        progress,
        due,
        createdAt: r.createdAt.toISOString(),
    };
}

function toLogDto(r: MaintenanceLog): MaintenanceLogDto {
    return { id: r.id, taskId: r.taskId, doneAt: r.doneAt.toISOString(), note: r.note, hours: r.hours, jobs: r.jobs };
}
