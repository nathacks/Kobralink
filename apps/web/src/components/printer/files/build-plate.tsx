import type { BuildPlateStyle } from '@kobralink/shared';
import { useEffect, useMemo } from 'react';
import {
    CanvasTexture,
    ClampToEdgeWrapping,
    ExtrudeGeometry,
    MeshStandardMaterial,
    Shape,
    SRGBColorSpace,
} from 'three';

const SHEET_THICKNESS = 0.8;
const TEXTURE_PX = 2048;
const FONT = '"Outfit Variable", system-ui, sans-serif';

type Sheet = {
    margin: { side: number; back: number; front: number };
    overhang: number;
    edge: string;
    surface: { base: string; noise: number; specks: number };
    shape: (w: number, d: number) => Shape;
    paint: (ctx: CanvasRenderingContext2D, w: number, d: number) => void;
};

function grain(ctx: CanvasRenderingContext2D, { base, noise, specks }: Sheet['surface']) {
    const { width, height } = ctx.canvas;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < image.data.length; i += 4) {
        const n = (Math.random() - 0.5) * noise + (Math.random() < specks ? 38 : 0);
        image.data[i] += n;
        image.data[i + 1] += n;
        image.data[i + 2] += n;
    }
    ctx.putImageData(image, 0, 0);
}

function roundedCorners(s: Shape, x: number, y: number, w: number, d: number, r: number) {
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r);
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
}

const PEI: Sheet = (() => {
    const tab = { width: 36, depth: 7 };
    return {
        margin: { side: 4, back: 4, front: 4 },
        overhang: tab.depth,
        edge: '#5b5f64',
        surface: { base: '#2b2d30', noise: 26, specks: 0 },
        shape: (w, d) => {
            const x = -w / 2;
            const y = -d / 2;
            const r = Math.min(6, w / 4, d / 4);
            const t = Math.min(tab.width, w / 3) / 2;
            const s = new Shape();
            s.moveTo(x + r, y);
            s.lineTo(-t - 3, y);
            s.quadraticCurveTo(-t, y, -t, y - 3);
            s.lineTo(-t, y - tab.depth + 2);
            s.quadraticCurveTo(-t, y - tab.depth, -t + 2, y - tab.depth);
            s.lineTo(t - 2, y - tab.depth);
            s.quadraticCurveTo(t, y - tab.depth, t, y - tab.depth + 2);
            s.lineTo(t, y - 3);
            s.quadraticCurveTo(t, y, t + 3, y);
            roundedCorners(s, x, y, w, d, r);
            s.lineTo(x + r, y + d);
            s.quadraticCurveTo(x, y + d, x, y + d - r);
            s.lineTo(x, y + r);
            s.quadraticCurveTo(x, y, x + r, y);
            return s;
        },
        paint: (ctx, w, d) => {
            ctx.fillStyle = 'rgba(200, 204, 209, 0.55)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `700 4.5px ${FONT}`;
            ctx.fillText('ANYCUBIC', w / 2, d + tab.depth / 2);
            ctx.font = `600 3px ${FONT}`;
            ctx.fillStyle = 'rgba(200, 204, 209, 0.3)';
            ctx.textAlign = 'left';
            ctx.fillText('PEI', 6, d - 6);
        },
    };
})();

const ANYCUBIC: Sheet = (() => {
    const band = 3;
    const label = 6;
    const bandFrom = 0.585;
    const notch = (s: Shape, cx: number, y: number, depth: number) => {
        s.lineTo(cx - 2, y);
        s.lineTo(cx, y + depth);
        s.lineTo(cx + 2, y);
    };
    return {
        margin: { side: 3, back: 4, front: 14 },
        overhang: band,
        edge: '#2c2e31',
        surface: { base: '#1e1f21', noise: 22, specks: 0.025 },
        shape: (w, d) => {
            const x = -w / 2;
            const y = -d / 2;
            const r = 3;
            const step = x + w * bandFrom;
            const s = new Shape();
            s.moveTo(x + r, y);
            notch(s, x + w * 0.555, y, 1.4);
            s.lineTo(step - band, y);
            s.lineTo(step, y - band);
            s.lineTo(x + w - r, y - band);
            s.quadraticCurveTo(x + w, y - band, x + w, y - band + r);
            s.lineTo(x + w, y + d - r);
            s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
            notch(s, x + w * 0.72, y + d, -1.4);
            notch(s, x + w * 0.3, y + d, -1.4);
            s.lineTo(x + r, y + d);
            s.quadraticCurveTo(x, y + d, x, y + d - r);
            s.lineTo(x, y + r);
            s.quadraticCurveTo(x, y, x + r, y);
            return s;
        },
        paint: (ctx, w, d) => {
            const white = '#e4e5e7';
            const x0 = w * bandFrom + 1;
            const x1 = w - 1.2;
            ctx.fillStyle = '#b4b7bb';
            ctx.beginPath();
            ctx.roundRect(x0, d + band - label - 0.4, x1 - x0, label, 0.8);
            ctx.fill();
            const mid = d + band - 0.4 - label / 2;
            const split = x0 + (x1 - x0) * 0.55;
            ctx.fillStyle = '#55595e';
            ctx.fillRect(split, mid - 1.8, 0.25, 3.6);
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.font = `500 3px ${FONT}`;
            ctx.fillText('PLA / ABS / PETG', (x0 + split) / 2, mid);
            ctx.font = `700 3.4px ${FONT}`;
            ctx.fillStyle = '#3d4044';
            ctx.fillText('ANYCUBIC', split + (x1 - 6 - split) / 2, mid);
            ctx.fillStyle = '#2a2c2f';
            ctx.fillRect(x1 - 5, mid - 2, 4, 4);
            ctx.strokeStyle = white;
            ctx.lineWidth = 0.35;
            ctx.lineJoin = 'round';
            const tx = w - 7;
            const ty = d - 8;
            ctx.beginPath();
            ctx.moveTo(tx, ty - 3.4);
            ctx.lineTo(tx + 3.6, ty + 2.8);
            ctx.lineTo(tx - 3.6, ty + 2.8);
            ctx.closePath();
            ctx.stroke();
            ctx.lineWidth = 0.25;
            for (const dx of [-0.8, 0, 0.8]) {
                ctx.beginPath();
                ctx.moveTo(tx + dx, ty + 1.4);
                ctx.quadraticCurveTo(tx + dx + 0.4, ty + 0.7, tx + dx, ty);
                ctx.quadraticCurveTo(tx + dx - 0.4, ty - 0.6, tx + dx, ty - 1);
                ctx.stroke();
            }
            const text = 'Double Sided PEI Sheet';
            ctx.font = `700 6.5px ${FONT}`;
            const half = ctx.measureText(text).width / 2;
            const lx = 7.5;
            const cy = d * 0.4;
            ctx.save();
            ctx.translate(lx, cy);
            ctx.rotate(Math.PI / 2);
            ctx.fillStyle = white;
            ctx.textAlign = 'center';
            ctx.fillText(text, 0, 0);
            ctx.restore();
            ctx.fillStyle = white;
            ctx.fillRect(lx - 0.15, d * 0.05, 0.3, cy - half - 4 - d * 0.05);
            ctx.fillRect(lx - 0.15, cy + half + 4, 0.3, d * 0.96 - (cy + half + 4));
        },
    };
})();

type SheetStyle = Exclude<BuildPlateStyle, 'none'>;

const SHEETS: Record<SheetStyle, Sheet> = { anycubic: ANYCUBIC, pei: PEI };

function sheetTexture(sheet: Sheet, w: number, d: number): CanvasTexture {
    const depth = d + sheet.overhang;
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_PX;
    canvas.height = Math.round((TEXTURE_PX * depth) / w);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    grain(ctx, sheet.surface);
    const scale = canvas.width / w;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    sheet.paint(ctx, w, d);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.repeat.set(1 / w, 1 / depth);
    texture.offset.set(0.5, (d / 2 + sheet.overhang) / depth);
    return texture;
}

export function BuildPlate({
    size,
    position,
    style,
}: {
    size: { x: number; y: number };
    position: [number, number, number];
    style: SheetStyle;
}) {
    const sheet = SHEETS[style];
    const { side, back, front } = sheet.margin;
    const w = size.x + side * 2;
    const d = size.y + back + front;
    const geometry = useMemo(
        () => new ExtrudeGeometry(sheet.shape(w, d), { depth: SHEET_THICKNESS, bevelEnabled: false, curveSegments: 6 }),
        [sheet, w, d],
    );
    const materials = useMemo(
        () => [
            new MeshStandardMaterial({ map: sheetTexture(sheet, w, d), roughness: 0.85, metalness: 0.1 }),
            new MeshStandardMaterial({ color: sheet.edge, roughness: 0.4, metalness: 0.7 }),
        ],
        [sheet, w, d],
    );
    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(
        () => () => {
            for (const material of materials) {
                material.map?.dispose();
                material.dispose();
            }
        },
        [materials],
    );
    return (
        <group position={[position[0], position[1], position[2] + (front - back) / 2]}>
            <mesh
                geometry={geometry}
                material={materials}
                rotation-x={-Math.PI / 2}
                position={[0, -SHEET_THICKNESS, 0]}
            />
        </group>
    );
}
