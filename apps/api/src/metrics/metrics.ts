import { ACE_DRYING_ON, type PrinterLiveState } from '@kobralink/shared';

type Labels = Record<string, string | number>;

interface Metric {
    name: string;
    help: string;
    samples: [Labels, number][];
}

function gauge(name: string, help: string, states: PrinterLiveState[], value: (s: PrinterLiveState) => number): Metric {
    return { name, help, samples: states.map((s) => [{ printer_id: s.printerId }, value(s)]) };
}

function escapeLabel(v: string | number): string {
    return String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

export function renderMetrics(states: PrinterLiveState[]): string {
    const printing = (s: PrinterLiveState) => s.printState === 'printing' || s.printState === 'paused';
    const metrics: Metric[] = [
        {
            name: 'kobralink_printer_info',
            help: 'Printer identity, value is always 1.',
            samples: states.map((s) => [
                { printer_id: s.printerId, name: s.printerName, firmware: s.firmwareVersion },
                1,
            ]),
        },
        gauge('kobralink_printer_connected', '1 when the MQTT session is up.', states, (s) => (s.connected ? 1 : 0)),
        {
            name: 'kobralink_printer_state',
            help: 'Klipper print state, 1 for the current one.',
            samples: states.map((s) => [{ printer_id: s.printerId, state: s.printState }, 1]),
        },
        gauge('kobralink_nozzle_temperature_celsius', 'Nozzle temperature.', states, (s) => s.nozzleTemp),
        gauge('kobralink_nozzle_target_celsius', 'Nozzle target temperature.', states, (s) => s.nozzleTarget),
        gauge('kobralink_bed_temperature_celsius', 'Bed temperature.', states, (s) => s.bedTemp),
        gauge('kobralink_bed_target_celsius', 'Bed target temperature.', states, (s) => s.bedTarget),
        gauge('kobralink_fan_speed_ratio', 'Part cooling fan speed (0-1).', states, (s) => s.fanSpeed / 100),
        gauge('kobralink_print_speed_mode', 'Kobra print speed mode (1-4).', states, (s) => s.printSpeedMode),
        gauge('kobralink_print_progress_ratio', 'Print progress (0-1).', states, (s) => (printing(s) ? s.progress : 0)),
        gauge('kobralink_print_duration_seconds', 'Elapsed print time.', states, (s) =>
            printing(s) ? s.printDurationSec : 0,
        ),
        gauge('kobralink_print_remaining_seconds', 'Estimated remaining print time.', states, (s) =>
            printing(s) ? s.remainTimeSec : 0,
        ),
        gauge('kobralink_print_layer', 'Current layer.', states, (s) => (printing(s) ? s.currLayer : 0)),
        gauge('kobralink_print_layers_total', 'Total layers of the current print.', states, (s) =>
            printing(s) ? s.totalLayers : 0,
        ),
        gauge('kobralink_printer_error_code', 'Last printer error code, 0 when none.', states, (s) => s.errorCode),
        gauge('kobralink_light_on', '1 when the chamber light is on.', states, (s) => (s.lightOn ? 1 : 0)),
        gauge('kobralink_storage_used_bytes', 'Printer storage used.', states, (s) => s.storageUsedMb * 1024 * 1024),
        gauge('kobralink_storage_total_bytes', 'Printer storage size.', states, (s) => s.storageTotalMb * 1024 * 1024),
        {
            name: 'kobralink_ace_humidity_percent',
            help: 'ACE relative humidity.',
            samples: states.flatMap((s) =>
                s.aceUnits
                    .filter((u) => u.drying.humidity !== null)
                    .map((u): [Labels, number] => [{ printer_id: s.printerId, ace: u.id }, u.drying.humidity ?? 0]),
            ),
        },
        {
            name: 'kobralink_ace_temperature_celsius',
            help: 'ACE temperature.',
            samples: states.flatMap((s) =>
                s.aceUnits
                    .filter((u) => u.drying.currentTemp !== null)
                    .map((u): [Labels, number] => [{ printer_id: s.printerId, ace: u.id }, u.drying.currentTemp ?? 0]),
            ),
        },
        {
            name: 'kobralink_ace_drying',
            help: '1 while the ACE dryer runs.',
            samples: states.flatMap((s) =>
                s.aceUnits.map((u): [Labels, number] => [
                    { printer_id: s.printerId, ace: u.id },
                    u.drying.status === ACE_DRYING_ON ? 1 : 0,
                ]),
            ),
        },
    ];
    const lines: string[] = [];
    for (const metric of metrics) {
        lines.push(`# HELP ${metric.name} ${metric.help}`, `# TYPE ${metric.name} gauge`);
        for (const [labels, value] of metric.samples) {
            const l = Object.entries(labels)
                .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
                .join(',');
            lines.push(`${metric.name}{${l}} ${Number.isFinite(value) ? value : 0}`);
        }
    }
    return `${lines.join('\n')}\n`;
}
