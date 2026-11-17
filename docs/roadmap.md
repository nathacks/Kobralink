# Roadmap

The dashboard redesign agreed in October 2026, in the order it ships. Each phase is one pull request with its tests
and docs; the reasons behind the choices are in [decisions.md](decisions.md#dashboard-redesign).

## 1. Look and navigation (done)

- Pastel periwinkle primary colour; light and dark themes that follow the device, with a System / Light / Dark choice.
- Labelled, collapsible sidebar; bottom bar with a "More" menu on phones.
- Settings as pages with a side menu (General, Notifications, AI detection, Integrations, OrcaSlicer, Macros, Users,
  System, Logs); each card keeps its own unsaved edits when another one is saved.
- A Filament page for spools, drying presets and slicer filament profiles.

## 2. First run and printer profile (done)

- A setup wizard: admin account, language and currency, FarolPrint's own URL (for notification links), the first
  printer (LAN mode checklist, IP, connection test, model read from the printer), Spoolman (strongly recommended,
  skippable) and connecting OrcaSlicer. A "getting started" checklist afterwards.
- Printer profile: location, tags, installed nozzle and power draw; build volume
  from Anycubic's official specifications.
- Home page with status counters that filter the printer grid; a single printer opens straight on its page.

## 3. Filament (done, except the queue simulation, moved to phase 4)

- Spoolman as the source of truth: prices from Spoolman, failed usage reports retried, the job's cost frozen when it
  ends, low-spool alerts from Spoolman, the external spool tracked apart from ACE slot 1.
- Local fallback without Spoolman: material, colour and quantity only.
- Filament planning: the amount each colour needs is read from the G-code; the print dialog warns when a spool is
  short; the queue is simulated in order and holds an auto-start that would run out.

## 4. Single queue (done, except the timeline, moved to later)

- One queue for every printer. An item can only be added when a printer can take it (model, nozzle, build plate,
  materials and colours), and it says why it is waiting.
- Printer tags; items can target a printer, a tag or any compatible printer.
- "Bed clear" as a printer state, with a good/bad rating (bad puts the file back in the queue); auto-start only after
  a successful print; maintenance mode keeps a printer out of the queue.
- The queue is simulated in order against the spools: each item shows whether its filament lasts, and an auto-start
  that would run out is held with a notification.
- Opt-in light trigger: the light turned on three times within a short window on the printer screen confirms the bed
  is clear.
- Pages: Queue (queued, awaiting removal, scheduled), Files, History (cards with the preview and the cost breakdown,
  every printer, filterable by printer),
  Maintenance (all printers).

## 5. Statistics (done)

- Wasted filament of unfinished prints, split between paused and cancelled ones (shipped early, with phase 1).
- Key figures compared with the previous period: success rate, print hours, utilisation, filament, cost.
- Jobs per day by outcome, failures by reason (Pareto), cancel reason asked when cancelling.
- Per printer: utilisation, mean time between failures, idle time after a print, estimate accuracy, cost.

## 6. Automations and notifications (done)

- Rules that run on events (print finished or failed, bed cleared, filament low, a time of day) for printers chosen
  by tag, acting through the LAN protocol: run a macro, unload or load filament (ACE), switch the light, switch the
  smart plug (the printer's power URLs, such as Tasmota or a Home Assistant webhook), wait, notify.
- Every notification links to the FarolPrint screen of the recommended action.

## Later

- A queue timeline: when each queued item is expected to start and end on each printer.
- Energy straight from a plug's own API (Tasmota, Shelly) for people without Home Assistant; the Home Assistant
  meter shipped in 0.15.
