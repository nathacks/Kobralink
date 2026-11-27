import { RoundedBox } from '@react-three/drei/core/RoundedBox';
import { useMemo } from 'react';
import type { ToolheadFeed } from '@/lib/toolhead-feed';
import { Blades, Cable, DARK, decal, roundedRect, SILVER, Spin, Tip, Tube, type Vec2, type Vec3 } from './parts';

export const S1_SHELL = { color: '#eef0f2', roughness: 0.5, metalness: 0.05 };
export const S1_ORANGE = { color: '#f0641e', roughness: 0.5, metalness: 0.05 };
const S1_METAL = { color: '#b7babe', roughness: 0.35, metalness: 0.5 };

export function S1Fan({
    position,
    r,
    speed,
    hubColor = '#1c1d20',
}: {
    position: Vec3;
    r: number;
    speed: number;
    hubColor?: string;
}) {
    const hub = r * 0.61;
    return (
        <group position={position}>
            <mesh position={[0, 0, 0.05]}>
                <ringGeometry args={[r, r + 1.2, 64]} />
                <meshStandardMaterial color="#c9ccd0" roughness={0.4} {...decal()} />
            </mesh>
            <mesh position={[0, 0, 0.05]}>
                <circleGeometry args={[r, 64]} />
                <meshStandardMaterial color="#141517" roughness={0.8} {...decal()} />
            </mesh>
            <group position={[0, 0, 0.1]}>
                <Spin speed={speed}>
                    <Blades count={28} from={hub} to={r - 0.4} width={0.8} z={0} color="#2e3034" />
                </Spin>
            </group>
            <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.3, 1]}>
                <sphereGeometry args={[hub, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color={hubColor} roughness={0.55} />
            </mesh>
            <mesh position={[0, 0, hub * 0.3]}>
                <circleGeometry args={[0.6, 16]} />
                <meshStandardMaterial color="#050506" {...decal()} />
            </mesh>
        </group>
    );
}

export function S1Rig({
    feed,
    w,
    top,
    front,
    back,
    slots,
    screws,
}: {
    feed: ToolheadFeed;
    w: number;
    top: number;
    front: number;
    back: number;
    slots: Vec2[];
    screws: number[];
}) {
    const side = w / 2 + 0.05;
    const notchZ = front - 37;
    const notch = useMemo(() => roundedRect(w - 14, 17, 3), [w]);
    return (
        <group>
            <group scale={1.3}>
                <Tip filament={feed.loaded} />
            </group>
            <RoundedBox args={[9, 4, 9]} radius={1} smoothness={2} position={[0, 5, 0]}>
                <meshStandardMaterial {...SILVER} />
            </RoundedBox>
            <mesh position={[0, top + 0.05, notchZ]} rotation={[-Math.PI / 2, 0, 0]}>
                <shapeGeometry args={[notch, 8]} />
                <meshStandardMaterial color="#1a1b1e" roughness={0.8} {...decal()} />
            </mesh>
            {[-1, 1].map((s) => (
                <group key={s} position={[s * side, top - 34, front - 15]} rotation={[0, (s * Math.PI) / 2, 0]}>
                    {slots.map(([len, dy]) => (
                        <RoundedBox
                            key={dy}
                            args={[len, 2.1, 0.6]}
                            radius={0.28}
                            smoothness={2}
                            position={[(s * (14 - len)) / 2, dy, 0]}
                            rotation={[0, 0, s * 0.65]}
                        >
                            <meshStandardMaterial {...DARK} />
                        </RoundedBox>
                    ))}
                    {screws.map((y) => (
                        <mesh key={y} position={[s * 25, y - (top - 34), 0.05]}>
                            <circleGeometry args={[1.4, 16]} />
                            <meshStandardMaterial {...DARK} {...decal()} />
                        </mesh>
                    ))}
                </group>
            ))}
            <RoundedBox args={[w - 6, 50, 12]} radius={2} smoothness={2} position={[0, top - 25, back - 6]}>
                <meshStandardMaterial color="#2a2c30" roughness={0.6} />
            </RoundedBox>
            <RoundedBox args={[34, 34, 7]} radius={1.5} smoothness={2} position={[0, top - 26, back - 15.5]}>
                <meshStandardMaterial color="#a4a7ab" roughness={0.35} metalness={0.6} />
            </RoundedBox>
            <mesh position={[0, top - 26, back - 19.1]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[5, 5, 1, 24]} />
                <meshStandardMaterial {...SILVER} />
            </mesh>
            <RoundedBox args={[8, 16, 9]} radius={1.5} smoothness={2} position={[2, top - 4, notchZ]}>
                <meshStandardMaterial {...S1_METAL} />
            </RoundedBox>
            <RoundedBox args={[8, 4.5, 18]} radius={1.5} smoothness={2} position={[2, top + 4, notchZ - 7]}>
                <meshStandardMaterial {...S1_METAL} />
            </RoundedBox>
            <Tube position={[-13, top - 10, notchZ - 1]} filament={feed.loaded} />
            <Cable position={[14, top - 10, notchZ - 2]} />
        </group>
    );
}
