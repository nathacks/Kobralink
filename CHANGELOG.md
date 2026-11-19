# Changelog

## [0.21.0](https://github.com/riccardoalv/farolprint/compare/v0.20.0...v0.21.0) (2026-11-19)


### Features

* **schedule:** pick the date in a calendar and the time on a clock dial ([#56](https://github.com/riccardoalv/farolprint/issues/56)) ([8625043](https://github.com/riccardoalv/farolprint/commit/86250436c916dce2e73674dde186bc64f6045f45))

## [0.20.0](https://github.com/riccardoalv/farolprint/compare/v0.19.0...v0.20.0) (2026-11-18)


### Features

* **schedule:** pick the time from a 24 h grid grouped by period of the day ([#54](https://github.com/riccardoalv/farolprint/issues/54)) ([fff2f46](https://github.com/riccardoalv/farolprint/commit/fff2f4644b3e7c621e377a3a2d2114309ac79677))

## [0.19.0](https://github.com/riccardoalv/farolprint/compare/v0.18.0...v0.19.0) (2026-11-18)


### Features

* **schedule:** replace the native date and time input with a picker ([#52](https://github.com/riccardoalv/farolprint/issues/52)) ([fbbeb3c](https://github.com/riccardoalv/farolprint/commit/fbbeb3c7ccdc83affc1a965c0a15604f5445bb68))


### Bug Fixes

* **print:** open the print dialog for a file sent while printing ([#51](https://github.com/riccardoalv/farolprint/issues/51)) ([f1308c4](https://github.com/riccardoalv/farolprint/commit/f1308c42264f302857dbcfd1a5cc794311267a79))

## [0.18.0](https://github.com/riccardoalv/farolprint/compare/v0.17.0...v0.18.0) (2026-11-17)


### Features

* **files:** show the estimated cost before printing ([#49](https://github.com/riccardoalv/farolprint/issues/49)) ([74c6bb5](https://github.com/riccardoalv/farolprint/commit/74c6bb5ef1f394569720b1ec1733cf1d265353e7))

## [0.17.0](https://github.com/riccardoalv/farolprint/compare/v0.16.1...v0.17.0) (2026-11-17)


### Features

* **history:** show prints as cards with a preview and a cost breakdown ([#47](https://github.com/riccardoalv/farolprint/issues/47)) ([0f21e2a](https://github.com/riccardoalv/farolprint/commit/0f21e2af40ec260d750987b134dd9b4150d256b4))

## [0.16.1](https://github.com/riccardoalv/farolprint/compare/v0.16.0...v0.16.1) (2026-11-01)


### Bug Fixes

* **queue:** start the next file right away from the light trigger ([#45](https://github.com/riccardoalv/farolprint/issues/45)) ([5a771fc](https://github.com/riccardoalv/farolprint/commit/5a771fc827af88d8d325932f973c4265966e0089))

## [0.16.0](https://github.com/riccardoalv/farolprint/compare/v0.15.0...v0.16.0) (2026-11-01)


### Features

* pick the printer smart plug in Home Assistant ([#43](https://github.com/riccardoalv/farolprint/issues/43)) ([c9a9df0](https://github.com/riccardoalv/farolprint/commit/c9a9df01c127366792f180c6a21098c9548f06d1))

## [0.15.0](https://github.com/riccardoalv/farolprint/compare/v0.14.1...v0.15.0) (2026-11-01)


### Features

* measure the energy of each print from Home Assistant ([#41](https://github.com/riccardoalv/farolprint/issues/41)) ([5825723](https://github.com/riccardoalv/farolprint/commit/5825723ed2f99fba3e81001c9abba374e75a521f))

## [0.14.1](https://github.com/riccardoalv/farolprint/compare/v0.14.0...v0.14.1) (2026-10-30)


### Bug Fixes

* **notifications:** show a visible link in Discord and ntfy ([#39](https://github.com/riccardoalv/farolprint/issues/39)) ([46d3c4e](https://github.com/riccardoalv/farolprint/commit/46d3c4e7e948b4d765ae70587895d6e0f5e8a523))

## [0.14.0](https://github.com/riccardoalv/farolprint/compare/v0.13.0...v0.14.0) (2026-10-30)


### Features

* **queue:** clearer automatic start with a configurable wait ([#36](https://github.com/riccardoalv/farolprint/issues/36)) ([61e68fb](https://github.com/riccardoalv/farolprint/commit/61e68fbf9f19c2c474c8cef5b4fc7d5512f63d83))

## [0.13.0](https://github.com/riccardoalv/farolprint/compare/v0.12.0...v0.13.0) (2026-10-30)


### Features

* show the server time zone for time-based automations ([50dc698](https://github.com/riccardoalv/farolprint/commit/50dc69850fdf83404e33ce08ffbe35af828f7962))
* **web:** highlight unsaved changes with a save bar ([50dc698](https://github.com/riccardoalv/farolprint/commit/50dc69850fdf83404e33ce08ffbe35af828f7962))


### Bug Fixes

* **queue:** stop refusing files over an empty printer model or a colour ([50dc698](https://github.com/riccardoalv/farolprint/commit/50dc69850fdf83404e33ce08ffbe35af828f7962))

## [0.12.0](https://github.com/riccardoalv/farolprint/compare/v0.11.0...v0.12.0) (2026-10-30)


### Features

* redesign the dashboard with one queue, richer statistics and automations ([#32](https://github.com/riccardoalv/farolprint/issues/32)) ([ac90f22](https://github.com/riccardoalv/farolprint/commit/ac90f222a08adeaf21144d5b23060fcbbe20f63b))

## [0.11.0](https://github.com/riccardoalv/farolprint/compare/v0.10.0...v0.11.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* remove the Electron desktop app, FarolPrint runs only as Docker + web

### Features

* log the task settings sent with every print start ([9374b29](https://github.com/riccardoalv/farolprint/commit/9374b2945efe8e1bd51a95ddbea781b2047890f2))


### Bug Fixes

* **queue:** keep the print dialog options for queued files ([9374b29](https://github.com/riccardoalv/farolprint/commit/9374b2945efe8e1bd51a95ddbea781b2047890f2))


### Refactoring

* remove the Electron desktop app, FarolPrint runs only as Docker + web ([9374b29](https://github.com/riccardoalv/farolprint/commit/9374b2945efe8e1bd51a95ddbea781b2047890f2))

## [0.10.0](https://github.com/riccardoalv/farolprint/compare/v0.9.0...v0.10.0) (2026-10-28)


### Features

* redesign the printer page and stream the camera at native quality ([#28](https://github.com/riccardoalv/farolprint/issues/28)) ([16ee875](https://github.com/riccardoalv/farolprint/commit/16ee87589dae31c2dea4afb7eea4e4656692ecd6))

## [0.9.0](https://github.com/riccardoalv/farolprint/compare/v0.8.2...v0.9.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* Docker image, package names and `FAROLPRINT_*` environment variables are renamed; `KOBRALINK_*` keeps working as a fallback.

### Features

* bed-clear hold, scheduled prints, maintenance, costs, failure archive and pt-br ([#22](https://github.com/riccardoalv/farolprint/issues/22)) ([50ad913](https://github.com/riccardoalv/farolprint/commit/50ad913f16d79c21c32c23157226c0fd6c5b7a2d))


### Refactoring

* rename the project to Farol Print ([#26](https://github.com/riccardoalv/farolprint/issues/26)) ([78f5f9b](https://github.com/riccardoalv/farolprint/commit/78f5f9b11217f16cca7624ab4a4d132d6779a8ae))

## [0.8.2](https://github.com/riccardoalv/farolprint/compare/v0.8.1...v0.8.2) (2026-10-25)


### Bug Fixes

* **bridge:** reuse the OrcaSlicer upload when confirming the print dialog ([#20](https://github.com/riccardoalv/farolprint/issues/20)) ([8d7d04c](https://github.com/riccardoalv/farolprint/commit/8d7d04c1aa397b6657f529f0ddd600dd3ee04401))

## [0.8.1](https://github.com/riccardoalv/farolprint/compare/v0.8.0...v0.8.1) (2026-10-25)


### Bug Fixes

* partial updates no longer reset other settings to defaults ([#18](https://github.com/riccardoalv/farolprint/issues/18)) ([c8cf0c6](https://github.com/riccardoalv/farolprint/commit/c8cf0c64e84b9b83630a05db01d77ded282e3732))

## [0.8.0](https://github.com/riccardoalv/farolprint/compare/v0.7.1...v0.8.0) (2026-10-25)


### Features

* 3D preview and per-print options in the print dialog ([#16](https://github.com/riccardoalv/farolprint/issues/16)) ([30fb48b](https://github.com/riccardoalv/farolprint/commit/30fb48bf6203b58221e2417ecf53cfc78d6c7653))

## [0.7.1](https://github.com/riccardoalv/farolprint/compare/v0.7.0...v0.7.1) (2026-10-25)


### Bug Fixes

* compact filament tiles, file material in stats, no camera restart ([#14](https://github.com/riccardoalv/farolprint/issues/14)) ([58bae82](https://github.com/riccardoalv/farolprint/commit/58bae82e19c5ac5b0fd40ce2ae1c9bd83105db98))

## [0.7.0](https://github.com/riccardoalv/farolprint/compare/v0.6.0...v0.7.0) (2026-10-24)


### Features

* keep the printer camera on by default ([#12](https://github.com/riccardoalv/farolprint/issues/12)) ([f443796](https://github.com/riccardoalv/farolprint/commit/f44379699fe4689708d5114dbc7a5704a48686d8))

## [0.6.0](https://github.com/riccardoalv/farolprint/compare/v0.5.0...v0.6.0) (2026-10-24)


### Features

* **web:** flat spool disc with a progress bar ([#10](https://github.com/riccardoalv/farolprint/issues/10)) ([496205c](https://github.com/riccardoalv/farolprint/commit/496205c353a99b55e3cf2623b6aa59ba0e09c7e2))

## [0.5.0](https://github.com/riccardoalv/farolprint/compare/v0.4.0...v0.5.0) (2026-10-24)


### Features

* **web:** draw filament slots as spools ([#6](https://github.com/riccardoalv/farolprint/issues/6)) ([88c7822](https://github.com/riccardoalv/farolprint/commit/88c782262eefe4d5b01159e93daab9adb8d659aa))
* **web:** side view of the spool with one filament layer per 10 percent ([#9](https://github.com/riccardoalv/farolprint/issues/9)) ([ec3c45b](https://github.com/riccardoalv/farolprint/commit/ec3c45b6cb018016e946cb60bf7d75c263f1b541))
* **web:** spool illustration that shows colour and how much is left ([#8](https://github.com/riccardoalv/farolprint/issues/8)) ([abb8562](https://github.com/riccardoalv/farolprint/commit/abb8562ee8347ca1e5d3c88a04fcf2cc4919c21d))

## [0.4.0](https://github.com/riccardoalv/farolprint/compare/v0.3.6...v0.4.0) (2026-10-24)


### Features

* external spool slot for printers without an ACE ([90dba93](https://github.com/riccardoalv/farolprint/commit/90dba931cd8c01ff35c2d55fa0bd676468ae22c7))
* report the printer's real model instead of a hardcoded Kobra X ([6f39b48](https://github.com/riccardoalv/farolprint/commit/6f39b485093fe08ceb810846cc3ef09d80ef35f9))
* **web:** large previews and readable names for print files ([#3](https://github.com/riccardoalv/farolprint/issues/3)) ([6bbd0af](https://github.com/riccardoalv/farolprint/commit/6bbd0af0ecb8259b4a360d5916aa5015825fce0a))
* **web:** printer cards with camera, job progress, temperatures and filament ([#4](https://github.com/riccardoalv/farolprint/issues/4)) ([0915444](https://github.com/riccardoalv/farolprint/commit/091544422e50efbdf15b68bb940890124a240f32))


### Bug Fixes

* keep unsaved settings when a single settings card is saved ([87b4cc3](https://github.com/riccardoalv/farolprint/commit/87b4cc3d06618fe0c1682aa44f00efa924df7e83)), closes [#2](https://github.com/riccardoalv/farolprint/issues/2)
* **spoolman:** track filament usage on printers without an ACE ([60365ba](https://github.com/riccardoalv/farolprint/commit/60365ba948cdf4af4c8bc9c07d6aa70ed458b481))

## Changelog

Releases of this fork are generated by [release-please](https://github.com/googleapis/release-please) from
Conventional Commits. Versions up to 0.3.6 are the original project's
([NatHacks/Kobralink](https://github.com/NatHacks/Kobralink/releases)).
