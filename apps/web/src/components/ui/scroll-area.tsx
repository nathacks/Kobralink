'use client';

import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';

interface ScrollAreaProps extends React.ComponentProps<typeof ScrollAreaPrimitive.Root> {
    thumbColor?: string;
    trackColor?: string;
    viewportClassName?: string;
    viewportRef?: React.Ref<HTMLDivElement>;
    scrollbarX?: boolean;
}

function ScrollArea({
                        className,
                        children,
                        thumbColor,
                        trackColor,
                        viewportClassName,
                        viewportRef,
                        scrollbarX,
                        ...props
                    }: ScrollAreaProps) {
    return (
        <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn('relative', className)} {...props}>
            <ScrollAreaPrimitive.Viewport
                ref={viewportRef}
                data-slot="scroll-area-viewport"
                className={cn(
                    'size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    viewportClassName,
                )}
            >
                {children}
            </ScrollAreaPrimitive.Viewport>
            <ScrollBar thumbColor={thumbColor} trackColor={trackColor}/>
            {scrollbarX && <ScrollBar orientation="horizontal" thumbColor={thumbColor} trackColor={trackColor}/>}
            <ScrollAreaPrimitive.Corner/>
        </ScrollAreaPrimitive.Root>
    );
}

interface ScrollBarProps extends React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> {
    thumbColor?: string;
    trackColor?: string;
    thumbHoverColor?: string;
}

function ScrollBar({ className, orientation = 'vertical', thumbColor, trackColor, ...props }: ScrollBarProps) {
    return (
        <ScrollAreaPrimitive.ScrollAreaScrollbar
            data-slot="scroll-area-scrollbar"
            orientation={orientation}
            className={cn(
                'flex touch-none select-none p-px transition-colors',
                orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
                orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
                trackColor,
                className,
            )}
            {...props}
        >
            <ScrollAreaPrimitive.ScrollAreaThumb
                data-slot="scroll-area-thumb"
                className={cn('relative flex-1 rounded-full bg-border hover:bg-accent', thumbColor)}
            />
        </ScrollAreaPrimitive.ScrollAreaScrollbar>
    );
}

export { ScrollArea, ScrollBar };
