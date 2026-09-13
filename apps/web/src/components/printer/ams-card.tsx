import type { PrinterLiveState } from '@kobralink/shared';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { rgbCss } from '@/lib/format';
import { cn } from '@/lib/utils';

const MODE_LABEL = { toolhead: 'Tête (buffer)', ace_direct: 'ACE direct', ace_hub: 'Tête + ACE (hub)' };

export function AmsCard({ state }: { state: PrinterLiveState }) {
    const slots = [...state.amsSlots].sort((a, b) => a.globalIndex - b.globalIndex);
    const loaded = slots.find((s) => s.globalIndex === state.amsLoadedSlot);
    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">Filaments</CardTitle>
                <CardDescription>{MODE_LABEL[state.filamentMode]}</CardDescription>
                <CardAction className="text-sm text-muted-foreground">
                    {loaded ? `${loaded.type || '?'} chargé` : 'Aucun chargé'}
                </CardAction>
            </CardHeader>
            <CardContent>
                {slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun slot détecté.</p>
                ) : (
                    <div className="flex flex-wrap gap-3">
                        {slots.map((s) => {
                            const isLoaded = s.globalIndex === state.amsLoadedSlot;
                            const empty = s.status !== 5;
                            return (
                                <div key={s.globalIndex} className="flex w-14 flex-col items-center gap-1.5">
                                    <div
                                        className={cn(
                                            'flex size-14 items-center justify-center rounded-full border-2 text-sm font-semibold',
                                            empty
                                                ? 'border-dashed border-muted-foreground/40 text-muted-foreground'
                                                : 'border-transparent',
                                            isLoaded && 'ring-4 ring-primary/40',
                                        )}
                                        style={
                                            empty ? undefined : { background: rgbCss(s.color), color: textOn(s.color) }
                                        }
                                        title={empty ? 'Vide' : s.type}
                                    >
                                        {s.index + 1}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground" title={s.type}>
                                        {empty ? 'Vide' : s.type || '?'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function textOn([r, g, b]: [number, number, number]): string {
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff';
}
