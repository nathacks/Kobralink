# Kobra LAN protocol

What the Anycubic Kobra LAN protocol offers, what FarolPrint uses of it, and where FarolPrint differs from Anycubic's
own client. Surveyed in November 2026 (maintainer's request) from FarolPrint's code, the maintainer's Kobra 4 and the
public sources below. The decisions taken from it are in [decisions.md](decisions.md#printer-protocol).

## Sources

| Mark | Meaning |
|---|---|
| ✔ | Checked in Anycubic's own LAN client, on the maintainer's Kobra 4, or in FarolPrint's code |
| 🟡 | Only in community projects |
| ❓ | To check on a real printer before building on it |

- **Anycubic's own LAN client**: the workbench page Anycubic Slicer Next loads for its Device tab, recovered from its
  source maps in [grunna/anycubic-kobra-x-lan](https://gitlab.com/grunna/anycubic-kobra-x-lan/-/tree/7166ebf9bc42b96237f55846ae763cee6a918413/research/anycubic-web/sourcemap-chunks)
  (`857/utils/lanTopic.js`, `857/api/slicer/materials.js`, `790/utils/initData.js`, `790/webpack/src/views/`). It
  outranks every other source. The published Slicer Next source has no LAN code, so the values the slicer puts in
  `print/start` are not public.
- Community projects: [chrisfore/anycubic_ha_local](https://github.com/chrisfore/anycubic_ha_local) (captures from an
  S1 Max, Kobra 3 V2, Kobra X and Kobra 4), [Nino6689/anycubic-cloud-api](https://github.com/Nino6689/anycubic-cloud-api)
  (S1 captures), [ljschmitt/hass-anycubic_cloud_v3](https://github.com/ljschmitt/hass-anycubic_cloud_v3),
  [stribor/anycubic_kobrax](https://github.com/stribor/anycubic_kobrax), [grunna/ha-anycubic-kobra-x-lan](https://github.com/grunna/ha-anycubic-kobra-x-lan),
  [jbatonnet/Rinkhals](https://github.com/jbatonnet/Rinkhals), [NatHacks/Kobralink](https://github.com/NatHacks/Kobralink)
  (upstream), [rvanderp3/kobra-connect](https://github.com/rvanderp3/kobra-connect),
  [metheos/anycubic-s1-mqtt-bridge](https://github.com/metheos/anycubic-s1-mqtt-bridge) and the Kobra 2 tools.

## Transport

- **HTTP on 18910**: `GET /info` (token, model, LAN mode), `POST /ctrl` (signed with the token; returns the MQTT
  credentials encrypted with AES-128-CBC) and `POST /gcode_upload?s=<token>` (multipart). An accepted upload answers
  `{"code":200,"data":{"gcode":"<name>"},"message":"success"}` ✔. Refusals carry codes 19001–19011 🟡 (inferred from
  the firmware): 19007 name or type refused, 19008/19009 not saved, 19010 no space, 19011 3MF refused. `/ctrl` answers
  19002 when the connection limit is reached ✔.
- **Camera on 18088**: HTTP-FLV H.264, `/live/<token>` on the Kobra X and Kobra 4, announced as `urls.rtspUrl` in
  `info`. One consumer at a time, so FarolPrint fans it out through one ffmpeg.
- **MQTT over TLS on 9883** (3.1.1). Requests go to `anycubic/anycubicCloud/v1/{slicer|web}/printer/<modeId>/<deviceId>/<type>`,
  reports come on `anycubic/anycubicCloud/v1/printer/public/<modeId>/<deviceId>/<type>/report`. The body is
  `{type, action, msgid, timestamp, data}`; a report adds `state`, `code` and `msg`. `code` 0 or 200 is OK, 10000–19999
  is an error ✔. The printer accepts a single session.
- **Model ids**: 20024 Kobra 3, 20025 S1, 20028 Kobra 4, 20029 S1 Max, 20030 Kobra X 🟡. ACE model ids: 40001 ACE Pro,
  40002 ACE 2 / ACE 2 Pro 🟡.

## What FarolPrint sends

| type / action | data | Used for |
|---|---|---|
| `info/query` | — | the poll loop (state, temperatures, upload URL, camera URL) |
| `print/query` | — | the poll loop while printing (🟡 sources disagree on when the printer answers) |
| `multiColorBox/getInfo` | — | the poll loop (ACE slots; an empty list means an external spool only) |
| `print/start` | see below | every print |
| `print/pause`, `print/resume`, `print/stop` | `{taskid}` | print controls |
| `print/update` | `{taskid, settings:{print_speed_mode \| target_nozzle_temp \| target_hotbed_temp}}` | speed and temperatures while printing (on the `web` topic) |
| `tempature/set` | `{type: 0 nozzle / 1 bed / 2 both, target_nozzle_temp, target_hotbed_temp}` | temperatures when idle |
| `fan/setSpeed` | `{fan_speed_pct}` | part fan |
| `light/control` | `{type: 3, status, brightness}` | the camera light; brightness 100 to turn on, 0 to turn off ✔ |
| `light/query` | — | once per connection, on the `web` topic like the official client, to know the light before it changes ✔ |
| `axis/move` | `{axis, move_type, distance}` | jog and home. Axis 1 X, 2 Y, 3 Z, 4 XY, 5 XYZ; move type 0 minus, 1 plus, 2 home ✔ |
| `axis/turnOff` | — | motors off |
| `video/startCapture`, `video/stopCapture` | — | camera |
| `multiColorBox/setInfo`, `feedFilament`, `setAutoFeed`, `setDry` | `{multi_color_box:[…]}` | ACE slot edit, load / unload, auto refill, drying |
| `skip/query_obj`, `skip/start` | `{objects_skip_parts}` | object skip; `start` gets the parts already skipped plus the new ones ✔ |
| `file/listLocal`, `file/deleteBatch`, `file/fileDetails` | — | printer storage, thumbnails, objects |

### `print/start`

```json
{
  "taskid": "-1", "url": "<FarolPrint serve URL>", "filename": "part.gcode", "md5": "…", "filepath": null,
  "filetype": 1, "project_type": 1, "filesize": 1234,
  "ams_settings": { "use_ams": false, "ams_box_mapping": [] },
  "task_settings": {
    "auto_leveling": 1, "vibration_compensation": 0, "flow_calibration": 1, "dry_mode": 0,
    "ai_settings": { "status": 0, "count": 0, "type": 1 },
    "timelapse": { "status": 0, "count": 0, "type": 64 },
    "drying_settings": { "status": 0, "target_temp": 0, "duration": 0, "remain_time": 0 },
    "model_objects_skip_parts": []
  }
}
```

| `task_settings` field | FarolPrint | Meaning |
|---|---|---|
| `auto_leveling` | printer setting, on by default; print dialog | bed leveling, state `auto_leveling` |
| `vibration_compensation` | printer setting, off by default; print dialog | resonance compensation, state `vibrating` |
| `flow_calibration` | printer setting, on by default; print dialog | flow calibration, state `flow_calibrating` ✔ (the Kobra 4 runs it) |
| `dry_mode` | always 0 | 2 = dry in the ACE first, then print ✔ (ACE only) |
| `ai_settings` | always off | the printer's own failure detection; `count`/`type` unknown 🟡. FarolPrint runs its own. |
| `timelapse` | always off | the printer's own timelapse, needs a USB drive (10134–10137) 🟡. FarolPrint records its own. |
| `drying_settings` | always zero | origin unknown, only FarolPrint and upstream send it |
| `model_objects_skip_parts` | objects excluded in the print dialog | skip before starting |

The printer says what it supports in `info.features`: `auto_leveling_support`, `vibration_compensation_support`,
`flow_calibration_support`, `drying_first_support`, `camera_timelapse_support`, `delete_batch_support` and more 🟡.
Nobody has published them for the Kobra 4 yet ❓; FarolPrint logs them once per connection ("Features reported by the
printer") so they can be read from the logs page.

## What FarolPrint reads

| Report | Fields used |
|---|---|
| `info/report` | `version`, `model`, `state`, `project.{state, filename, progress, print_time, remain_time, curr_layer, total_layers, taskid}`, `temp`, `urls`, `fan_speed_pct`, `print_speed_mode`, `features` (logged) |
| `print/report` | `state`, `code`/`msg` on a pause, `filename`, `progress`, `print_time` (minutes), `remain_time` (minutes), `curr_layer`, `total_layers`, `taskid`, `supplies_usage` (mm), `settings.print_speed_mode` |
| `tempature/report` | current and target nozzle and bed |
| `multiColorBox/report` | boxes, slots (`status`, `type`, `color`, `rfid`, `sku`), `loaded_slot`, `feed_status`, `auto_feed`, drying |
| `light/report` | the camera light (type 3) from a `query` answer (`lights[]`) or a `control` answer (the bare light); a light with no `status` is unknown, not off. Every message except a `query` answer counts as a tap for the bed clear trigger, whatever the lamp |
| `fan/report` | `fan_speed_pct` (pushed as soon as it changes, unlike `info`) |
| `file/report` | listings, deletions, thumbnails, objects and their SVG |
| `skip/report` | skipped objects |
| `buried/report` | storage size, file size, layers and estimate of the running file |

Ignored today: `status/report`, `video/report`, `axis/report` (beyond refusals), `peripherie`,
`ota`, `event`, `extfilbox`, `aiSettings`, `calibration`, `properties`.

### ACE slot and feed values ✔

- Slot `status`: 1 feeding, 2 unloading, 3 gear shift, 4 no spool, 5 ready, 6 shift error, 7 preloading, 8 reading
  RFID. FarolPrint only tells 5 (ready) apart.
- `feed_status.type`: 1 load, 2 unload, 3 finish. `feed_status.current_status`: 1 heating, 2 unloading, 3 loading,
  10 load complete, 11 unload complete. FarolPrint shows 1/2/3 as activity and answers 10/11 with `type: 3`.
- `drying_status.status`: 0 off, 1 on, 2 fault.
- Official drying presets: PLA and PLA+ 45 °C 4 h, PETG 50 °C 4 h, TPU 55 °C 4 h, ABS/ASA 55 °C 8 h, PA/PC 55 °C 12 h.
  An ACE Pro refuses more than 55 °C with code 11505 🟡.

## Printer states

`free` and `busy` describe the printer; a job goes through:

| Group | States |
|---|---|
| Preparation, official ✔ | `preheating`, `auto_leveling`, `vibrating`, `flow_calibrating`, `checking`, `drying`, `downloading`, `slicing`, `waiting` |
| Preparation, newer firmware 🟡 | `hotbed_heating`, `hotbed_cooling_off`, `nozzle_heating`, `nozzle_cooling`, `nozzle_cooling_off`, `nozzle_purging`, `nozzle_wiping`, `frequency_sweeping`, `z_offset_calibrating`, `filament_cutting`, `extfilbox_filament_feeding`, `extfilbox_filament_unfeeding`, `ace_filament_feeding`, `ace_filament_unfeeding` |
| Other | `printing`, `updated` (acknowledges `print/update`), `init`, `pausing`, `paused`, `pause`, `resuming`, `resumed`, `stopping`, `stoped` (sic), `finished`, `failed`, `canceled` |

All preparation states are listed once in `PREPARING_KOBRA_STATES` (`packages/shared/src/state.ts`). Some of them
(filament cutting, purging, loading) also happen in the middle of a multi-colour print, so FarolPrint only treats them
as calibration before the first layer (`isPreparing`); after it, the progress stays and the badge names the step.

`print_status` in `info.project`: 1 printing, 2 finished, 3 failed, 4 downloading, 5 checking, 6 preheating,
7 slicing, 9 auto leveling, 10 vibrating, 11 flow calibrating, 12 drying ✔. FarolPrint does not use it.

## Codes

Pause and stop reasons ride on the `print` report `code`/`msg`: 10401 user pause, 10402 out of filament, 10601 user
stop, 11518 filament stuck, 11842 entanglement or clog (seen on the Kobra 4 ✔). Anycubic's own table (`initData.js`)
has every code with texts and a help link: 101xx tasks, 102xx calibration and file range, 103xx lights, 104xx–106xx
pause and stop, 108xx OTA and storage, 109xx homing and travel, 113xx–114xx camera, 115xx ACE, 117xx feeding, 118xx
AI detection (11801 spaghetti).

FarolPrint explains 43 common codes in the interface language (`PRINTER_ERROR_MESSAGES` in
`packages/shared/src/printer-errors.ts`, texts adapted from Anycubic's table and, for 11842, from the message the
Kobra 4 sends): in the pause banner, the failure history, refused commands and notifications. Any other code shows the
printer's own message.

## Not available over LAN

Writing the printer's AI detection settings, triggering a firmware update, the cloud camera, a Z offset command and raw
G-code. Turning LAN mode on also unbinds the printer from the Anycubic account.

## Divergences

Status of every gap found by the survey; the ones already fixed are marked **fixed**.

| # | Divergence | Status |
|---|---|---|
| 1 | `flow_calibrating` unknown (seen on the Kobra 4) | fixed |
| 2 | Official `drying`, `downloading`, `slicing`, `waiting` unmapped | fixed |
| 3 | 14 newer firmware states unmapped; some happen mid-print | fixed (first-layer rule) |
| 4 | Home sent axis 4 (XY) for "Home XYZ", the `xy` macro sent 2 (Y) | fixed: 5 XYZ, 4 XY, 3 Z, three buttons as in the official client |
| 5 | Light turned on with brightness 0 after the printer reported 0 | fixed: 100 to turn on, 0 to turn off |
| 6 | `feed_status` 10/11 shown as loading/unloading | fixed: 1 heating, 2 unloading, 3 loading |
| 7 | Object skip sent only the new parts | fixed: already skipped plus new |
| 8 | Upload answer not checked | fixed: codes 19001–19011 explained |
| 9 | Drying presets above the ACE Pro limit | fixed: official presets |
| 10 | Light state unknown until it changes (no `light/query`; its answer must not count as a trigger tap) | fixed |
| 11 | `fan/report` ignored | fixed |
| 12 | `info.features` not read | logged; reading them on the Kobra 4 is in the roadmap ❓ |
| 13 | Error codes shown raw, in the printer's language | fixed: 43 common codes translated, the printer message otherwise |
| 14–16 | ACE slot statuses, slot `weight`/`edit_status`/`color_group`, drying fault 2 counted as drying | roadmap (ACE) |
| 17 | Files in printer subfolders (such as `/test_model/`) not listed | roadmap |
| 18 | `updated` snapshot fields (`print_speed_pct`, `z_comp`) ignored | roadmap |
| 19 | Flow calibration option | fixed: on by default, switch in the print dialog |
| 20 | Options shown only when `info.features` reports them | roadmap, after reading the Kobra 4 capabilities (item 12) |
| 21 | Dry in the ACE before printing (`dry_mode: 2`) | roadmap (ACE) |
| 22 | The printer's own timelapse (needs a USB drive) | roadmap |
| 23 | The printer's own AI detection | not planned: FarolPrint runs its own, and LAN cannot change the printer's settings |
| 24 | Endless spool (backup slots in `ams_box_mapping`) | roadmap (ACE) |
| 25–35 | Aux and chamber fans (controls after the check in item 25), axis position, rename, USB drive, peripherals, OTA progress, other light types, slice parameters, Kobra X spool rack, `event` reports, camera light for detection | roadmap |
| 36 | The official client connects with the per-printer `devicecrt`/`devicepk` from `/ctrl`, not the bundled Slicer certificate | to test ❓ |
| 37 | The official client publishes everything on the `web` topic; FarolPrint mostly uses `slicer` | not planned: it works |
| 38 | The official client restarts the camera with stop, ~1 s, start | roadmap |
| 39 | `print/query` answer timing unclear | to test ❓ |
| 40 | Nozzle and bed temperatures sent as two `print/update` | not planned: cosmetic |
| 41 | Speed mode 4 (`speed_factor` 1.5) in the Moonraker mapping has no source | roadmap |
| 42 | `print_time` in seconds on the S1 Max (not a supported model); Kobra X `ams_index` with an ACE unverified | to test: needs a Kobra X with an ACE ❓ |
| 43 | `/ctrl` 19002 shown as an invalid answer; any request to 18088 lights the Kobra X camera light, which "camera always on" keeps lit | roadmap |
