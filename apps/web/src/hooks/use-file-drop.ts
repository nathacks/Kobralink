import { type RefObject, useEffect, useRef, useState } from 'react';

export function useFileDrop(ref: RefObject<HTMLElement | null>, enabled: boolean, onFiles: (files: FileList) => void) {
    const [dragging, setDragging] = useState(false);
    const depth = useRef(0);
    const onFilesRef = useRef(onFiles);
    useEffect(() => {
        onFilesRef.current = onFiles;
    }, [onFiles]);

    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return;
        const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
        const onDragEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth.current += 1;
            setDragging(true);
        };
        const onDragLeave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setDragging(false);
        };
        const onDragOver = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        };
        const onDrop = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth.current = 0;
            setDragging(false);
            if (e.dataTransfer) onFilesRef.current(e.dataTransfer.files);
        };
        el.addEventListener('dragenter', onDragEnter);
        el.addEventListener('dragleave', onDragLeave);
        el.addEventListener('dragover', onDragOver);
        el.addEventListener('drop', onDrop);
        return () => {
            el.removeEventListener('dragenter', onDragEnter);
            el.removeEventListener('dragleave', onDragLeave);
            el.removeEventListener('dragover', onDragOver);
            el.removeEventListener('drop', onDrop);
            depth.current = 0;
            setDragging(false);
        };
    }, [ref, enabled]);

    return dragging;
}
