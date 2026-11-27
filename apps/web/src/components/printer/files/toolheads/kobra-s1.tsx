import { RoundedBox } from '@react-three/drei/core/RoundedBox';
import type { ToolheadFeed } from '@/lib/toolhead-feed';
import { DARK, decal, Label, type Vec2 } from './parts';
import { S1_ORANGE, S1_SHELL, S1Fan, S1Rig } from './s1-parts';

const S1_SLOTS: Vec2[] = [14, 14, 14, 14, 14, 10, 5].map((len, i) => [len, 17 - i * 5.8]);

export function KobraS1({ feed }: { feed: ToolheadFeed }) {
    const w = 46;
    const bottom = 7;
    const baseTop = bottom + 9;
    const shellH = 72;
    const top = baseTop + shellH;
    const front = 22;
    const back = front - 44;
    return (
        <group>
            <S1Rig
                feed={feed}
                w={w}
                top={top}
                front={front}
                back={back}
                slots={S1_SLOTS}
                screws={[top - 6, baseTop + 6]}
            />
            <RoundedBox
                args={[w, baseTop - bottom + 2, front - back - 4]}
                radius={2.5}
                smoothness={3}
                position={[0, (bottom + baseTop) / 2 + 1, (front + back + 4) / 2 - 0.3]}
            >
                <meshStandardMaterial {...S1_ORANGE} />
            </RoundedBox>
            <mesh position={[0, bottom + 1.6, front - 0.25]}>
                <planeGeometry args={[7, 3.2]} />
                <meshStandardMaterial {...DARK} {...decal()} />
            </mesh>
            <RoundedBox
                args={[w, shellH, front - back]}
                radius={5}
                smoothness={4}
                position={[0, baseTop + shellH / 2, (front + back) / 2]}
            >
                <meshStandardMaterial {...S1_SHELL} />
            </RoundedBox>
            <S1Fan position={[0, top - 0.53 * shellH, front]} r={12.4} speed={feed.fanSpeed} />
            <Label
                text="ANYCUBIC"
                color="#8d9094"
                height={6.4}
                weight={600}
                position={[0, top - 0.905 * shellH, front + 0.05]}
            />
        </group>
    );
}
