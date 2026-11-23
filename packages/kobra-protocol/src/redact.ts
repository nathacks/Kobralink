export function redactPrinterUrl(url: string): string {
    return url.replace(/([?&]s=)[^&#\s"]+/g, '$1…').replace(/\/live\/[A-Za-z0-9_-]+/g, '/live/…');
}
