import { describe, expect, it, mock } from 'bun:test';
import type { PrinterBridge } from '../src/bridge/printer-bridge';
import { MoonrakerService } from '../src/moonraker/moonraker.service';

function run(script: string) {
    const setTemperature = mock((_nozzle?: number, _bed?: number) => undefined);
    const svc = new MoonrakerService(
        { setTemperature } as unknown as PrinterBridge,
        {} as never,
        {} as never,
        {} as never,
        { findByName: async () => null } as never,
    );
    return svc.execGcodeScript(script).then(() => setTemperature.mock.calls);
}

describe('Moonraker scripts', () => {
    it('run every line', async () => {
        expect(await run('M104 S200\nM140 S60')).toEqual([
            [200, undefined],
            [undefined, 60],
        ]);
    });

    it('ignore temperatures the printer cannot take', async () => {
        expect(await run('M104 S9999\nM140 S500\nSET_HEATER_TEMPERATURE HEATER=extruder TARGET=9999')).toEqual([]);
        expect(await run('SET_HEATER_TEMPERATURE HEATER=extruder TARGET=0')).toEqual([[0, undefined]]);
    });
});
