import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Home, Power } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useLiveState } from '@/stores/printers';

const AXIS = { Y: 1, X: 2, Z: 3, ALL: 4 } as const;
const DISTANCES = [1, 10, 50];

export function AxesCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const locked = !state.connected || state.printState === 'printing';
    const [distance, setDistance] = useState(10);
    const onError = (e: Error) => toast.error(e.message);
    const axisMut = useMutation({
        mutationFn: (input: { axis: number; moveType: number; distance: number }) => api.control.axis(printerId, input),
        onError,
    });
    const offMut = useMutation({ mutationFn: () => api.control.axisOff(printerId), onError });
    const jog = (axis: number, moveType: number) => axisMut.mutate({ axis, moveType, distance });

    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">{m.axes_title()}</CardTitle>
                <CardAction className="flex gap-1 rounded-full bg-secondary p-1">
                    {DISTANCES.map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setDistance(d)}
                            className={cn(
                                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                                distance === d
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {d} mm
                        </button>
                    ))}
                </CardAction>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
                <div className="flex flex-1 flex-wrap items-center justify-center gap-8">
                    <div className="grid grid-cols-3 gap-2">
                        <span />
                        <Jog onClick={() => jog(AXIS.Y, 1)} disabled={locked} title="Y+">
                            <ArrowUp />
                        </Jog>
                        <span />
                        <Jog onClick={() => jog(AXIS.X, 0)} disabled={locked} title="X-">
                            <ArrowLeft />
                        </Jog>
                        <Jog onClick={() => jog(AXIS.ALL, 2)} disabled={locked} title={m.axes_home()} primary>
                            <Home />
                        </Jog>
                        <Jog onClick={() => jog(AXIS.X, 1)} disabled={locked} title="X+">
                            <ArrowRight />
                        </Jog>
                        <span />
                        <Jog onClick={() => jog(AXIS.Y, 0)} disabled={locked} title="Y-">
                            <ArrowDown />
                        </Jog>
                        <span />
                    </div>
                    <div className="grid gap-2">
                        <Jog onClick={() => jog(AXIS.Z, 1)} disabled={locked} title="Z+">
                            <ArrowUp />
                        </Jog>
                        <span className="text-center text-xs text-muted-foreground">Z</span>
                        <Jog onClick={() => jog(AXIS.Z, 0)} disabled={locked} title="Z-">
                            <ArrowDown />
                        </Jog>
                    </div>
                </div>
                <Button
                    variant="secondary"
                    className="self-end rounded-full"
                    disabled={locked}
                    onClick={() => offMut.mutate()}
                >
                    <Power /> {m.axes_motors_off()}
                </Button>
            </CardContent>
        </Card>
    );
}

function Jog({ primary, className, ...props }: React.ComponentProps<'button'> & { primary?: boolean }) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                'flex size-12 items-center justify-center rounded-full transition-colors disabled:opacity-40 [&_svg]:size-5',
                primary
                    ? 'bg-primary text-primary-foreground hover:opacity-90'
                    : 'bg-secondary text-foreground hover:bg-accent',
                className,
            )}
        />
    );
}
