import { Grid } from '@react-three/drei/core/Grid';
import { OrbitControls } from '@react-three/drei/core/OrbitControls';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, InstancedMesh, MOUSE, Object3D, TOUCH } from 'three';
import { type ThemeColors, useThemeColors } from '@/hooks/use-theme-colors';
import type { ParsedGcode } from '@/lib/gcode-parser.worker';

export type SceneMode = 'lines' | 'solid';

const STRIDE = 5;
const FILAMENT_AREA = Math.PI * 0.875 ** 2;

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
    return { base, top, ends };
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
            mesh.setMatrixAt(i++, dummy.matrix);
        }
        ends.push(i);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return { mesh, geometry, ends };
}

function Lines({ data, shown, colors }: { data: ParsedGcode; shown: number; colors: ThemeColors }) {
    const built = useMemo(() => buildLines(data), [data]);
    useEffect(() => {
        const { base, top } = built;
        return () => {
            base.dispose();
            top.dispose();
        };
    }, [built]);
    useLayoutEffect(() => {
        const { base, top, ends } = built;
        if (!ends.length) return;
        const index = Math.min(Math.max(shown, 1), ends.length) - 1;
        const end = ends[index];
        const start = index > 0 ? ends[index - 1] : 0;
        base.setDrawRange(0, start);
        top.setDrawRange(start, end - start);
    }, [built, shown]);

    return (
        <group>
            <lineSegments geometry={built.base}>
                <lineBasicMaterial color={colors.muted} transparent opacity={0.35} />
            </lineSegments>
            <lineSegments geometry={built.top}>
                <lineBasicMaterial color={colors.primary} />
            </lineSegments>
        </group>
    );
}

function Solid({ data, shown, colors }: { data: ParsedGcode; shown: number; colors: ThemeColors }) {
    const built = useMemo(() => buildSolid(data), [data]);
    const painted = useRef(-1);
    useEffect(() => {
        const { mesh, geometry } = built;
        painted.current = -1;
        return () => {
            geometry.dispose();
            mesh.dispose();
        };
    }, [built]);
    useLayoutEffect(() => {
        const { mesh, ends } = built;
        if (!ends.length) return;
        const index = Math.min(Math.max(shown, 1), ends.length) - 1;
        const base = new Color(colors.muted);
        const top = new Color(colors.primary);
        const prev = painted.current;
        const from = prev < 0 ? 0 : Math.min(prev, index) > 0 ? ends[Math.min(prev, index) - 1] : 0;
        const to = ends[Math.max(prev < 0 ? index : prev, index)];
        const topStart = index > 0 ? ends[index - 1] : 0;
        for (let i = from; i < to; i++) mesh.setColorAt(i, i >= topStart ? top : base);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.count = ends[index];
        painted.current = index;
    }, [built, shown, colors]);

    return (
        <primitive object={built.mesh}>
            <meshStandardMaterial roughness={0.6} metalness={0.05} />
        </primitive>
    );
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
    pan,
    resetSignal,
}: {
    data: ParsedGcode;
    shown: number;
    mode: SceneMode;
    pan: boolean;
    resetSignal: number;
}) {
    const colors = useThemeColors();
    const span = Math.max(1, data.maxX - data.minX, data.maxY - data.minY);
    const height = data.layers.length ? data.layers[data.layers.length - 1].z : 1;
    const bed = Math.max(Math.ceil((span * 1.6) / 10) * 10, 40);
    const distance = Math.max(span, height) * 1.9 + 20;

    return (
        <Canvas
            dpr={[1, 2]}
            camera={{ position: [distance * 0.7, distance * 0.6, distance * 0.7], fov: 45, near: 0.1, far: 10000 }}
        >
            <ambientLight intensity={mode === 'solid' ? 0.9 : 1} />
            {mode === 'solid' && (
                <>
                    <directionalLight position={[distance, distance * 1.5, distance * 0.5]} intensity={1.6} />
                    <directionalLight position={[-distance, distance * 0.5, -distance]} intensity={0.5} />
                </>
            )}
            <Grid
                args={[bed, bed]}
                cellSize={10}
                cellThickness={0.6}
                cellColor={colors.border}
                sectionSize={50}
                sectionThickness={1}
                sectionColor={colors.muted}
                fadeDistance={distance * 4}
                fadeStrength={1}
            />
            {mode === 'solid' ? (
                <Solid data={data} shown={shown} colors={colors} />
            ) : (
                <Lines data={data} shown={shown} colors={colors} />
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
                maxPolarAngle={Math.PI / 2}
            />
            <ResetView signal={resetSignal} />
        </Canvas>
    );
}
