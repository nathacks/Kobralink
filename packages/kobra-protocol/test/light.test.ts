import { describe, expect, it } from 'bun:test';
import { readLight } from '../src/light';
import { CAMERA_LIGHT_TYPE } from '../src/types';

describe('readLight', () => {
    it('picks the camera light out of a query answer that lists every lamp', () => {
        const data = {
            lights: [
                { type: 1, status: 0, brightness: 0 },
                { type: CAMERA_LIGHT_TYPE, status: 1, brightness: 100 },
            ],
        };
        expect(readLight(data)).toEqual({ on: true, brightness: 100 });
    });

    it('says nothing when the list has no camera light', () => {
        expect(readLight({ lights: [{ type: 2, status: 1, brightness: 100 }] })).toBeNull();
        expect(readLight({ lights: [] })).toBeNull();
    });

    it('reads the bare light a control answer carries', () => {
        expect(readLight({ type: CAMERA_LIGHT_TYPE, status: 0, brightness: 0 })).toEqual({ on: false, brightness: 0 });
        expect(readLight({ status: 1, brightness: 60 })).toEqual({ on: true, brightness: 60 });
    });

    it('ignores a bare light of another lamp', () => {
        expect(readLight({ type: 2, status: 1, brightness: 100 })).toBeNull();
    });

    it('treats a light without a status as unknown, not as off', () => {
        expect(readLight({ type: CAMERA_LIGHT_TYPE, brightness: 100 })).toBeNull();
        expect(readLight({ status: null })).toBeNull();
        expect(readLight({ lights: [{ type: CAMERA_LIGHT_TYPE }] })).toBeNull();
        expect(readLight(null)).toBeNull();
        expect(readLight(undefined)).toBeNull();
    });

    it('reads a missing brightness as 0', () => {
        expect(readLight({ status: 1 })).toEqual({ on: true, brightness: 0 });
    });

    it('can read another lamp type when asked', () => {
        expect(readLight({ lights: [{ type: 2, status: 1, brightness: 80 }] }, 2)).toEqual({
            on: true,
            brightness: 80,
        });
    });
});
