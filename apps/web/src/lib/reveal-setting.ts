const FALLBACK_MS = 600;
const TIMEOUT_MS = 3000;
const HIGHLIGHT_MS = 3000;

function ownerOfText(root: Element, text: string): HTMLElement | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        if (walker.currentNode.nodeValue?.trim() === text) return walker.currentNode.parentElement;
    }
    return null;
}

export function findSetting(card: string, label: string): { element: HTMLElement; exact: boolean } | null {
    const host = [...document.querySelectorAll<HTMLElement>('[data-slot="card"]')].find((c) => {
        const title = c.querySelector('[data-slot="card-title"]');
        return title && ownerOfText(title, card);
    });
    if (!host) return null;
    if (label === card) return { element: host, exact: true };
    const content = host.querySelector('[data-slot="card-content"]');
    const text = content && ownerOfText(content, label);
    if (!text) return { element: host, exact: false };
    return {
        element: text.closest<HTMLElement>('[data-setting], button, a') ?? text.parentElement ?? host,
        exact: true,
    };
}

function highlight(element: HTMLElement): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anchor = element.querySelector('[data-slot="card-header"]') ?? element;
    anchor.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    const control = element.matches('button, a');
    if (!control) {
        element.tabIndex = -1;
        element.style.outline = 'none';
    }
    element.focus({ preventScroll: true });
    const row = !control && element.dataset.slot !== 'card';
    const tint = 'color-mix(in oklab, var(--primary) 18%, var(--card))';
    const on: Keyframe = {
        outline: '3px solid var(--primary)',
        outlineOffset: row ? '5px' : '2px',
        ...(row && { backgroundColor: tint, boxShadow: `0 0 0 5px ${tint}`, borderRadius: '0.5rem' }),
    };
    element.animate([{ ...on, offset: 0 }, { ...on, offset: 0.75 }, { offset: 1 }], {
        duration: HIGHLIGHT_MS,
        easing: 'ease-out',
    });
}

let latest = 0;

export async function revealSetting(card: string, label: string): Promise<void> {
    const call = ++latest;
    const start = performance.now();
    while (call === latest) {
        const elapsed = performance.now() - start;
        const found = findSetting(card, label);
        if (found && (found.exact || elapsed > FALLBACK_MS)) return highlight(found.element);
        if (elapsed > TIMEOUT_MS) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}
