import { Grid, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { ParsedGcode } from '@/lib/gcode-parser.worker';

type ThemeColors = { primary: string; muted: string; border: string };

function cssColor(name: string, fallback: string) {
    const el = document.createElement('div');
    el.style.color = `var(${name})`;
    el.style.position = 'absolute';
    el.style.opacity = '0';
    document.body.appendChild(el);
    const value = getComputedStyle(el).color;
    el.remove();
    return value || fallback;
}

function readColors(): ThemeColors {
    return {
        primary: cssColor('--primary', '#10b981'),
        muted: cssColor('--muted-foreground', '#888888'),
        border: cssColor('--border', '#444444'),
    };
}

function useThemeColors() {
    const [colors, setColors] = useState(readColors);
    useEffect(() => {
        const observer = new MutationObserver(() => setColors(readColors()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
        return () => observer.disconnect();
    }, []);
    return colors;
}

function build(data: ParsedGcode) {
    const { layers, minX, maxX, minY, maxY } = data;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let points = 0;
    for (const l of layers) points += l.segs.length / 2;
    const positions = new Float32Array(points * 3);
    const ends: number[] = [];
    let o = 0;
    for (const l of layers) {
        const s = l.segs;
        for (let k = 0; k < s.length; k += 4) {
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

function Model({ data, shown, colors }: { data: ParsedGcode; shown: number; colors: ThemeColors }) {
    const built = useMemo(() => build(data), [data]);
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

export function GcodeScene({ data, shown, resetSignal }: { data: ParsedGcode; shown: number; resetSignal: number }) {
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
            <ambientLight intensity={1} />
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
            <Model data={data} shown={shown} colors={colors} />
            <OrbitControls
                makeDefault
                target={[0, height / 2, 0]}
                enableDamping
                dampingFactor={0.12}
                minDistance={5}
                maxDistance={distance * 6}
                maxPolarAngle={Math.PI / 2}
            />
            <ResetView signal={resetSignal} />
        </Canvas>
    );
}
