import { z } from 'zod';

export interface QueueItemDto {
    id: string;
    printerId: string;
    fileId: string;
    filename: string;
    thumbnail: string | null;
    estPrintTimeSec: number;
    position: number;
    excludedObjects: string[];
    createdAt: string;
}

export const addQueueItemSchema = z.object({
    fileId: z.string().min(1),
    excludedObjects: z.array(z.string().min(1)).max(500).default([]),
});
export type AddQueueItemInput = z.input<typeof addQueueItemSchema>;

export const reorderQueueSchema = z.object({ ids: z.array(z.string().min(1)).max(500) });
export type ReorderQueueInput = z.infer<typeof reorderQueueSchema>;
