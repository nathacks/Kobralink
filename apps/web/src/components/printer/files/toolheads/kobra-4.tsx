import { RoundedBox } from '@react-three/drei/core/RoundedBox';
import type { ToolheadFeed } from '@/lib/toolhead-feed';
import {
    Blades,
    BlowerFan,
    DARK,
    decal,
    FADING,
    FEED_LENGTH,
    GREY,
    Label,
    LIGHT_GREY,
    LOGO_GREY,
    offsets,
    SHELL,
    Slots,
    Spin,
    Tip,
    Tube,
    type Vec3,
} from './parts';

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

export function Kobra4({ feed }: { feed: ToolheadFeed }) {
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
