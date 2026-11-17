# Decisions

What was decided, and why. Decisions are made by consensus with the maintainer; "maintainer's rule" marks the ones the
maintainer set explicitly. How things work in detail is in the other guides; this page keeps the choices and the
reasons behind them.

- [Project](#project)
- [Printers](#printers)
- [Filament and Spoolman](#filament-and-spoolman)
- [Settings](#settings)
- [Single-printer workflow](#single-printer-workflow)
- [Dashboard redesign](#dashboard-redesign)
- [Releases](#releases)
- [Open questions](#open-questions)

## Project

- **Community fork** (maintainer's rule). The original project
  ([NatHacks/Kobralink](https://github.com/NatHacks/Kobralink)) stopped receiving commits after September 2026 and
  pull requests went unanswered. This fork continues it in the open; the original author is credited in the README, and
  fixes that also apply upstream are offered there as pull requests.
- **License stays GPL-3.0**, as the original.
- **Same conventions as the original** where they exist (no comments in the code, Biome, Bun, six locales), plus the
  practices of the maintainer's other project: Conventional Commits, squash-merged PRs, release-please, tests with every
  change, docs that follow the code.
- **Everything in English**: code, docs, commits, issues and PRs.

- **The project is called FarolPrint** (maintainer's decision, October 2026). The fork needed a name of its own, with
  no reference to Anycubic or Kobra so it can grow into a connector for other printers. "Farol" (lighthouse) stands
  for watching the printers from afar. Conventions: "FarolPrint" in prose and UI, `farolprint` for the repository,
  the Docker image, the packages (`@farolprint/*`) and the data directory, `FAROLPRINT_*` for environment variables
  and `FarolPrint` in identifiers. The old `KOBRALINK_*` variables are still read when their new counterpart is unset
  and an existing `kobralink.db` is renamed on first start, so running installs upgrade without manual steps. The
  credit to the upstream project keeps its original name, Kobralink. The name is written as one word, FarolPrint
  (maintainer's decision, October 2026, replacing the earlier "Farol Print").
- **Tests for everything, always** (maintainer's rule, October 2026). Every change, in every layer, ships with tests
  for every case it introduces; nothing is merged with "tests later". The expected coverage per layer is listed in
  [development.md](development.md#tests). After the single-printer workflow landed with partial coverage, the missing
  tests were added before any new feature.

## Printers

- **No firmware change, ever.** Newer Anycubic printers (Kobra X, and likely the Kobra 4) verify signed firmware
  updates, so custom firmware is not possible; FarolPrint only uses LAN mode.
- **The printer's real model is shown** (Home Assistant, Moonraker system info), taken from `info/report` and, as a
  fallback, from the stored printer. UI texts do not name a specific model.
- **A printer allows a single MQTT session.** FarolPrint owns it while connected; tools that capture messages must stop
  FarolPrint first.
- **A file is uploaded to the printer once.** With the "Dialog after upload" setting, an OrcaSlicer upload pushes the
  file to the printer and opens the dialog in the dashboard; confirming the dialog reuses that upload (same name, MD5
  and size as the last one) instead of sending the file again, so the print starts right away. The upload is forgotten
  when the file is deleted from the printer.
- **An unknown printer state keeps the print state** (upstream issue #1). A Kobra state FarolPrint does not know used to
  map to "printing" in `print/report` and "standby" in `info/report`, so the dashboard flipped between the two. The
  print state now stays as it was (the message source only decides right after connecting), and each unknown state is
  logged once so it can be added to the mapping.

## Filament and Spoolman

- **Printers without an ACE are first-class.** When `multiColorBox` reports no box, the printer is
  external-spool-only: the filament card shows an external spool slot (slot 0), and usage reported in `print/report`
  (`supplies_usage`) is attributed to it while printing, so the "sync while printing" setting works without an ACE.
- **The external spool form sends nothing to the printer.** Unlike the ACE slot form (type, color, feed), it only links
  a Spoolman spool and/or a local spool to slot 0.
- **Changing the spool mid-print splits the usage.** Pending usage is reported to the previous spool before the
  counters reset, and the new spool is only charged from that point on. Without this, a filament runout charged the
  whole print to one spool.
- **Spoolman mode** (maintainer's decision, October 2026). With a Spoolman URL set, Spoolman is the only spool
  inventory: the local one stops being charged and is hidden from the slot forms and the Filament page, which lists the
  Spoolman spools instead. A usage report that fails is kept in `spoolman_pending_use` and sent again once Spoolman
  answers, instead of being lost. The low-spool alert reads the remaining weight Spoolman returns after each report.
  Without Spoolman, the local inventory keeps only name, vendor, material, colour and quantity; the density follows
  the material and spools have no price.
- **Not enough filament warns before printing** (maintainer's decision). OrcaSlicer writes the length and weight of
  each filament in the G-code; FarolPrint stores them with the file (and reads them back from files stored earlier).
  The print dialog adds the colours printed from the same spool and compares them with what the spool has left: enough,
  just enough (within 5 % + 5 g), not enough, or unknown. Not enough asks for a "print anyway" before printing,
  queueing or scheduling; unknown never blocks. Simulating the whole queue comes with the single queue (phase 4).
- **No automatic spool switch.** Without an ACE or RFID the printer cannot tell which roll is loaded, so the user picks
  the spool when changing rolls.

## Settings

- **A settings save only writes the keys it sends.** Each settings card saves its own section; the update schema has
  no defaults, so saving one card no longer resets the others (upstream issue #2).

## Single-printer workflow

Features added for people running one printer first; the multi-printer versions (fleet queue, batch actions) come
later and build on these.

- **Bed-clear confirmation before the next queued job** (maintainer's rule). With auto-start on, the next file waits
  until the user confirms the bed is empty (`queueBedClearConfirm`, on by default); the old 15 s auto-start stays
  available by turning the confirmation off, for printers with an ejector. The hold is dropped as soon as the printer
  starts printing by any other means. Since 0.14 (maintainer's request, October 2026) the hold starts the moment a
  print ends, not when the printer later reports free, and it also follows cancelled and failed prints, even with the
  confirmation off: an ejector only runs at the end of a completed file, so a failed part may still be on the bed.
- **Scheduled starts reuse the print dialog.** A scheduled print stores the same options as an immediate one
  (excluded objects, slot mapping, leveling, timelapse, detection). If the printer is busy or offline at the time, the
  file goes to the front of the queue instead of being lost, and a notification says so. The dialog opened after an
  OrcaSlicer upload offers the same choices as the file list: print now, add to the queue or schedule.
- **Queued files keep the print dialog options** (October 2026). "Add to queue" stores the same options as an
  immediate print (vibration compensation, leveling, slot mapping, timelapse, detection) and the queue starts the file
  with them; before, only the excluded objects were kept and the printer defaults were used. Items queued without
  options (Moonraker, an older version) still use the printer settings. Every `print/start` logs the `task_settings`
  sent to the printer, so a setting the printer seems to ignore can be checked in the logs.
- **Maintenance is per printer and fully user-defined.** A task has up to three intervals (print hours, number of
  prints, days) and is due when any is reached; suggestions are offered but nothing is created by default. Usage is
  computed from the print history since the last completion, so it needs no new counters. A due task notifies once
  until it is completed.
- **Cost per print = filament + energy.** Filament comes from the Spoolman spool price, frozen into the job when it
  ends (or the default price per kg), energy from the kWh measured by the Home Assistant plug, else the price per kWh ×
  the printer's average power (its profile, else the default). Everything is zero by default; the cost is only shown
  once at least one source is set. The machine time (hourly rate plus the depreciation from the purchase price and
  expected lifespan) was removed in November 2026 at the maintainer's request: the setting, the profile fields, the
  machine part of the totals and the `cost_machine` CSV column are gone, and values saved by older versions are
  dropped when the settings are read.
- **Estimated cost before printing.** A file card shows `≈ total`, and the G-code preview and the print dialog show
  the breakdown (filament with its weight, energy, total). Filament is the G-code weight priced with the Spoolman spool
  mapped to a slot of the same material family (in the print dialog, the slot chosen for each filament), else the
  default price per kg; energy is the slicer's estimated time × the printer power draw (its profile, else the default)
  × the price per kWh. It is computed in the browser (`estimateCost` in `packages/shared/src/cost.ts`) and is not
  stored; the history keeps showing only the actual cost.
- **History is a grid of cards.** Each print shows the G-code thumbnail, its status, printer, date and duration, the
  failure label when it failed, and the cost broken down into filament, energy (with the measured kWh) and total.
- **Failures keep their evidence.** A cancelled or errored job records the printer error code and message, the last
  camera frame if the stream was running (best effort, no ffmpeg start), and a user-chosen reason from a fixed list
  (spaghetti, adhesion, clog, runout, layer shift, power loss, cancelled on purpose, other) plus a note. Statistics
  count failures by reason and the CSV export carries them.
- **Brazilian Portuguese (`pt-br`) is the seventh locale.** French stays the base locale and the fallback when the
  browser language matches none.
- **The printer page has a fixed layout** (maintainer's decision, October 2026), replacing the draggable
  `react-grid-layout` grid and its saved layouts. Fixed row heights squashed cards or left them half empty, and every
  card had to work at any size. The page has a main area and a narrow right column. The right column holds a compact
  print card (a single line when idle), a small controls menu with two tabs (light, power, fan and speed; axes), the
  filaments, the macros and the maintenance tasks. The main area holds the camera (three fifths of the width, at most
  70 % of the screen height) beside a column with the temperatures and the queue, then the files. The temperatures
  card has one chart with both heaters on a 0 °C based scale and dashed targets, replacing the separate activity
  sparklines. On a phone the right column comes first.
  The camera MJPEG is no longer scaled down to 640 px (maintainer's decision, October 2026): the Kobra camera sends
  1280×720 and the bigger camera card showed a blurred upscale. The stream now keeps the native resolution at JPEG
  quality 2, and the camera's own frame rate (`-vsync passthrough`) instead of `fps=15`: the Kobra 4 camera sends
  about 8 fps, so the filter only duplicated frames. It costs more bandwidth per viewer and more ffmpeg CPU than the
  640 px stream.
  Cards share `Panel`, `Segmented` and `IconButton` (`components/printer/panel.tsx`) so buttons have the same sizes.

## Dashboard redesign

The dashboard is being rebuilt in phases (maintainer's decision, October 2026), benchmarked against Mainsail, Fluidd,
OctoPrint, Obico, FDM Monster, SimplyPrint, Printago, Bambuddy, Prusa Connect, Repetier-Server, AutoFarm3D and the
Bambu tools so people migrating from them find things where they expect. The phases are in
[roadmap.md](roadmap.md).

- **Labelled sidebar** instead of the icon-only rail: icon and label, collapsible to icons, and a bottom bar with a
  "More" menu on phones. Every competitor except Fluidd and FDM Monster labels its navigation. Settings and the user
  menu sit at the bottom.
- **The theme follows the device** (light or dark from `prefers-color-scheme`), with a System / Light / Dark choice in
  the settings kept per browser. The primary colour is a pastel periwinkle instead of emerald (maintainer's choice among
  cyan and blue pastels); text and icons in that colour use a deeper shade so they stay readable on white.
- **Settings are pages with a side menu**, not tabs. The OrcaSlicer page and the logs move into them, since no
  competitor gives them a top-level slot. Day-to-day filament data (spools, drying presets, slicer profiles) moves out
  of the settings into its own Filament page.
- **Spoolman is the source of truth for filament** (maintainer's decision). Price, density and other technical data
  live only in Spoolman. Without Spoolman FarolPrint still works with a simpler local inventory (material, colour,
  quantity), and the dashboard strongly recommends connecting Spoolman.
- **A single queue for every printer** (maintainer's decision), replacing the per-printer queues. An item can only be
  added when a printer can take it: same printer model, nozzle, build plate size, and the file's materials and
  colours. The colours do not have to be loaded when the item is added (maintainer's decision): a matching spool in
  stock is enough, and the item waits for a printer with that filament loaded. Printers get tags, used to target
  queue items and automations at several printers at once.
- **Not enough filament warns, it does not block** (maintainer's decision): the print dialog asks for confirmation, and
  the queue holds an auto-start and sends a notification instead of starting a print that would run out.
- **Printer specifications come from Anycubic's official data** (maintainer's rule): build volume and similar values
  are taken from a table of Anycubic's published specifications per model; a value that is not in it stays empty.
  The table keeps build volume, nozzle sizes, maximum temperatures, rated power and ACE support, each with its source.
  The kinematics is left out, since Anycubic labels it inconsistently ("Gantry System") and the queue does not need it.
  The rated power is a nameplate maximum, shown for reference only: energy costs use the average draw the user enters
  (maintainer's decision), until energy sensors are integrated.
- **Notifications link to the screen that handles them** (maintainer's decision): each notification carries the
  FarolPrint URL of the recommended action (the printer, the queue, the macro...).
- **No G-code injection** (maintainer's decision). Automations that rewrite the print file (clear the bed, retract,
  change filament at the end) were dropped: the Kobra X and Kobra 4 firmware only verifiably honours the commands
  Anycubic's own profiles use, editing the start of a file raises error 10133, and pushing parts off the bed risks the
  printer. Automations act through the LAN protocol instead.
- **Wasted filament is split by how the print ended** (maintainer's request, October 2026). Statistics show the
  filament used by prints that never finished, in two groups: prints stopped while paused (filament runout, error,
  manual pause; the job keeps the time of its last pause in `print_job.pausedAt`) and prints cancelled while printing or
  lost after an error. A pause is told apart from a resume by the Kobra state (`pause`, `pausing`, `paused` against
  `resuming`, `resumed`, `printing`), because cancelling a paused print goes through `stopping`, which counts as
  printing. Jobs from before this change have no pause time and count as cancelled.
- **Calibration is not print time** (maintainer's request, October 2026). Before the first layer the Kobra 4 levels the
  bed (`auto_leveling`), compensates vibrations (`vibrating`) and heats up (`preheating`); seen on a real print, this
  took about six minutes while the printer's own print time stayed at zero. The dashboard shows these steps as
  "Calibrating" with the current step, no elapsed time and no progress, and a print cancelled before its first layer
  records no print time.
- **Recommended maintenance tasks follow the interface language** (October 2026). A task created from a recommendation
  keeps its recommendation key (`maintenance_task.presetKey`) and is shown, and notified, in the current language;
  renaming it makes it a custom task with its own name. Tasks created before the key existed are recognised by their
  name in any of the seven languages.
- **Light toggles can start the next print** (maintainer's decision), as an opt-in setting: tapping the light button on
  the printer screen 3 times within 20 s confirms the bed is clear, like the "Good" button. Every light message the
  printer sends counts as a tap, whatever the state, because the Kobra 4 merges quick taps (4 quick taps arrived as 2
  messages on a real printer), so the taps should be about a second apart. A single light-on does not count: the
  Kobra 4 turns its light on by itself when a print starts. FarolPrint ignores the replies to the light commands it
  sends itself. The trigger only confirms the bed; starting the next file needs auto-start, so turning the trigger on
  turns auto-start on and turning auto-start off turns the trigger off (maintainer's request).
- **The wait before an automatic start is a setting** (`queueAutoStartDelaySec`, 0 to 3600 s, 15 by default;
  maintainer's request). It applies after the bed is confirmed in the dashboard and, with the confirmation off, after a print
  finishes. The light trigger always starts the next file right away (maintainer's request): the taps already happen
  at the printer, and the confirmation has to feel instant. The queue shows the countdown with a button to cancel it;
  starting a file by hand or adding one to the queue does not wait. The printer settings show a sentence that says
  what will happen with the current choices.
- **How the single queue picks the next file** (October 2026). The queue keeps one order for every printer. When a
  printer is free (auto-start, a cleared bed or "Start next"), it takes the first item in that order that targets it
  (the printer itself, tags it carries, or any printer), that it can print (same model when the file names one, same
  nozzle, the parts fit the build volume) and whose filament the loaded spools cover. Items it cannot take keep their
  place for another printer. Two starts on the same printer within 30 s are refused, so a double click or the light
  trigger cannot start two files. The existing per-printer queues were merged in their old order, each item targeting
  its printer.
- **Colour is a hint, not a rule** (October 2026, after a real refusal). The colour in a G-code is the slicer profile's
  colour (the Anycubic PETG profile is teal), which rarely matches the spool actually used, so a file was refused
  although the right material was loaded. Colour no longer blocks adding a file or starting it: only the printer
  model, the nozzle, the build volume and the material do. A colour with no spool in stock is still reported, and
  with several slots the closest colour of the right material is picked. A refusal now names each printer and its
  reasons. An empty `printer_model` in the G-code (custom OrcaSlicer printer profiles) leaves the model unknown, so it
  is not checked.
- **Every queued item says why it waits**: no printer can take it, the printer is offline, in maintenance, printing,
  waiting for its bed to be cleared, short of filament, or ready for a manual start. The filament is simulated in queue
  order: each item spends from the spools of the printer it would go to, so the second of two prints that together
  need more than a spool holds shows "filament". An item held for filament is notified once (under the "Queue"
  notification switch) instead of being started.
- **A cleared bed is rated good or bad** (maintainer's decision). "Good" starts the next file when auto-start is on.
  "Bad" marks the last print as failed with the reason "rejected quality" and puts its file back at the front of the
  queue for the same printer, so the reprint comes before anything else. The light trigger counts as "good".
- **Maintenance mode** takes a printer out of the queue without removing its items: nothing is dispatched to it, the
  home page shows it apart, and the queue starts again when it comes back.
- **How the statistics are measured** (October 2026). Key figures are compared with the previous period of the same
  length (the 7, 30, 90 or 365 days before); "All" has no comparison. Utilisation is the print time divided by the
  time of every printer in the period (from the start of the period, or the first print for "All", until now), so an
  idle printer lowers it; each printer is listed, idle ones included. The mean time between failures is the print time
  divided by the failed prints (errors and cancels, except a cancel labelled "cancelled on purpose"). The idle time after
  a print is the median wait between the end of a print and the next start on the same printer; the median keeps a
  weekend without prints from hiding the usual wait. The estimate accuracy compares the slicer estimate with the real
  time of completed prints. Failures are shown most frequent first with their cumulative share (Pareto).
- **The cancel dialog asks why** (maintainer's decision), with the same reasons as the history and "Don't say" as the
  default. The reason is kept by the bridge until the print ends and stored on the job; a cancel from OrcaSlicer or
  the printer screen stays unlabelled and can be labelled later from the history.
- **Measured energy comes from Home Assistant** (maintainer's request, October 2026). FarolPrint reads the kWh meter of
  a printer's plug through the Home Assistant REST API (address and a long-lived token in Settings → Integrations, the
  meter picked per printer from the energy sensors Home Assistant lists) at the start and the end of each print, and
  stores the difference on the job. The energy cost then uses that measurement; prints without a reading keep the
  estimate from the average draw. A meter that went backwards (reset, replaced plug) gives no reading rather than a
  wrong one. Reading a plug's own API without Home Assistant stays on the roadmap.
- **The smart plug is chosen in Home Assistant** (maintainer's decision, October 2026). The printer settings no longer
  ask for on, off and status URLs: with Home Assistant connected, a "Plug" card picks the plug's switch and its energy
  meter from what Home Assistant lists, and the power button and the automation power action go through
  `switch.turn_on`/`turn_off`. Without Home Assistant the card is hidden. URLs saved before still work for printers
  that have them, but cannot be edited from the dashboard any more.
- **Automations are rules, not scripts** (October 2026). A rule has one trigger (a print finished, a print cancelled
  or failed, a bed cleared, a spool running low, or a time of day), a target (one printer, the printers carrying all
  the given tags, or every printer) and up to ten actions run in order: a macro, the light, loading or unloading an
  ACE slot, the smart plug, a wait and a notification. Actions only use the LAN protocol and the printer's power URLs;
  there is no G-code action. A rule runs once at a time per printer, stops at the first failing action and keeps the
  error, shown on the Automations page with a "Run now" button. Time rules run in the server's time zone, which is
  UTC in the Docker image unless `TZ` is set in `.env` (the daily statistics use it too).
- **Powering a printer off waits for it** (maintainer's rule: never risk the printer). The power-off action is refused
  while a print is running or paused and waits until the nozzle is below 50 °C (at most 30 minutes, then it gives up),
  so the hotend fan can cool the heat break. Power on works on an offline printer, so a morning rule can wake it.
- **Every notification opens its screen**: the printer page for print events, the queue for queue and scheduled
  print events, maintenance, filament for low spools and automations for automation messages. Discord, Telegram, ntfy
  and the webhook get the link built from FarolPrint's own address (`publicUrl`, set in the setup wizard or the general
  settings); without it they carry no link. Discord shows it as an "Open in FarolPrint" link under the message (a clickable embed title alone went unnoticed), ntfy as a button, Telegram as a link line. In the dashboard, the toast and the browser notification open the screen.

## Releases

- **Images on GHCR** (`ghcr.io/riccardoalv/farolprint`), built by GitHub Actions with the repository token: `latest`
  and `sha-<commit>` on every push to `main`, `X.Y.Z` and `X.Y` on releases. No registry secrets are needed.
- **release-please computes versions and the changelog** from Conventional Commits, starting after upstream 0.3.6.
- **Docker and the web dashboard only** (maintainer's decision, October 2026). The Electron desktop app inherited
  from upstream was removed, with the API bundle it embedded and the upstream `release.yml` (desktop installers and a
  Docker Hub image that needed secrets the fork does not have). FarolPrint runs as a Docker container, or from source
  for development, and is used from the browser; the image is published to GHCR only.

## Open questions

- A Kobra MQTT simulator that replays captured messages, so the whole bridge can be tested in CI without a printer.
- The external spool is tracked under slot key `0`, the same as ACE slot 1, so a printer with an ACE cannot track both;
  a separate key needs testing on a printer with an ACE.

