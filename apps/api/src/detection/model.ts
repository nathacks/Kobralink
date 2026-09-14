import type { DetectionBox } from '@kobralink/shared';
import { decode } from 'jpeg-js';

const INPUT_SIZE = 416;
const NMS_THRESH = 0.45;

type OrtTensor = { data: Float32Array; dims: readonly number[] };
type OrtSession = {
    inputNames: readonly string[];
    outputNames: readonly string[];
    run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
    release(): Promise<void>;
};
type OrtModule = {
    InferenceSession: { create(path: string, opts?: Record<string, unknown>): Promise<OrtSession> };
    Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
};

let ortCache: { module: OrtModule | null; error: string } | null = null;

export function loadOrt(): { module: OrtModule | null; error: string } {
    if (ortCache) return ortCache;
    try {
        ortCache = { module: require('onnxruntime-node') as OrtModule, error: '' };
    } catch (e) {
        ortCache = { module: null, error: e instanceof Error ? e.message : String(e) };
    }
    return ortCache;
}

export class FailureModel {
    private session: OrtSession | null = null;
    private busy: Promise<unknown> = Promise.resolve();

    constructor(private readonly ort: OrtModule) {}

    async load(path: string): Promise<void> {
        const session = await this.ort.InferenceSession.create(path, {
            executionProviders: ['cpu'],
            graphOptimizationLevel: 'all',
            intraOpNumThreads: 2,
        });
        this.session = session;
    }

    async release(): Promise<void> {
        const s = this.session;
        this.session = null;
        await s?.release().catch(() => undefined);
    }

    get loaded(): boolean {
        return this.session !== null;
    }

    detect(jpeg: Buffer, threshold: number): Promise<DetectionBox[]> {
        const run = this.busy.then(() => this.infer(jpeg, threshold));
        this.busy = run.catch(() => undefined);
        return run;
    }

    private async infer(jpeg: Buffer, threshold: number): Promise<DetectionBox[]> {
        const session = this.session;
        if (!session) throw new Error('model not loaded');
        const input = preprocess(jpeg);
        const tensor = new this.ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
        const out = await session.run({ [session.inputNames[0]]: tensor });
        const boxes = out[session.outputNames[0]];
        const confs = out[session.outputNames[1]];
        return postprocess(boxes, confs, threshold);
    }
}

function preprocess(jpeg: Buffer): Float32Array {
    const img = decode(jpeg, { useTArray: true, formatAsRGBA: true });
    const { width, height, data } = img;
    const plane = INPUT_SIZE * INPUT_SIZE;
    const out = new Float32Array(3 * plane);
    const sx = width / INPUT_SIZE;
    const sy = height / INPUT_SIZE;
    for (let y = 0; y < INPUT_SIZE; y++) {
        const fy = Math.min(height - 1, (y + 0.5) * sy - 0.5);
        const y0 = Math.max(0, Math.floor(fy));
        const y1 = Math.min(height - 1, y0 + 1);
        const wy = fy - y0;
        for (let x = 0; x < INPUT_SIZE; x++) {
            const fx = Math.min(width - 1, (x + 0.5) * sx - 0.5);
            const x0 = Math.max(0, Math.floor(fx));
            const x1 = Math.min(width - 1, x0 + 1);
            const wx = fx - x0;
            const i00 = (y0 * width + x0) * 4;
            const i01 = (y0 * width + x1) * 4;
            const i10 = (y1 * width + x0) * 4;
            const i11 = (y1 * width + x1) * 4;
            const o = y * INPUT_SIZE + x;
            for (let c = 0; c < 3; c++) {
                const top = data[i00 + c] * (1 - wx) + data[i01 + c] * wx;
                const bottom = data[i10 + c] * (1 - wx) + data[i11 + c] * wx;
                out[c * plane + o] = (top * (1 - wy) + bottom * wy) / 255;
            }
        }
    }
    return out;
}

function postprocess(boxes: OrtTensor, confs: OrtTensor, threshold: number): DetectionBox[] {
    const n = boxes.dims[1];
    const stride = boxes.dims.slice(2).reduce((a, b) => a * b, 1);
    const candidates: DetectionBox[] = [];
    for (let i = 0; i < n; i++) {
        const confidence = confs.data[i];
        if (confidence <= threshold) continue;
        const b = i * stride;
        const x1 = boxes.data[b];
        const y1 = boxes.data[b + 1];
        const x2 = boxes.data[b + 2];
        const y2 = boxes.data[b + 3];
        candidates.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, confidence });
    }
    candidates.sort((a, b) => b.confidence - a.confidence);
    const kept: DetectionBox[] = [];
    for (const c of candidates) {
        if (kept.every((k) => iou(k, c) <= NMS_THRESH)) kept.push(c);
    }
    return kept;
}

function iou(a: DetectionBox, b: DetectionBox): number {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const inter = ix * iy;
    const union = a.w * a.h + b.w * b.h - inter;
    return union <= 0 ? 0 : inter / union;
}
