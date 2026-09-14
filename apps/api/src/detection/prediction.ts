import type { DetectionBox } from '@kobralink/shared';

export const DETECTION_THRESH = 0.08;
const EWM_SPAN = 12;
const ROLLING_WIN_SHORT = 310;
const ROLLING_WIN_LONG = 7200;
const THRESHOLD_LOW = 0.38;
const THRESHOLD_HIGH = 0.78;
const INIT_SAFE_FRAME_NUM = 30;
const ROLLING_MEAN_SHORT_MULTIPLE = 3.8;
export const ESCALATING_FACTOR = 1.75;
const EWM_ALPHA = 2 / (EWM_SPAN + 1);

export class FailurePrediction {
    frames = 0;
    currentP = 0;
    ewmMean = 0;
    rollingShort = 0;
    rollingLong = 0;

    reset(): void {
        this.frames = 0;
        this.currentP = 0;
        this.ewmMean = 0;
        this.rollingShort = 0;
        this.rollingLong = 0;
    }

    update(boxes: DetectionBox[]): void {
        const p = boxes.reduce((sum, b) => sum + b.confidence, 0);
        this.frames += 1;
        this.currentP = p;
        this.ewmMean = p * EWM_ALPHA + this.ewmMean * (1 - EWM_ALPHA);
        this.rollingShort = nextRolling(p, this.rollingShort, this.frames, ROLLING_WIN_SHORT);
        this.rollingLong = nextRolling(p, this.rollingLong, this.frames, ROLLING_WIN_LONG);
    }

    adjusted(sensitivity: number, escalating = 1): number {
        return ((this.ewmMean - this.rollingLong) * sensitivity) / escalating;
    }

    score(sensitivity: number): number {
        return Math.max(0, Math.min(1, this.adjusted(sensitivity) / THRESHOLD_HIGH));
    }

    isFailing(sensitivity: number, escalating = 1): boolean {
        if (this.frames < INIT_SAFE_FRAME_NUM) return false;
        const adjusted = this.adjusted(sensitivity, escalating);
        if (adjusted < THRESHOLD_LOW) return false;
        if (adjusted > THRESHOLD_HIGH) return true;
        return adjusted > (this.rollingShort - this.rollingLong) * ROLLING_MEAN_SHORT_MULTIPLE;
    }
}

function nextRolling(p: number, current: number, count: number, win: number): number {
    return current + (p - current) / (win <= count ? win : count + 1);
}
