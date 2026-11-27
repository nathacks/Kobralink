import type { ToolheadFeed } from '@/lib/toolhead-feed';
import { Kobra3 } from './toolheads/kobra-3';
import { Kobra3Max } from './toolheads/kobra-3-max';
import { Kobra4 } from './toolheads/kobra-4';
import { KobraS1 } from './toolheads/kobra-s1';
import { KobraS1Max } from './toolheads/kobra-s1-max';
import { KobraX } from './toolheads/kobra-x';

export type ToolheadModel = 'kobra-x' | 'kobra-4' | 'kobra-3' | 'kobra-3-max' | 'kobra-s1' | 'kobra-s1-max';

const TOOLHEAD_BY_MODE_ID: Record<string, ToolheadModel> = {
    '20030': 'kobra-x',
    '20024': 'kobra-3',
    '20027': 'kobra-3',
    '20025': 'kobra-s1',
    '20026': 'kobra-3-max',
    '20029': 'kobra-s1-max',
};

export const TOOLHEAD_NAME: Record<ToolheadModel, string> = {
    'kobra-x': 'Kobra X',
    'kobra-4': 'Kobra 4',
    'kobra-3': 'Kobra 3',
    'kobra-3-max': 'Kobra 3 Max',
    'kobra-s1': 'Kobra S1',
    'kobra-s1-max': 'Kobra S1 Max',
};

export const TOOLHEAD_MODELS = Object.keys(TOOLHEAD_NAME) as ToolheadModel[];

export function toolheadFor(modeId: string | undefined): ToolheadModel {
    return (modeId && TOOLHEAD_BY_MODE_ID[modeId]) || 'kobra-4';
}

export function Toolhead({ model, feed }: { model: ToolheadModel; feed: ToolheadFeed }) {
    if (model === 'kobra-x') return <KobraX feed={feed} />;
    if (model === 'kobra-3') return <Kobra3 feed={feed} />;
    if (model === 'kobra-3-max') return <Kobra3Max feed={feed} />;
    if (model === 'kobra-s1') return <KobraS1 feed={feed} />;
    if (model === 'kobra-s1-max') return <KobraS1Max feed={feed} />;
    return <Kobra4 feed={feed} />;
}
