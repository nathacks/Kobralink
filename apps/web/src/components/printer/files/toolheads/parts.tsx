import { RoundedBox } from '@react-three/drei/core/RoundedBox';
import { useFrame } from '@react-three/fiber';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { BackSide, CanvasTexture, DataTexture, type Group, Shape, SRGBColorSpace } from 'three';

export const SHELL = { color: '#e9ebed', roughness: 0.5, metalness: 0.02 };
export const GREY = { color: '#808489', roughness: 0.6, metalness: 0.05 };
export const LIGHT_GREY = { color: '#b4b7bb', roughness: 0.55, metalness: 0.05 };
export const DARK = { color: '#16181b', roughness: 0.6, metalness: 0.1 };
const TUBE = { color: '#f4f6f8', roughness: 0.2, transparent: true, opacity: 0.35, depthWrite: false };
const FAN_TURNS_PER_SEC = 5;
export const FEED_LENGTH = 70;
const FEED_SOLID = 0.25;

function fadeTexture(): DataTexture {
    const rows = 64;
    const data = new Uint8Array(rows * 4);
    for (let i = 0; i < rows; i++) {
        const t = Math.max(0, (i / (rows - 1) - FEED_SOLID) / (1 - FEED_SOLID));
        const a = Math.round(255 * (1 - t) ** 2);
        data.set([a, a, a, 255], i * 4);
    }
    const texture = new DataTexture(data, 1, rows);
    texture.needsUpdate = true;
    return texture;
}

const FADE = fadeTexture();
export const FADING = { transparent: true, depthWrite: false, alphaMap: FADE };
export const LOGO_GREY = '#8f9397';

export function decal(layer = 1) {
    return { polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -4 * layer };
}

export type Vec3 = [number, number, number];

export function roundedRect(w: number, h: number, r: number): Shape {
    const x = -w / 2;
    const y = -h / 2;
    const s = new Shape();
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
}

export function offsets(count: number, step: number): number[] {
    return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
}

export function Label({
    text,
    color,
    height,
    position,
    rotation,
    weight = 700,
    italic = false,
    glow = false,
}: {
    text: string;
    color: string;
    height: number;
    position: Vec3;
    rotation?: Vec3;
    weight?: number;
    italic?: boolean;
    glow?: boolean;
}) {
    const { texture, aspect } = useMemo(() => {
        const px = 96;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const font = `${italic ? 'italic ' : ''}${weight} ${px * 0.8}px "Outfit Variable", system-ui, sans-serif`;
        ctx.font = font;
        canvas.width = Math.ceil(ctx.measureText(text).width + px * 0.2);
        canvas.height = px;
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, px / 2);
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 8;
        return { texture, aspect: canvas.width / px };
    }, [text, color, weight, italic]);
    useEffect(() => () => texture.dispose(), [texture]);
    return (
        <mesh position={position} rotation={rotation}>
            <planeGeometry args={[height * aspect, height]} />
            <meshStandardMaterial
                map={texture}
                transparent
                depthWrite={false}
                roughness={0.6}
                {...(glow ? { emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: 1.2 } : {})}
                {...decal(2)}
            />
        </mesh>
    );
}

export function Tip({ filament }: { filament: string | null }) {
    return (
        <group>
            <mesh position={[0, 1.6, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[2.2, 3.2, 24]} />
                <meshStandardMaterial color="#c9893c" metalness={0.85} roughness={0.25} />
            </mesh>
            {filament ? (
                <mesh position={[0, -0.2, 0]} scale={[1, 1.3, 1]}>
                    <sphereGeometry args={[0.8, 16, 16]} />
                    <meshStandardMaterial
                        color={filament}
                        emissive={filament}
                        emissiveIntensity={0.35}
                        roughness={0.3}
                    />
                </mesh>
            ) : (
                <mesh position={[0, 0.15, 0]}>
                    <sphereGeometry args={[0.45, 12, 12]} />
                    <meshStandardMaterial color="#ff7a1a" emissive="#ff5a00" emissiveIntensity={1.6} />
                </mesh>
            )}
        </group>
    );
}

export function Tube({ position, rotation, filament }: { position: Vec3; rotation?: Vec3; filament: string | null }) {
    return (
        <group position={position} rotation={rotation}>
            {filament && (
                <mesh position={[0, FEED_LENGTH / 2, 0]} renderOrder={1}>
                    <cylinderGeometry args={[1.1, 1.1, FEED_LENGTH, 12, 1, true]} />
                    <meshStandardMaterial color={filament} roughness={0.45} {...FADING} />
                </mesh>
            )}
            <mesh position={[0, FEED_LENGTH / 2, 0]} renderOrder={2}>
                <cylinderGeometry args={[2, 2, FEED_LENGTH, 16, 1, true]} />
                <meshStandardMaterial {...TUBE} {...FADING} />
            </mesh>
        </group>
    );
}

export function Spin({ speed, children }: { speed: number; children: ReactNode }) {
    const ref = useRef<Group>(null);
    useFrame((_, dt) => {
        if (ref.current) ref.current.rotation.z -= dt * FAN_TURNS_PER_SEC * 2 * Math.PI * (speed / 100);
    });
    return <group ref={ref}>{children}</group>;
}

export function Blades({
    count,
    from,
    to,
    width,
    z,
    color,
}: {
    count: number;
    from: number;
    to: number;
    width: number;
    z: number;
    color: string;
}) {
    const r = (from + to) / 2;
    return offsets(count, (2 * Math.PI) / count).map((a) => (
        <mesh key={a} position={[Math.cos(a) * r, Math.sin(a) * r, z]} rotation={[0, 0, a + Math.PI / 2 + 0.22]}>
            <planeGeometry args={[width, to - from]} />
            <meshStandardMaterial color={color} roughness={0.55} {...decal(2)} />
        </mesh>
    ));
}

export function HoleGrid({ x, y, z, cols, rows }: { x: number; y: number; z: number; cols: number; rows: number }) {
    return offsets(rows, 3.4).flatMap((dy, r) =>
        offsets(cols, 3.4).map((dz) => (
            <mesh
                key={`${dy}|${dz}`}
                position={[x, y + dy, z + dz + (r % 2 ? 1.7 : 0)]}
                rotation={[0, (Math.sign(x) * Math.PI) / 2, 0]}
            >
                <circleGeometry args={[0.9, 10]} />
                <meshStandardMaterial {...DARK} {...decal()} />
            </mesh>
        )),
    );
}

export function Slots({ x, y, z, count, height }: { x: number; y: number; z: number; count: number; height: number }) {
    return offsets(count, 3.2).map((dz) => (
        <RoundedBox key={dz} args={[0.8, height, 1.5]} radius={0.35} smoothness={2} position={[x, y, z + dz]}>
            <meshStandardMaterial {...DARK} />
        </RoundedBox>
    ));
}

export function Cable({ position }: { position: Vec3 }) {
    return (
        <group position={position}>
            <mesh position={[0, FEED_LENGTH / 2, 0]}>
                <cylinderGeometry args={[2.3, 2.3, FEED_LENGTH, 16, 1, true]} />
                <meshStandardMaterial color="#9a9ea3" roughness={0.6} {...FADING} />
            </mesh>
            {offsets(6, 2.2).map((dy) => (
                <mesh key={dy} position={[0, dy + 7, 0]}>
                    <cylinderGeometry args={[2.7, 2.7, 1, 16]} />
                    <meshStandardMaterial color="#8a8e93" roughness={0.6} />
                </mesh>
            ))}
        </group>
    );
}

export function BlowerFan({ position, speed, shell = SHELL }: { position: Vec3; speed: number; shell?: typeof SHELL }) {
    const depth = 7;
    const outer = 32;
    const inner = 23;
    return (
        <group position={position}>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, depth / 2]}>
                <cylinderGeometry args={[outer, outer, depth, 64, 1, true]} />
                <meshStandardMaterial {...shell} />
            </mesh>
            <mesh position={[0, 0, depth]}>
                <ringGeometry args={[inner, outer, 64]} />
                <meshStandardMaterial {...shell} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, depth - 1.5]}>
                <cylinderGeometry args={[inner, inner, 3, 64, 1, true]} />
                <meshStandardMaterial color={shell === SHELL ? '#cfd2d5' : '#3a3c40'} side={BackSide} />
            </mesh>
            <mesh position={[0, 0, depth - 3]}>
                <circleGeometry args={[inner, 64]} />
                <meshStandardMaterial color="#0b0c0e" roughness={0.7} />
            </mesh>
            <group position={[0, 0, depth - 2.95]}>
                <Spin speed={speed}>
                    <Blades count={26} from={11} to={22} width={1.3} z={0} color="#2d3035" />
                    <mesh>
                        <circleGeometry args={[10.5, 48]} />
                        <meshStandardMaterial color="#131417" roughness={0.4} {...decal(3)} />
                    </mesh>
                    <mesh position={[6, 0, 0]}>
                        <circleGeometry args={[0.8, 12]} />
                        <meshStandardMaterial color="#3a3d42" {...decal(4)} />
                    </mesh>
                </Spin>
            </group>
        </group>
    );
}

export const SILVER = { color: '#a9adb3', roughness: 0.35, metalness: 0.55 };

export type Vec2 = [number, number];
