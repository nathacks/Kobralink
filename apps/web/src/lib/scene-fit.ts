export interface SceneFit {
    distance: number;
    position: [number, number, number];
    target: [number, number, number];
}

const VIEW_DIRECTION: [number, number, number] = [0.7, 0.6, 0.7];

export function fitCamera(
    size: { x: number; y: number; z: number },
    fovDeg: number,
    aspect = 1,
    margin = 1.12,
): SceneFit {
    const radius = Math.max(1, 0.5 * Math.hypot(size.x, size.y, size.z));
    const vertical = (fovDeg * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.1));
    const limiting = Math.min(vertical, horizontal);
    const distance = (radius / Math.sin(limiting / 2)) * margin;
    const length = Math.hypot(...VIEW_DIRECTION);
    const target: [number, number, number] = [0, size.z / 2, 0];
    const position = VIEW_DIRECTION.map((v, i) => (v / length) * distance + target[i]) as [number, number, number];
    return { distance, position, target };
}
