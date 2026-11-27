import { RoundedBox } from '@react-three/drei/core/RoundedBox';
import { useFrame } from '@react-three/fiber';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { BackSide, CanvasTexture, DataTexture, ExtrudeGeometry, type Group, Shape, SRGBColorSpace } from 'three';
import type { ToolheadFeed } from '@/lib/toolhead-feed';

export type ToolheadModel = 'kobra-x' | 'kobra-4' | 'kobra-3' | 'kobra-3-max' | 'kobra-s1';

const TOOLHEAD_BY_MODE_ID: Record<string, ToolheadModel> = {
    '20030': 'kobra-x',
    '20024': 'kobra-3',
    '20027': 'kobra-3',
    '20025': 'kobra-s1',
    '20026': 'kobra-3-max',
};

export const TOOLHEAD_WIDTH_MM: Record<ToolheadModel, number> = {
    'kobra-x': 48,
    'kobra-4': 73,
    'kobra-3': 60,
    'kobra-3-max': 54,
    'kobra-s1': 56,
};

export const TOOLHEAD_NAME: Record<ToolheadModel, string> = {
    'kobra-x': 'Kobra X',
    'kobra-4': 'Kobra 4',
    'kobra-3': 'Kobra 3',
    'kobra-3-max': 'Kobra 3 Max',
    'kobra-s1': 'Kobra S1',
};

export const TOOLHEAD_MODELS = Object.keys(TOOLHEAD_NAME) as ToolheadModel[];

export function toolheadFor(modeId: string | undefined): ToolheadModel {
    return (modeId && TOOLHEAD_BY_MODE_ID[modeId]) || 'kobra-4';
}

const SHELL = { color: '#e9ebed', roughness: 0.5, metalness: 0.02 };
const GREY = { color: '#808489', roughness: 0.6, metalness: 0.05 };
const LIGHT_GREY = { color: '#b4b7bb', roughness: 0.55, metalness: 0.05 };
const DARK = { color: '#16181b', roughness: 0.6, metalness: 0.1 };
const TUBE = { color: '#f4f6f8', roughness: 0.2, transparent: true, opacity: 0.35, depthWrite: false };
const FAN_TURNS_PER_SEC = 5;
const FEED_LENGTH = 70;
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
const FADING = { transparent: true, depthWrite: false, alphaMap: FADE };
const LOGO_GREY = '#8f9397';

function decal(layer = 1) {
    return { polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -4 * layer };
}

type Vec3 = [number, number, number];

function roundedRect(w: number, h: number, r: number): Shape {
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

const KOBRA_X_WINDOW = roundedRect(39, 47, 4);

const KOBRA_X_INLETS: [number, number][] = [
    [-4.6, 4.6],
    [4.6, 4.6],
    [-4.6, -4.6],
    [4.6, -4.6],
];

function offsets(count: number, step: number): number[] {
    return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
}

function Label({
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

function Tip({ filament }: { filament: string | null }) {
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

function Tube({ position, rotation, filament }: { position: Vec3; rotation?: Vec3; filament: string | null }) {
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

function Spin({ speed, children }: { speed: number; children: ReactNode }) {
    const ref = useRef<Group>(null);
    useFrame((_, dt) => {
        if (ref.current) ref.current.rotation.z -= dt * FAN_TURNS_PER_SEC * 2 * Math.PI * (speed / 100);
    });
    return <group ref={ref}>{children}</group>;
}

function Blades({
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

function HoleGrid({ x, y, z, cols, rows }: { x: number; y: number; z: number; cols: number; rows: number }) {
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

function Slots({ x, y, z, count, height }: { x: number; y: number; z: number; count: number; height: number }) {
    return offsets(count, 3.2).map((dz) => (
        <RoundedBox key={dz} args={[0.8, height, 1.5]} radius={0.35} smoothness={2} position={[x, y, z + dz]}>
            <meshStandardMaterial {...DARK} />
        </RoundedBox>
    ));
}

function Cable({ position }: { position: Vec3 }) {
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

function KobraX({ feed }: { feed: ToolheadFeed }) {
    const w = 48;
    const h = 97;
    const bottom = 3;
    const top = bottom + h;
    const front = 16;
    const mainDepth = 50;
    const back = front - mainDepth;
    const cz = front - mainDepth / 2;
    const side = w / 2 + 0.05;
    const windowY = top - 4.6 - 23.5;
    return (
        <group>
            <Tip filament={feed.loaded} />
            <RoundedBox args={[w, h, mainDepth]} radius={4} smoothness={4} position={[0, bottom + h / 2, cz]}>
                <meshStandardMaterial {...SHELL} />
            </RoundedBox>
            <RoundedBox args={[w, 43, 14]} radius={4} smoothness={4} position={[0, top - 21.5, back - 4]}>
                <meshStandardMaterial {...SHELL} />
            </RoundedBox>
            <RoundedBox args={[w, 15, 14]} radius={4} smoothness={4} position={[0, bottom + 7.5, back - 4]}>
                <meshStandardMaterial {...SHELL} />
            </RoundedBox>
            <mesh position={[0, bottom + 34, back - 0.4]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[w - 8, 38]} />
                <meshStandardMaterial color="#d3d6da" metalness={0.35} roughness={0.4} {...decal()} />
            </mesh>
            <mesh position={[0, windowY, front + 0.05]}>
                <shapeGeometry args={[KOBRA_X_WINDOW, 12]} />
                <meshPhysicalMaterial color="#050607" roughness={0.06} metalness={0.3} clearcoat={1} {...decal()} />
            </mesh>
            <Label text="ACE GEN2" color="#f3f3f3" height={6} italic position={[0, top - 16, front + 0.1]} />
            <Label
                text="Anycubic Color Engine"
                color="#cfd2d5"
                height={2.2}
                weight={400}
                position={[13, top - 40, front + 0.1]}
                rotation={[0, 0, Math.PI / 2]}
            />
            {feed.channel !== null && (
                <Label
                    text={String(feed.channel)}
                    color="#f5f5f5"
                    height={19}
                    weight={300}
                    italic
                    position={[-5.5, top - 36.6, front + 0.1]}
                />
            )}
            <Label text="ANYCUBIC" color={LOGO_GREY} height={5} position={[0, bottom + 10, front + 0.05]} />
            <RoundedBox args={[22, 16, 16]} radius={2} smoothness={3} position={[0, top + 6, cz]}>
                <meshStandardMaterial {...SHELL} />
            </RoundedBox>
            <Cable position={[-16, top, cz]} />
            <mesh position={[0, top + 7, cz + 8.05]}>
                <planeGeometry args={[4, 1.2]} />
                <meshStandardMaterial {...DARK} {...decal()} />
            </mesh>
            {KOBRA_X_INLETS.map(([dx, dz], i) => (
                <group key={`${dx}|${dz}`} position={[dx, top + 14, cz + dz]}>
                    <mesh>
                        <cylinderGeometry args={[3.2, 3.2, 3, 20]} />
                        <meshStandardMaterial color="#d8dbde" metalness={0.5} roughness={0.3} />
                    </mesh>
                    <Tube position={[0, 1.5, 0]} filament={feed.inlets[i] ?? null} />
                </group>
            ))}
            <RoundedBox args={[10, 2.5, 8]} radius={1} smoothness={2} position={[w / 2 + 4.5, bottom + 25, cz - 6]}>
                <meshStandardMaterial {...DARK} />
            </RoundedBox>
            {[-1, 1].map((s) => (
                <HoleGrid key={s} x={s * side} y={top - 22} z={back + 1} cols={7} rows={8} />
            ))}
            <Slots x={side} y={bottom + 40} z={cz + 10} count={5} height={14} />
            <group position={[-side, bottom + 34, cz + 6]} rotation={[0, -Math.PI / 2, 0]}>
                <mesh>
                    <circleGeometry args={[7, 32]} />
                    <meshStandardMaterial {...DARK} {...decal()} />
                </mesh>
                <Spin speed={feed.fanSpeed}>
                    <Blades count={7} from={2.6} to={6.6} width={1.6} z={0} color="#3a3d42" />
                    <mesh>
                        <circleGeometry args={[2.6, 24]} />
                        <meshStandardMaterial color="#3a3d42" {...decal(3)} />
                    </mesh>
                </Spin>
            </group>
        </group>
    );
}

function BlowerFan({ position, speed, shell = SHELL }: { position: Vec3; speed: number; shell?: typeof SHELL }) {
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

function Frustum({
    w,
    h,
    d,
    taper,
    position,
    material,
}: {
    w: number;
    h: number;
    d: number;
    taper: number;
    position: Vec3;
    material: typeof GREY;
}) {
    return (
        <group position={position} scale={[w / Math.SQRT2, h, d / Math.SQRT2]}>
            <mesh rotation={[0, Math.PI / 4, 0]}>
                <cylinderGeometry args={[1, taper, 1, 4]} />
                <meshStandardMaterial {...material} flatShading />
            </mesh>
        </group>
    );
}

function SideFan({ position, speed }: { position: Vec3; speed: number }) {
    return (
        <group position={position} rotation={[0, -Math.PI / 2, 0]}>
            <mesh>
                <circleGeometry args={[9, 40]} />
                <meshStandardMaterial {...LIGHT_GREY} {...decal()} />
            </mesh>
            <mesh>
                <ringGeometry args={[6.5, 7.3, 40]} />
                <meshStandardMaterial {...DARK} {...decal(2)} />
            </mesh>
            <Spin speed={speed}>
                <Blades count={7} from={3} to={6.4} width={1.4} z={0} color="#3a3d42" />
                <mesh>
                    <circleGeometry args={[3, 24]} />
                    <meshStandardMaterial {...DARK} {...decal(3)} />
                </mesh>
            </Spin>
        </group>
    );
}

function Kobra4({ feed }: { feed: ToolheadFeed }) {
    const w = 73;
    const bottom = 3;
    const top = bottom + 127;
    const front = 25;
    const depth = 80;
    const lowDepth = 52;
    const step = bottom + 61;
    const cowlTop = bottom + 47;
    const cowlDepth = 24;
    const cowlBottom = bottom + 24;
    const greyW = w * 0.92;
    const upperZ = front - depth / 2;
    const lowZ = front - lowDepth / 2;
    const back = front - depth;
    const side = w / 2 + 0.05;
    return (
        <group>
            <Tip filament={feed.loaded} />
            <RoundedBox
                args={[w, top - cowlTop, lowDepth]}
                radius={6}
                smoothness={4}
                position={[0, (top + cowlTop) / 2, lowZ]}
            >
                <meshStandardMaterial {...SHELL} />
            </RoundedBox>
            <RoundedBox
                args={[greyW - 1, cowlTop - cowlBottom + 4, lowDepth - cowlDepth]}
                radius={4}
                smoothness={4}
                position={[0, (cowlTop + cowlBottom) / 2 + 1, lowZ - cowlDepth / 2]}
            >
                <meshStandardMaterial {...SHELL} />
            </RoundedBox>
            <RoundedBox
                args={[w, top - step, depth - lowDepth + 8]}
                radius={6}
                smoothness={4}
                position={[0, (top + step) / 2, back + (depth - lowDepth + 8) / 2]}
            >
                <meshStandardMaterial {...SHELL} />
            </RoundedBox>
            <Frustum
                w={greyW}
                h={cowlBottom - bottom}
                d={lowDepth - cowlDepth + 4}
                taper={0.82}
                position={[0, (cowlBottom + bottom) / 2, front - cowlDepth - (lowDepth - cowlDepth) / 2 + 2]}
                material={GREY}
            />
            <Frustum
                w={greyW}
                h={cowlTop - bottom}
                d={cowlDepth}
                taper={0.86}
                position={[0, (cowlTop + bottom) / 2, front + 0.3 - cowlDepth / 2]}
                material={GREY}
            />
            <BlowerFan position={[0, top - 51, front]} speed={feed.fanSpeed} />
            <Label text="ANYCUBIC" color={LOGO_GREY} height={7} position={[0, top - 13.5, front + 0.05]} />
            <SideFan position={[-side, cowlTop + 8, front - 12]} speed={feed.fanSpeed} />
            <Slots x={-side} y={top - 15} z={back + 14} count={7} height={7} />
            <RoundedBox args={[26, 12, 18]} radius={2.5} smoothness={3} position={[4, top + 5, upperZ]}>
                <meshStandardMaterial color="#e2e5e8" roughness={0.45} />
            </RoundedBox>
            <Tube position={[4, top + 10, upperZ]} filament={feed.loaded} />
            <mesh position={[-9, top + 3 + FEED_LENGTH / 2, upperZ - 2]}>
                <cylinderGeometry args={[3, 3, FEED_LENGTH, 16, 1, true]} />
                <meshStandardMaterial color="#8d9196" roughness={0.6} {...FADING} />
            </mesh>
            <Slots x={side} y={top - 15} z={back + 14} count={7} height={7} />
            <mesh position={[side, bottom + 70, front - 42]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[14, 10]} />
                <meshStandardMaterial {...DARK} {...decal()} />
            </mesh>
            <RoundedBox args={[18, 6, 16]} radius={2} smoothness={2} position={[side + 8, bottom + 82, back + 18]}>
                <meshStandardMaterial {...GREY} />
            </RoundedBox>
            <RoundedBox args={[6, 13, 16]} radius={2} smoothness={2} position={[side + 15, bottom + 76, back + 18]}>
                <meshStandardMaterial {...GREY} />
            </RoundedBox>
            {offsets(7, 3.6).map((dz) => (
                <RoundedBox
                    key={dz}
                    args={[0.8, 15, 1.4]}
                    radius={0.35}
                    smoothness={2}
                    position={[side, bottom + 40, front - 38 + dz]}
                    rotation={[-0.55, 0, 0]}
                >
                    <meshStandardMaterial {...DARK} />
                </RoundedBox>
            ))}
        </group>
    );
}

const GUNMETAL = { color: '#3e4146', roughness: 0.5, metalness: 0.25 };
const SILVER = { color: '#a9adb3', roughness: 0.35, metalness: 0.55 };
const TINTED = {
    color: '#262a31',
    roughness: 0.05,
    metalness: 0.1,
    clearcoat: 1,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
};

type Vec2 = [number, number];

function hexagon(r: number): Shape {
    const s = new Shape();
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 2 - (i * Math.PI) / 3;
        if (i === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a));
        else s.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    s.closePath();
    return s;
}

function faceSlots(origin: Vec2, along: Vec2, across: Vec2, count: number, key: string) {
    const len = Math.hypot(...along) * 0.8;
    const angle = Math.atan2(along[1], along[0]);
    return Array.from({ length: count }, (_, i) => {
        const t = (i + 0.75) / (count + 0.5);
        const x = origin[0] + along[0] / 2 + across[0] * t;
        const y = origin[1] + along[1] / 2 + across[1] * t;
        return (
            <mesh key={`${key}${t}`} position={[x, y, 0]} rotation={[0, 0, angle]}>
                <planeGeometry args={[len, 1.1]} />
                <meshStandardMaterial {...DARK} {...decal()} />
            </mesh>
        );
    });
}

function VentCube({ position, r }: { position: Vec3; r: number }) {
    const plate = useMemo(() => hexagon(r + 1.5), [r]);
    const v = (deg: number): Vec2 => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
    const o: Vec2 = [0, 0];
    return (
        <group position={position} rotation={[0, Math.PI / 2, 0]}>
            <mesh>
                <extrudeGeometry args={[plate, { depth: 2, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 }]} />
                <meshStandardMaterial {...GUNMETAL} />
            </mesh>
            <group position={[0, 0, 2.65]}>
                {faceSlots(o, v(30), v(150), 4, 't')}
                {faceSlots(o, v(150), v(-90), 5, 'l')}
                {faceSlots(o, v(-90), v(30), 5, 'r')}
            </group>
        </group>
    );
}

function chamferedPlan(halfW: number, halfD: number, chamfer: number): Shape {
    const s = new Shape();
    s.moveTo(-halfW, halfD);
    s.lineTo(halfW, halfD);
    s.lineTo(halfW, -halfD + chamfer);
    s.lineTo(halfW - chamfer, -halfD);
    s.lineTo(-halfW + chamfer, -halfD);
    s.lineTo(-halfW, -halfD + chamfer);
    s.closePath();
    return s;
}

function Kobra3({ feed }: { feed: ToolheadFeed }) {
    const w = 60;
    const h = 100;
    const depth = 62;
    const bottom = 8;
    const top = bottom + h;
    const front = 26;
    const cz = front - depth / 2;
    const bevel = 2.5;
    const chamfer = 10;
    const bandTop = bottom + 16;
    const coverH = top - 3 - bandTop;
    const coverY = bandTop + coverH / 2;
    const faceW = w - 2 * chamfer;
    const facetW = chamfer * Math.SQRT2;
    const facetH = top - 2 - (bottom + 2);
    const body = useMemo(
        () =>
            new ExtrudeGeometry(chamferedPlan(w / 2 - bevel, depth / 2 - bevel, chamfer - 1), {
                depth: h - 2 * bevel,
                bevelThickness: bevel,
                bevelSize: bevel,
                bevelSegments: 3,
                curveSegments: 4,
            }),
        [],
    );
    const slot = useMemo(() => roundedRect(14, 8, 3.9), []);
    useEffect(() => () => body.dispose(), [body]);
    return (
        <group>
            <group scale={1.3}>
                <Tip filament={feed.loaded} />
            </group>
            <RoundedBox args={[12, 4.5, 12]} radius={1.5} smoothness={3} position={[0, 6.3, 0]}>
                <meshStandardMaterial color="#141517" roughness={0.85} />
            </RoundedBox>
            <mesh geometry={body} position={[0, bottom + bevel, cz]} rotation={[-Math.PI / 2, 0, 0]}>
                <meshStandardMaterial {...GUNMETAL} />
            </mesh>
            {[-1, 1].map((side) => (
                <group
                    key={side}
                    position={[side * (w / 2 - chamfer / 2), bottom + 2 + facetH / 2, front - chamfer / 2]}
                    rotation={[0, (side * Math.PI) / 4, 0]}
                >
                    <mesh position={[0, 0, 0.05]}>
                        <planeGeometry args={[facetW, facetH]} />
                        <meshStandardMaterial {...SILVER} {...decal()} />
                    </mesh>
                    <mesh position={[-side * (facetW / 2 - 3.5), coverY - (bottom + 2 + facetH / 2), 0.1]}>
                        <planeGeometry args={[2, coverH * 0.7]} />
                        <meshStandardMaterial {...DARK} {...decal(2)} />
                    </mesh>
                </group>
            ))}
            <mesh position={[0, coverY, front + 0.05]}>
                <planeGeometry args={[faceW, coverH]} />
                <meshStandardMaterial color="#0c0d0f" roughness={0.8} {...decal()} />
            </mesh>
            <group position={[0, coverY + 4, front + 0.1]}>
                <mesh>
                    <ringGeometry args={[15, 16.5, 48]} />
                    <meshStandardMaterial color="#2a2d32" {...decal(2)} />
                </mesh>
                <Spin speed={feed.fanSpeed}>
                    <Blades count={9} from={5} to={14.5} width={3} z={0} color="#3d4046" />
                    <mesh>
                        <circleGeometry args={[5, 32]} />
                        <meshStandardMaterial color="#2a2d32" {...decal(3)} />
                    </mesh>
                </Spin>
            </group>
            <mesh position={[0, coverY, front + 1.2]}>
                <planeGeometry args={[faceW + 1, coverH]} />
                <meshPhysicalMaterial {...TINTED} />
            </mesh>
            <Label text="ANYCUBIC" color="#f4f6f8" height={5.5} glow position={[0, bottom + 8.5, front + 0.05]} />
            <VentCube position={[w / 2 - 0.6, bottom + h / 2, front - 24]} r={12} />
            <mesh position={[-w / 2 - 0.05, bottom + 62, cz + 10]} rotation={[0, -Math.PI / 2, 0]}>
                <shapeGeometry args={[slot, 8]} />
                <meshStandardMaterial {...DARK} {...decal()} />
            </mesh>
            <RoundedBox args={[3, 4, 9]} radius={1} smoothness={2} position={[-w / 2 - 1, bottom + 62, cz + 10]}>
                <meshStandardMaterial color="#5a5d63" roughness={0.5} />
            </RoundedBox>
            <RoundedBox args={[14, 34, 12]} radius={1.5} smoothness={3} position={[-2, top + 15, cz - 4]}>
                <meshStandardMaterial color="#55585e" roughness={0.55} metalness={0.15} />
            </RoundedBox>
            {[-5, 1].map((dx) => (
                <mesh key={dx} position={[dx, top + 3.5, cz + 2.05]}>
                    <circleGeometry args={[1.2, 16]} />
                    <meshStandardMaterial {...DARK} {...decal()} />
                </mesh>
            ))}
            <mesh position={[-2, top + 28, cz + 2.05]}>
                <planeGeometry args={[6, 1.2]} />
                <meshStandardMaterial {...DARK} {...decal()} />
            </mesh>
            <mesh position={[-2, top + 33, cz - 4]}>
                <cylinderGeometry args={[2.8, 2.8, 3, 20]} />
                <meshStandardMaterial color="#f08a24" roughness={0.45} />
            </mesh>
            <Tube position={[-2, top + 34.5, cz - 4]} filament={feed.loaded} />
            <RoundedBox args={[11, 6, 10]} radius={1.5} smoothness={2} position={[14, top + 3, cz - 6]}>
                <meshStandardMaterial {...DARK} />
            </RoundedBox>
            <Cable position={[17, top + 6, cz - 15]} />
        </group>
    );
}

const K3MAX_GREY = { color: '#4b4e53', roughness: 0.7, metalness: 0.08 };

function trapezoidPrism(bottomW: number, topW: number, height: number, depth: number, bevel: number) {
    const shape = new Shape();
    shape.moveTo(-bottomW / 2, 0);
    shape.lineTo(bottomW / 2, 0);
    shape.lineTo(topW / 2, height);
    shape.lineTo(-topW / 2, height);
    shape.closePath();
    return new ExtrudeGeometry(shape, {
        depth: depth - 2 * bevel,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 4,
    });
}

function Kobra3Max({ feed }: { feed: ToolheadFeed }) {
    const w = 54;
    const h = 97;
    const depth = 58;
    const bottom = 7;
    const top = bottom + h;
    const cowlTop = bottom + 32;
    const front = 22;
    const cz = front - depth / 2;
    const side = w / 2 + 0.05;
    const fanScale = 0.5;
    const body = useMemo(() => trapezoidPrism(48, 48, 64, 58, 3), []);
    const cowl = useMemo(() => trapezoidPrism(31, 49, 36, 52, 2), []);
    useEffect(
        () => () => {
            body.dispose();
            cowl.dispose();
        },
        [body, cowl],
    );
    return (
        <group>
            <group scale={1.3}>
                <Tip filament={feed.loaded} />
            </group>
            <RoundedBox args={[12, 5, 12]} radius={1.5} smoothness={3} position={[0, 6, 0]}>
                <meshStandardMaterial color="#6d6f73" roughness={0.4} metalness={0.6} />
            </RoundedBox>
            <mesh geometry={body} position={[0, cowlTop - 2, front - depth + 3]}>
                <meshStandardMaterial {...K3MAX_GREY} />
            </mesh>
            <group position={[0, cowlTop + 4, front]} rotation={[0.16, 0, 0]}>
                <mesh geometry={cowl} position={[0, -36, -50]}>
                    <meshStandardMaterial {...K3MAX_GREY} />
                </mesh>
            </group>
            <group scale={fanScale}>
                <BlowerFan
                    position={[0, (top - 0.42 * h) / fanScale, (front + 0.5) / fanScale]}
                    speed={feed.fanSpeed}
                    shell={{ color: '#1f2023', roughness: 0.6, metalness: 0.1 }}
                />
            </group>
            <Label text="ANYCUBIC" color="#d2d5d9" height={6.2} position={[0, top - 9, front + 0.55]} />
            <group position={[side, cowlTop + 6, front - 12]} rotation={[0, Math.PI / 2, 0]}>
                {offsets(6, 3.4).flatMap((dy) =>
                    offsets(4, 3.4).map((dx) => (
                        <RoundedBox
                            key={`${dx}|${dy}`}
                            args={[1.2, 2.9, 0.4]}
                            radius={0.18}
                            smoothness={2}
                            position={[dx, dy, 0]}
                            rotation={[0, 0, -0.75]}
                        >
                            <meshStandardMaterial {...DARK} {...decal()} />
                        </RoundedBox>
                    )),
                )}
            </group>
            <RoundedBox args={[20, 12, 16]} radius={2} smoothness={3} position={[2, top + 5, cz]}>
                <meshStandardMaterial {...DARK} />
            </RoundedBox>
            <mesh position={[2, top + 12.5, cz]}>
                <cylinderGeometry args={[2.8, 2.8, 3, 20]} />
                <meshStandardMaterial color="#f08a24" roughness={0.45} />
            </mesh>
            <Tube position={[2, top + 14, cz]} filament={feed.loaded} />
            <RoundedBox
                args={[5, 14, 6]}
                radius={1.5}
                smoothness={2}
                position={[-11, top + 6, cz + 6]}
                rotation={[0, 0, 0.45]}
            >
                <meshStandardMaterial {...DARK} />
            </RoundedBox>
            <Cable position={[-17, top, cz - 14]} />
        </group>
    );
}

const S1_SHELL = { color: '#eceef0', roughness: 0.4, metalness: 0.2 };
const S1_ORANGE = { color: '#e5582d', roughness: 0.5, metalness: 0.05 };

function KobraS1({ feed }: { feed: ToolheadFeed }) {
    const w = 56;
    const depth = 50;
    const bottom = 7;
    const baseTop = bottom + 10;
    const top = baseTop + 63;
    const front = 22;
    const back = front - depth;
    const cz = front - depth / 2;
    const side = w / 2 + 0.05;
    const fanY = top - 24.6;
    const slot = useMemo(() => roundedRect(5.5, 1.7, 0.8), []);
    return (
        <group>
            <group scale={1.3}>
                <Tip filament={feed.loaded} />
            </group>
            <RoundedBox args={[11, 4, 11]} radius={1} smoothness={2} position={[0, 5.5, 0]}>
                <meshStandardMaterial {...SILVER} />
            </RoundedBox>
            <RoundedBox
                args={[w - 1, baseTop - bottom, depth - 1]}
                radius={3}
                smoothness={3}
                position={[0, (bottom + baseTop) / 2, cz]}
            >
                <meshStandardMaterial {...S1_ORANGE} />
            </RoundedBox>
            <RoundedBox
                args={[w, top - baseTop + 1, depth]}
                radius={7}
                smoothness={4}
                position={[0, (top + baseTop - 1) / 2, cz]}
            >
                <meshStandardMaterial {...S1_SHELL} />
            </RoundedBox>
            <group position={[0, fanY, front]}>
                <mesh position={[0, 0, 0.05]}>
                    <ringGeometry args={[12.4, 15, 64]} />
                    <meshStandardMaterial color="#f2f3f5" roughness={0.35} metalness={0.2} {...decal()} />
                </mesh>
                <mesh position={[0, 0, 0.05]}>
                    <circleGeometry args={[12.4, 64]} />
                    <meshStandardMaterial color="#141517" roughness={0.8} {...decal()} />
                </mesh>
                <mesh position={[0, 0, 0.05]}>
                    <ringGeometry args={[11.2, 12.4, 64]} />
                    <meshStandardMaterial color="#2c2e31" roughness={0.7} {...decal(2)} />
                </mesh>
                <group position={[0, 0, 0.1]}>
                    <Spin speed={feed.fanSpeed}>
                        <Blades count={24} from={9} to={11.2} width={0.7} z={0} color="#26282b" />
                    </Spin>
                </group>
                <mesh scale={[1, 1, 0.35]}>
                    <sphereGeometry args={[9, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    <meshStandardMaterial color="#1c1d20" roughness={0.55} />
                </mesh>
                <mesh position={[0, 0, 3.2]}>
                    <circleGeometry args={[0.7, 16]} />
                    <meshStandardMaterial color="#050506" {...decal()} />
                </mesh>
            </group>
            <Label text="ANYCUBIC" color="#6a6c70" height={6.3} position={[0, baseTop + 7.4, front + 0.05]} />
            <group position={[side, top - 41, front - 15]} rotation={[0, Math.PI / 2, 0]}>
                {offsets(4, 4.6).flatMap((dy, r) =>
                    offsets(4, 4.4).map((dx) => (
                        <mesh key={`${dx}|${dy}`} position={[dx + r * 2.6 - 3.9, dy, 0]} rotation={[0, 0, 0.85]}>
                            <shapeGeometry args={[slot, 8]} />
                            <meshStandardMaterial {...DARK} {...decal()} />
                        </mesh>
                    )),
                )}
            </group>
            <RoundedBox args={[5, 18, 9]} radius={1.2} smoothness={2} position={[side + 2.5, top - 10, back + 12]}>
                <meshStandardMaterial color="#5c6066" roughness={0.4} metalness={0.5} />
            </RoundedBox>
            <RoundedBox args={[4, 6, 6]} radius={1.2} smoothness={2} position={[side + 6, top - 4, back + 12]}>
                <meshStandardMaterial {...DARK} />
            </RoundedBox>
            <RoundedBox args={[16, 6, 14]} radius={1.5} smoothness={2} position={[-6, top + 3, cz]}>
                <meshStandardMaterial {...S1_SHELL} />
            </RoundedBox>
            <Tube position={[-6, top + 6, cz]} filament={feed.loaded} />
            <Cable position={[14, top, cz - 10]} />
        </group>
    );
}

export function Toolhead({ model, feed }: { model: ToolheadModel; feed: ToolheadFeed }) {
    if (model === 'kobra-x') return <KobraX feed={feed} />;
    if (model === 'kobra-3') return <Kobra3 feed={feed} />;
    if (model === 'kobra-3-max') return <Kobra3Max feed={feed} />;
    if (model === 'kobra-s1') return <KobraS1 feed={feed} />;
    return <Kobra4 feed={feed} />;
}
