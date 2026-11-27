import type { BuildPlateStyle, ToolheadPosition } from '@kobralink/shared';
import { Grid } from '@react-three/drei/core/Grid';
import { OrbitControls } from '@react-three/drei/core/OrbitControls';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
    BoxGeometry,
    BufferAttribute,
    BufferGeometry,
    Color,
    type Group,
    InstancedMesh,
    Matrix4,
    MOUSE,
    Object3D,
    TOUCH,
    Vector3,
} from 'three';
import { type ThemeColors, useThemeColors } from '@/hooks/use-theme-colors';
import type { ParsedGcode } from '@/lib/gcode-parser.worker';
import {
    buildToolpath,
    locate,
    onTrack,
    type Point,
    type Progress,
    type Toolpath,
    type Track,
    track,
} from '@/lib/nozzle-path';
import { fitCamera } from '@/lib/scene-fit';
import type { ToolheadFeed } from '@/lib/toolhead-feed';
import { BuildPlate } from './build-plate';
import { Toolhead, type ToolheadModel } from './toolhead';

export type SceneMode = 'lines' | 'solid' | 'ghost';

const MIN_TINT_LIGHTNESS = 0.24;

function visibleTint(tint: string | undefined): string | undefined {
    if (!tint) return undefined;
    const color = new Color(tint);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    if (hsl.l < MIN_TINT_LIGHTNESS) color.setHSL(hsl.h, hsl.s, MIN_TINT_LIGHTNESS);
    return `#${color.getHexString()}`;
}

const STRIDE = 6;
const GHOST_OPACITY = 0.15;
const NO_PALETTE: string[] = [];
const HEAD_SCALE = 0.5;
const FILAMENT_AREA = Math.PI * 0.875 ** 2;
const local = new Matrix4();
const work = new Matrix4();
const stretch = new Vector3();
const point = new Vector3();

type ProgressRef = RefObject<Progress | null>;

function layerIndex(shown: number, ends: number[]): number {
    return Math.min(Math.max(shown, 1), ends.length) - 1;
}

function buildLines(data: ParsedGcode) {
    const { layers, minX, maxX, minY, maxY } = data;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let points = 0;
    for (const l of layers) points += (l.segs.length / STRIDE) * 2;
    const positions = new Float32Array(points * 3);
    const ends: number[] = [];
    let o = 0;
    for (const l of layers) {
        const s = l.segs;
        for (let k = 0; k < s.length; k += STRIDE) {
            positions[o++] = s[k] - cx;
            positions[o++] = l.z;
            positions[o++] = -(s[k + 1] - cy);
            positions[o++] = s[k + 2] - cx;
            positions[o++] = l.z;
            positions[o++] = -(s[k + 3] - cy);
        }
        ends.push(o / 3);
    }
    const attribute = new BufferAttribute(positions, 3);
    const base = new BufferGeometry();
    base.setAttribute('position', attribute);
    const top = new BufferGeometry();
    top.setAttribute('position', attribute);
    return { base, top, ends, attribute, tip: { v: -1, end: new Vector3() } };
}

function buildSolid(data: ParsedGcode) {
    const { layers, minX, maxX, minY, maxY } = data;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let count = 0;
    for (const l of layers) count += l.segs.length / STRIDE;
    const geometry = new BoxGeometry(1, 1, 1);
    const mesh = new InstancedMesh(geometry, undefined, count);
    const dummy = new Object3D();
    const tools = new Uint8Array(count);
    const reach = new Float32Array(count);
    const ends: number[] = [];
    let i = 0;
    let prevZ = 0;
    for (const l of layers) {
        const h = Math.min(1, Math.max(0.05, l.z - prevZ));
        prevZ = l.z;
        const s = l.segs;
        for (let k = 0; k < s.length; k += STRIDE) {
            const x0 = s[k] - cx;
            const y0 = s[k + 1] - cy;
            const x1 = s[k + 2] - cx;
            const y1 = s[k + 3] - cy;
            const dx = x1 - x0;
            const dy = y1 - y0;
            const len = Math.hypot(dx, dy);
            const w = Math.min(1.5, Math.max(0.2, (s[k + 4] * FILAMENT_AREA) / (len * h)));
            dummy.position.set((x0 + x1) / 2, l.z - h / 2, -(y0 + y1) / 2);
            dummy.rotation.set(0, Math.atan2(dy, dx), 0);
            dummy.scale.set(len + w, h, w);
            dummy.updateMatrix();
            tools[i] = s[k + 5];
            reach[i] = len / (len + w);
            mesh.setMatrixAt(i++, dummy.matrix);
        }
        ends.push(i);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return { mesh, geometry, ends, tools, reach, tip: { i: -1, m: new Matrix4() } };
}

function touch(attribute: BufferAttribute, start: number, count: number) {
    attribute.addUpdateRange(start, count);
    attribute.needsUpdate = true;
}

function Lines({
    data,
    shown,
    colors,
    tint,
    progress,
}: {
    data: ParsedGcode;
    shown: number;
    colors: ThemeColors;
    tint?: string;
    progress: ProgressRef;
}) {
    const built = useMemo(() => buildLines(data), [data]);
    useEffect(() => {
        const { base, top } = built;
        return () => {
            base.dispose();
            top.dispose();
        };
    }, [built]);
    useFrame(() => {
        const { base, top, ends, attribute, tip } = built;
        if (!ends.length) return;
        const p = progress.current;
        const index = p ? p.layer : layerIndex(shown, ends);
        const start = index > 0 ? ends[index - 1] : 0;
        const v = p ? start + p.seg * 2 + 1 : -1;
        if (tip.v >= 0 && tip.v !== v) {
            attribute.setXYZ(tip.v, tip.end.x, tip.end.y, tip.end.z);
            touch(attribute, tip.v * 3, 3);
            tip.v = -1;
        }
        if (p) {
            if (tip.v < 0) {
                tip.v = v;
                tip.end.fromBufferAttribute(attribute, v);
            }
            point.fromBufferAttribute(attribute, v - 1).lerp(tip.end, p.t);
            attribute.setXYZ(v, point.x, point.y, point.z);
            touch(attribute, v * 3, 3);
        }
        base.setDrawRange(0, start);
        top.setDrawRange(start, (p ? v + 1 : ends[index]) - start);
    });

    return (
        <group>
            <lineSegments geometry={built.base}>
                <lineBasicMaterial color={tint ?? colors.muted} transparent opacity={tint ? 0.85 : 0.35} />
            </lineSegments>
            <lineSegments geometry={built.top}>
                <lineBasicMaterial color={tint ?? colors.primary} />
            </lineSegments>
        </group>
    );
}

function buildGhost({ mesh, tip }: ReturnType<typeof buildSolid>) {
    const ghost = new InstancedMesh(mesh.geometry, undefined, mesh.instanceMatrix.count);
    ghost.instanceMatrix.array.set(mesh.instanceMatrix.array);
    if (tip.i >= 0) ghost.setMatrixAt(tip.i, tip.m);
    ghost.instanceMatrix.needsUpdate = true;
    return ghost;
}

function Solid({
    data,
    shown,
    palette,
    fallback,
    progress,
    ghost,
}: {
    data: ParsedGcode;
    shown: number;
    palette: string[];
    fallback: string;
    progress: ProgressRef;
    ghost: boolean;
}) {
    const built = useMemo(() => buildSolid(data), [data]);
    const ghostMesh = useMemo(() => (ghost ? buildGhost(built) : null), [built, ghost]);
    useEffect(() => () => ghostMesh?.dispose(), [ghostMesh]);
    useEffect(() => {
        const { mesh, geometry } = built;
        return () => {
            geometry.dispose();
            mesh.dispose();
        };
    }, [built]);
    useLayoutEffect(() => {
        const { mesh, tools } = built;
        const swatches = palette.map((hex) => new Color(hex));
        const base = new Color(fallback);
        for (let i = 0; i < tools.length; i++) mesh.setColorAt(i, swatches[tools[i]] ?? swatches[0] ?? base);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (ghostMesh) ghostMesh.instanceColor = mesh.instanceColor;
    }, [built, ghostMesh, palette, fallback]);
    useFrame(() => {
        const { mesh, ends, reach, tip } = built;
        if (!ends.length) return;
        const p = progress.current;
        const i = p ? (p.layer > 0 ? ends[p.layer - 1] : 0) + p.seg : -1;
        if (tip.i >= 0 && tip.i !== i) {
            mesh.setMatrixAt(tip.i, tip.m);
            touch(mesh.instanceMatrix, tip.i * 16, 16);
            tip.i = -1;
        }
        if (p) {
            if (tip.i < 0) {
                tip.i = i;
                mesh.getMatrixAt(i, tip.m);
            }
            const sx = 1 - reach[i] * (1 - p.t);
            local.makeTranslation(sx / 2 - 0.5, 0, 0).scale(stretch.set(sx, 1, 1));
            mesh.setMatrixAt(i, work.multiplyMatrices(tip.m, local));
            touch(mesh.instanceMatrix, i * 16, 16);
        }
        mesh.count = p ? i + 1 : ends[layerIndex(shown, ends)];
    });

    return (
        <>
            <primitive object={built.mesh}>
                <meshStandardMaterial roughness={0.6} metalness={0.05} />
            </primitive>
            {ghostMesh && (
                <primitive object={ghostMesh}>
                    <meshStandardMaterial
                        transparent
                        opacity={GHOST_OPACITY}
                        depthWrite={false}
                        polygonOffset
                        polygonOffsetFactor={1}
                        polygonOffsetUnits={1}
                        roughness={0.6}
                        metalness={0.05}
                    />
                </primitive>
            )}
        </>
    );
}

type Move = {
    fromS: number | null;
    toS: number | null;
    fromXY: Point;
    toXY: Point;
    z: number;
    onPath: boolean;
    start: number;
    duration: number;
};

function drawnAt(m: Move, now: number): number | null {
    if (m.toS === null || m.fromS === null) return m.toS;
    const k = m.duration ? Math.min(1, (now - m.start) / m.duration) : 1;
    return m.fromS + (m.toS - m.fromS) * k;
}

function Nozzle({
    data,
    position,
    model,
    feed,
    layer,
    visible,
    progress,
}: {
    data: ParsedGcode;
    position: ToolheadPosition;
    model: ToolheadModel;
    feed: ToolheadFeed;
    layer: number;
    visible: boolean;
    progress: ProgressRef;
}) {
    const ref = useRef<Group>(null);
    const at = useRef<Point | null>(null);
    const move = useRef<Move | null>(null);
    const tracker = useRef<{ tp: Toolpath; state: Track } | null>(null);
    const hint = useRef(layer);
    hint.current = layer;
    const tp = useMemo(() => buildToolpath(data), [data]);
    const cx = (data.minX + data.maxX) / 2;
    const cy = (data.minY + data.maxY) / 2;
    const { x: px, y: py, z: pz } = position;

    useEffect(() => {
        const now = performance.now();
        const last = move.current;
        const prev = tracker.current?.tp === tp ? tracker.current.state : null;
        const state = track(tp, prev, { x: px, y: py, z: pz }, now, hint.current);
        tracker.current = { tp, state };
        const drawn = last && prev ? drawnAt(last, now) : null;
        move.current = {
            fromS: drawn !== null && state.s !== null && drawn <= state.s ? drawn : state.s,
            toS: state.s,
            fromXY: at.current ?? [px, py],
            toXY: [px, py],
            z: pz,
            onPath: prev !== null && onTrack(prev) && onTrack(state),
            start: now,
            duration: last ? Math.min(2000, Math.max(300, now - last.start)) : 0,
        };
    }, [tp, px, py, pz]);

    useEffect(
        () => () => {
            progress.current = null;
        },
        [progress],
    );

    useFrame(() => {
        const m = move.current;
        if (!m || !ref.current) return;
        const s = drawnAt(m, performance.now());
        const spot = s === null ? null : locate(tp, s);
        const k = m.duration ? Math.min(1, (performance.now() - m.start) / m.duration) : 1;
        const [x, y]: Point =
            m.onPath && spot
                ? [spot.x, spot.y]
                : [m.fromXY[0] + (m.toXY[0] - m.fromXY[0]) * k, m.fromXY[1] + (m.toXY[1] - m.fromXY[1]) * k];
        at.current = [x, y];
        ref.current.position.set(x - cx, m.z, -(y - cy));
        progress.current = spot;
    });

    return (
        <group ref={ref} scale={HEAD_SCALE} visible={visible}>
            <Toolhead model={model} feed={feed} />
        </group>
    );
}

type Controls = {
    target: { set: (x: number, y: number, z: number) => void };
    update: () => void;
    saveState: () => void;
    reset?: () => void;
};

function FitView({ size }: { size: { x: number; y: number; z: number } }) {
    const camera = useThree((s) => s.camera);
    const controls = useThree((s) => s.controls) as Controls | null;
    const width = useThree((s) => s.size.width);
    const height = useThree((s) => s.size.height);
    const fitted = useRef('');
    useLayoutEffect(() => {
        if (!controls || !width || !height) return;
        const key = `${size.x}|${size.y}|${size.z}`;
        if (fitted.current === key) return;
        fitted.current = key;
        const fov = 'fov' in camera ? (camera.fov as number) : 45;
        const fit = fitCamera(size, fov, width / height);
        camera.position.set(...fit.position);
        controls.target.set(...fit.target);
        controls.update();
        controls.saveState();
    }, [camera, controls, width, height, size]);
    return null;
}

function ResetView({ signal }: { signal: number }) {
    const controls = useThree((s) => s.controls) as { reset?: () => void } | null;
    const last = useRef(signal);
    useEffect(() => {
        if (last.current === signal) return;
        last.current = signal;
        controls?.reset?.();
    }, [signal, controls]);
    return null;
}

export function GcodeScene({
    data,
    shown,
    mode,
    palette = NO_PALETTE,
    pan,
    resetSignal,
    tint,
    nozzle,
    showHead = true,
    toolhead = 'kobra-4',
    feed,
    plate,
    plateStyle = 'anycubic',
}: {
    data: ParsedGcode;
    shown: number;
    mode: SceneMode;
    palette?: string[];
    pan: boolean;
    resetSignal: number;
    tint?: string;
    nozzle?: ToolheadPosition | null;
    showHead?: boolean;
    toolhead?: ToolheadModel;
    feed?: ToolheadFeed;
    plate?: { x: number; y: number } | null;
    plateStyle?: BuildPlateStyle;
}) {
    const colors = useThemeColors();
    const progress = useRef<Progress | null>(null);
    const shownTint = visibleTint(tint);
    const span = Math.max(1, data.maxX - data.minX, data.maxY - data.minY);
    const height = data.layers.length ? data.layers[data.layers.length - 1].z : 1;
    const bed = Math.max(Math.ceil((span * 1.6) / 10) * 10, 40);
    const size = useMemo(
        () => ({ x: Math.max(1, data.maxX - data.minX), y: Math.max(1, data.maxY - data.minY), z: height }),
        [data.maxX, data.minX, data.maxY, data.minY, height],
    );
    const distance = fitCamera(size, 45).distance;
    const plateCenter: [number, number, number] = plate
        ? [plate.x / 2 - (data.minX + data.maxX) / 2, 0, -(plate.y / 2 - (data.minY + data.maxY) / 2)]
        : [0, 0, 0];

    return (
        <Canvas
            dpr={[1, 2]}
            camera={{ position: [distance * 0.7, distance * 0.6, distance * 0.7], fov: 45, near: 0.1, far: 10000 }}
        >
            <ambientLight intensity={mode === 'lines' ? 1 : 0.9} />
            {mode !== 'lines' && <hemisphereLight args={['#ffffff', '#444444', 0.6]} />}
            <directionalLight position={[distance, distance * 1.5, distance * 0.5]} intensity={1.6} />
            <directionalLight position={[-distance, distance * 0.5, -distance]} intensity={0.5} />
            {plateStyle === 'none' ? (
                <>
                    {plate && (
                        <mesh position={[plateCenter[0], -0.05, plateCenter[2]]} rotation-x={-Math.PI / 2}>
                            <planeGeometry args={[plate.x, plate.y]} />
                            <meshBasicMaterial color={colors.muted} transparent opacity={0.12} depthWrite={false} />
                        </mesh>
                    )}
                    <Grid
                        args={plate ? [plate.x, plate.y] : [bed, bed]}
                        position={plateCenter}
                        cellSize={10}
                        cellThickness={0.6}
                        cellColor={colors.border}
                        sectionSize={50}
                        sectionThickness={1}
                        sectionColor={colors.muted}
                        fadeDistance={plate ? Math.max(distance * 4, Math.hypot(plate.x, plate.y) * 2) : distance * 4}
                        fadeStrength={1}
                    />
                </>
            ) : (
                <BuildPlate size={plate ?? { x: bed, y: bed }} position={plateCenter} style={plateStyle} />
            )}
            {mode !== 'lines' ? (
                <Solid
                    data={data}
                    shown={shown}
                    palette={palette}
                    fallback={shownTint ?? colors.primary}
                    progress={progress}
                    ghost={mode === 'ghost'}
                />
            ) : (
                <Lines data={data} shown={shown} colors={colors} tint={shownTint} progress={progress} />
            )}
            {nozzle && feed && (
                <Nozzle
                    data={data}
                    position={nozzle}
                    model={toolhead}
                    feed={feed}
                    layer={shown - 1}
                    visible={showHead}
                    progress={progress}
                />
            )}
            <OrbitControls
                makeDefault
                target={[0, height / 2, 0]}
                enableDamping
                dampingFactor={0.12}
                enablePan
                panSpeed={1}
                mouseButtons={{ LEFT: pan ? MOUSE.PAN : MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }}
                touches={{ ONE: pan ? TOUCH.PAN : TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
                minDistance={5}
                maxDistance={distance * 6}
            />
            <FitView size={size} />
            <ResetView signal={resetSignal} />
        </Canvas>
    );
}
