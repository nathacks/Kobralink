import { describe, expect, it } from 'bun:test';
import type { PrinterLiveState } from '@kobralink/shared';
import { type BridgePrinterConfig, moonrakerThumbnails, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';
import { HaMqttService } from '../src/ha/ha-mqtt.service';
import type { SettingsService } from '../src/settings/settings.service';

function pngB64(width: number, height: number): string {
    const buf = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
    buf.writeUInt32BE(13, 8);
    buf.write('IHDR', 12, 'ascii');
    buf.writeUInt32BE(width, 16);
    buf.writeUInt32BE(height, 20);
    return buf.toString('base64');
}

function bridgeWith(thumbnail: string | null): PrinterBridge {
    const gcode = {
        getByFilename: async (name: string) =>
            name === 'cube.gcode' ? { thumbnail, layerHeight: 0.2, firstLayerHeight: 0.2, sizeBytes: 10 } : null,
    } as unknown as GcodeService;
    const config = {
        id: 'p',
        name: 'Kobra X',
        ip: '127.0.0.1',
        httpPort: 7125,
        settings: {},
    } as unknown as BridgePrinterConfig;
    return new PrinterBridge(config, gcode, { cert: Buffer.alloc(0), key: Buffer.alloc(0) }, []);
}

describe('moonraker thumbnails', () => {
    it('describes a PNG thumbnail with its size and path', () => {
        const b64 = pngB64(300, 200);
        expect(moonrakerThumbnails('cube.gcode', b64)).toEqual([
            {
                width: 300,
                height: 200,
                size: 33,
                relative_path: `.thumbs/${Buffer.from('cube.gcode').toString('base64url')}.png`,
            },
        ]);
    });

    it('ignores missing or non-PNG data', () => {
        expect(moonrakerThumbnails('cube.gcode', '')).toEqual([]);
        expect(moonrakerThumbnails('cube.gcode', Buffer.from('not a png at all, really').toString('base64'))).toEqual(
            [],
        );
    });

    it('exposes the stored gcode thumbnail through metadata and the image route', async () => {
        const bridge = bridgeWith(pngB64(64, 64));
        const meta = await bridge.fileMetadata('cube.gcode');
        expect(meta.thumbnails).toEqual([
            {
                width: 64,
                height: 64,
                size: 33,
                relative_path: `.thumbs/${Buffer.from('cube.gcode').toString('base64url')}.png`,
            },
        ]);
        expect((await bridge.fileThumbnail('cube.gcode'))?.readUInt32BE(16)).toBe(64);
        expect(await bridge.fileThumbnail('other.gcode')).toBeNull();
    });
});

describe('thumbnail path encoding', () => {
    it('produces a URL-safe path that decodes back to the filename', () => {
        const filename = 'Benchy #2 ?50% é/x.gcode';
        const [thumb] = moonrakerThumbnails(filename, pngB64(1, 1));
        expect(thumb.relative_path).toMatch(/^\.thumbs\/[A-Za-z0-9_-]+\.png$/);
        const name = thumb.relative_path.slice('.thumbs/'.length);
        expect(Buffer.from(name.replace(/\.png$/i, ''), 'base64url').toString()).toBe(filename);
    });
});

describe('home assistant thumbnail', () => {
    it('announces an image entity and publishes the thumbnail once per change', () => {
        const published: { topic: string; payload: string; retain?: boolean }[] = [];
        const service = new HaMqttService({} as SettingsService);
        const internals = service as unknown as {
            client: unknown;
            cfg: unknown;
            publishState: (b: PrinterBridge, s: PrinterLiveState) => void;
        };
        internals.client = {
            connected: true,
            publish: (topic: string, payload: string, opts?: { retain?: boolean }) =>
                published.push({ topic, payload, retain: opts?.retain }),
        };
        internals.cfg = { topicPrefix: 'kobralink', discoveryPrefix: 'homeassistant' };
        const bridge = bridgeWith(null);
        service.attach(bridge);
        const thumb = pngB64(8, 8);
        const state = { ...bridge.snapshot(), thumbnail: thumb };
        internals.publishState(bridge, state);
        internals.publishState(bridge, state);
        const config = published.find((p) => p.topic === 'homeassistant/image/kobralink_p/thumbnail/config');
        expect(JSON.parse(config?.payload ?? '{}')).toMatchObject({
            image_topic: 'kobralink/p/thumbnail',
            image_encoding: 'b64',
            content_type: 'image/png',
        });
        expect(published.filter((p) => p.topic === 'kobralink/p/thumbnail')).toEqual([
            { topic: 'kobralink/p/thumbnail', payload: thumb, retain: true },
        ]);
    });
});
