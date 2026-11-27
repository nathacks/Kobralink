import { RoundedBox } from '@react-three/drei/core/RoundedBox';
import type { ToolheadFeed } from '@/lib/toolhead-feed';
import {
    Blades,
    Cable,
    DARK,
    decal,
    HoleGrid,
    Label,
    LOGO_GREY,
    roundedRect,
    SHELL,
    Slots,
    Spin,
    Tip,
    Tube,
} from './parts';

const KOBRA_X_WINDOW = roundedRect(39, 47, 4);

const KOBRA_X_INLETS: [number, number][] = [
    [-4.6, 4.6],
    [4.6, 4.6],
    [-4.6, -4.6],
    [4.6, -4.6],
];

export function KobraX({ feed }: { feed: ToolheadFeed }) {
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
