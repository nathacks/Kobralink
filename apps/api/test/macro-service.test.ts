import { describe, expect, it, mock } from 'bun:test';
import type { MacroAction } from '@kobralink/shared';
import type { PrinterBridge } from '../src/bridge/printer-bridge';
import { MacroService } from '../src/macros/macro.service';
import type { PrismaService } from '../src/prisma/prisma.service';

function run(actions: MacroAction[]) {
    const moveAxis = mock(async (_axis: number, _moveType: number, _distance: number) => undefined);
    const bridge = { id: 'printer-1', config: { name: 'Kobra 4' }, moveAxis } as unknown as PrinterBridge;
    const svc = new MacroService({} as PrismaService);
    return svc.run(bridge, { id: 'm1', name: 'Home', icon: 'home', actions } as never).then(() => moveAxis);
}

describe('MacroService home action', () => {
    it('homes X, Y and Z with the official XYZ code', async () => {
        const moveAxis = await run([{ type: 'home', axis: 'all' }]);
        expect(moveAxis).toHaveBeenCalledWith(5, 2, 0);
    });

    it('homes X and Y with the official XY code', async () => {
        const moveAxis = await run([{ type: 'home', axis: 'xy' }]);
        expect(moveAxis).toHaveBeenCalledWith(4, 2, 0);
    });

    it('homes Z alone with the Z axis code', async () => {
        const moveAxis = await run([{ type: 'home', axis: 'z' }]);
        expect(moveAxis).toHaveBeenCalledWith(3, 2, 0);
    });

    it('still jogs a single axis by its own code', async () => {
        const moveAxis = await run([{ type: 'move', axis: 'y', distance: -10 }]);
        expect(moveAxis).toHaveBeenCalledWith(2, 0, 10);
    });
});
