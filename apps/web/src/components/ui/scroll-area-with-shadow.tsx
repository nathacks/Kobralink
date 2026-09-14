'use client';

import { ComponentPropsWithoutRef, PropsWithChildren, Ref } from 'react';
import { cn } from '@/lib/utils.ts';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';

type ScrollAreaProps = ComponentPropsWithoutRef<typeof ScrollArea>;

interface ScrollAreaWithShadowProps extends Omit<ScrollAreaProps, 'ref' | 'viewportRef'> {
    bottomShadow?: boolean;
    orientation?: 'vertical' | 'horizontal' | 'both';
    ref?: Ref<HTMLDivElement>;
}

const FADE_SIZE = 'scroll-fade-5';

export function ScrollAreaWithShadow({
                                         children,
                                         bottomShadow = false,
                                         orientation = 'vertical',
                                         className,
                                         viewportClassName,
                                         ref,
                                         ...props
                                     }: PropsWithChildren<ScrollAreaWithShadowProps>) {
    if (orientation === 'horizontal') {
        return (
            <div className="relative min-w-0 overflow-hidden">
                <div ref={ref} className={cn('scroll-fade-x overflow-x-auto', FADE_SIZE, className)}>
                    {children}
                </div>
            </div>
        );
    }

    const fadeClassName =
        orientation === 'both' ? 'scroll-fade-xy' : cn('scroll-fade', !bottomShadow && 'scroll-fade-b-0');

    return (
        <div className="relative flex-1 overflow-hidden">
            <ScrollArea
                className={className}
                viewportClassName={cn(fadeClassName, FADE_SIZE, viewportClassName)}
                viewportRef={ref}
                scrollbarX={orientation === 'both'}
                {...props}
            >
                {children}
            </ScrollArea>
        </div>
    );
}
