import { RoundedBox } from '@react-three/drei/core/RoundedBox';
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';
import type { ToolheadFeed } from '@/lib/toolhead-feed';
import { Blades, Cable, DARK, decal, Label, roundedRect, SILVER, Spin, Tip, Tube, type Vec2, type Vec3 } from './parts';

const GUNMETAL = { color: '#3e4146', roughness: 0.5, metalness: 0.25 };

const TINTED = {
    color: '#262a31',
    roughness: 0.05,
    metalness: 0.1,
    clearcoat: 1,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
};

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

export function Kobra3({ feed }: { feed: ToolheadFeed }) {
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
