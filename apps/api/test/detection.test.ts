import { describe, expect, test } from 'bun:test';
import { FailurePrediction } from '../src/detection/prediction';

describe('FailurePrediction', () => {
    test('stays safe during the initial frames', () => {
        const p = new FailurePrediction();
        for (let i = 0; i < 29; i++) p.update([{ x: 0, y: 0, w: 1, h: 1, confidence: 0.9 }]);
        expect(p.isFailing(1)).toBe(false);
    });

    test('flags sustained high-confidence detections', () => {
        const p = new FailurePrediction();
        for (let i = 0; i < 60; i++) p.update([]);
        for (let i = 0; i < 20; i++) p.update([{ x: 0, y: 0, w: 1, h: 1, confidence: 0.95 }]);
        expect(p.isFailing(1)).toBe(true);
        expect(p.score(1)).toBeGreaterThan(0.8);
    });

    test('ignores isolated spikes', () => {
        const p = new FailurePrediction();
        for (let i = 0; i < 60; i++) p.update([]);
        p.update([{ x: 0, y: 0, w: 1, h: 1, confidence: 0.6 }]);
        for (let i = 0; i < 5; i++) p.update([]);
        expect(p.isFailing(1)).toBe(false);
    });

    test('escalation is stricter than warning', () => {
        const p = new FailurePrediction();
        for (let i = 0; i < 200; i++) p.update([]);
        for (let i = 0; i < 15; i++) p.update([{ x: 0, y: 0, w: 1, h: 1, confidence: 0.7 }]);
        expect(p.isFailing(1)).toBe(true);
        expect(p.isFailing(1, 1.75)).toBe(false);
    });
});
