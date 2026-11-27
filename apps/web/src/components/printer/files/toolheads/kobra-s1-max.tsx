import { RoundedBox } from '@react-three/drei/core/RoundedBox';
import { useMemo } from 'react';
import { Shape } from 'three';
import type { ToolheadFeed } from '@/lib/toolhead-feed';
import { DARK, decal, Label, SILVER, type Vec2 } from './parts';
import { S1_ORANGE, S1_SHELL, S1Fan, S1Rig } from './s1-parts';

const S1_MAX_SLOTS: Vec2[] = [
    [9, 20],
    [16, 14.5],
    [16, 9],
    [16, 3.5],
    [16, -2],
    [16, -7.5],
    [8, -13],
    [11, -21],
    [11, -26],
    [11, -31],
    [6, -36],
];

export function KobraS1Max({ feed }: { feed: ToolheadFeed }) {
    const w = 48;
    const shellBottom = 10;
    const shellH = 76;
    const top = shellBottom + shellH;
    const front = 22;
    const back = front - 46;
    const ducts = useMemo(
        () =>
            [-1, 1].map((s) => {
                const shape = new Shape();
                const cx = s * 8;
                const [a0, a1] = s < 0 ? [Math.PI, Math.PI * 1.5] : [0, -Math.PI / 2];
                shape.absarc(cx, shellBottom, 8, a0, a1, s > 0);
                shape.absarc(cx, shellBottom, 3.5, a1, a0, s < 0);
                shape.closePath();
                return { s, shape };
            }),
        [],
    );
    return (
        <group>
            <S1Rig
                feed={feed}
                w={w}
                top={top}
                front={front}
                back={back}
                slots={S1_MAX_SLOTS}
                screws={[top - 6, shellBottom + 6]}
            />
            <RoundedBox
                args={[w, shellH, front - back]}
                radius={6}
                smoothness={4}
                position={[0, shellBottom + shellH / 2, (front + back) / 2]}
            >
                <meshStandardMaterial {...S1_SHELL} />
            </RoundedBox>
            <RoundedBox args={[7, 4, 7]} radius={1} smoothness={2} position={[0, shellBottom - 1.5, 0]}>
                <meshStandardMaterial {...SILVER} />
            </RoundedBox>
            {ducts.map(({ s, shape }) => (
                <group key={s} position={[0, 0, 6.5]}>
                    <mesh rotation={[0, Math.PI, 0]} scale={[-1, 1, 1]}>
                        <extrudeGeometry
                            args={[shape, { depth: 11, bevelThickness: 1, bevelSize: 0.8, bevelSegments: 3 }]}
                        />
                        <meshStandardMaterial {...S1_ORANGE} />
                    </mesh>
                    <mesh position={[s * 8 - s * 0.05, shellBottom - 5.75, -6.5]} rotation={[0, (-s * Math.PI) / 2, 0]}>
                        <planeGeometry args={[12, 4.5]} />
                        <meshStandardMaterial {...DARK} {...decal()} />
                    </mesh>
                </group>
            ))}
            <S1Fan position={[0, top - 0.39 * shellH, front]} r={12.5} speed={feed.fanSpeed} hubColor="#6b6e73" />
            <Label
                text="ANYCUBIC"
                color="#a3a6aa"
                height={6.4}
                weight={600}
                position={[0, top - 0.79 * shellH, front + 0.05]}
            />
        </group>
    );
}
