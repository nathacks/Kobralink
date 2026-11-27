import { motion, useReducedMotion } from 'motion/react';
import { createContext, type ReactNode, useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollAreaWithShadow } from '@/components/ui/scroll-area-with-shadow';
import { useConfirmationDialog } from '@/hooks/use-confirmation-dialog';
import { cn } from '@/lib/utils';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

const FooterSlot = createContext<HTMLElement | null>(null);

export function DialogFooterPortal({ children }: { children: ReactNode }) {
    const slot = useContext(FooterSlot);
    return slot ? createPortal(children, slot) : children;
}

function AutoHeight({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number | 'auto'>('auto');
    const reduced = useReducedMotion();

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <motion.div
            initial={false}
            animate={{ height }}
            transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
        >
            <div ref={ref}>{children}</div>
        </motion.div>
    );
}

export function ConfirmationDialog() {
    const { isOpen, title, description, content, closeOnBackground, props } = useConfirmationDialog();
    const [footer, setFooter] = useState<HTMLElement | null>(null);
    const { closeDialog } = confirmationDialogStore.actions;
    const hasHeader = Boolean(title || description);

    return (
        <Dialog open={isOpen} onOpenChange={closeDialog}>
            <DialogContent
                {...props}
                className={cn(
                    'max-h-[92svh] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-3xl px-0',
                    hasHeader ? 'grid-rows-[auto_minmax(0,1fr)]' : 'grid-rows-[minmax(0,1fr)]',
                    props?.className,
                )}
                onInteractOutside={(e) => {
                    if (!closeOnBackground) e.preventDefault();
                    props?.onInteractOutside?.(e);
                }}
            >
                {hasHeader && (
                    <DialogHeader className="px-6">
                        {title && <DialogTitle className="min-w-0 pr-6 [overflow-wrap:anywhere]">{title}</DialogTitle>}
                        {description && <DialogDescription>{description}</DialogDescription>}
                    </DialogHeader>
                )}
                <ScrollAreaWithShadow
                    bottomShadow
                    className="h-full min-w-0"
                    viewportClassName="[&>div]:block! [&>div]:min-w-0! [&>div]:max-w-full"
                >
                    <FooterSlot.Provider value={footer}>
                        <AutoHeight>
                            <div className="min-w-0 px-6">{content}</div>
                        </AutoHeight>
                    </FooterSlot.Provider>
                </ScrollAreaWithShadow>
                <div ref={setFooter} className="min-w-0 px-6 empty:hidden" />
            </DialogContent>
        </Dialog>
    );
}
