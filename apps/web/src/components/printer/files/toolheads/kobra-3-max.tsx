import { RoundedBox } from '@react-three/drei/core/RoundedBox';
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';
import type { ToolheadFeed } from '@/lib/toolhead-feed';
import { BlowerFan, Cable, DARK, decal, Label, offsets, Tip, Tube } from './parts';

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

export function Kobra3Max({ feed }: { feed: ToolheadFeed }) {
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
