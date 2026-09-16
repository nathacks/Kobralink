---
name: add-locale
description: Add a new UI language (locale) to Kobralink — creates the Paraglide message file, wires the locale into shared/api/web/desktop and verifies parity. Use when the user asks to add, translate or support a new language (e.g. "ajoute le japonais", "add pt-br", "support Dutch").
---

# Add a locale to Kobralink

Arguments: `<tag> [English name]` — e.g. `/add-locale ja Japanese`, `/add-locale pt-br "Brazilian Portuguese"`.

Locale tags are **lowercase BCP-47** (`ja`, `nl`, `pt-br`, `zh-tw`). Paraglide matches `navigator.languages` case-insensitively, the API resolves `Accept-Language` through `resolveLocale()` (full tag first, then base language), so `pt-BR` in a browser resolves to `pt-br`.

## Steps

1. **Register the locale** in `packages/i18n/project.inlang/settings.json` → append the tag to `locales` (keep `fr` first, it is `baseLocale`).

2. **Register it in shared** — `packages/shared/src/settings.ts` → append the tag to `APP_LOCALES`. This drives the `settings.locale` Zod enum (notification language) and the `<Select>` in `apps/web/src/components/settings/general-card.tsx`. Must stay identical to the inlang `locales` list.

3. **Add the label key** in **every** existing message file (`packages/i18n/messages/*.json`), right after the other `locale_*` keys. Key = `locale_` + tag with `-` replaced by `_`. Value = the language's **endonym** (name in its own language), identical in every file:
   ```json
   "locale_ja": "日本語",
   ```

4. **Create `packages/i18n/messages/<tag>.json`** by translating `fr.json` (base) — cross-check with `en.json` for ambiguous phrases. Rules:
   - Keep `"$schema"` as first line, keep the exact key order of `fr.json`.
   - Keep every `{placeholder}` verbatim; never translate placeholder names.
   - Plural entries (`declarations` / `selectors` / `match`) keep the same structure and the same `=one` / `=other` categories. Languages without plural forms (zh, ja, ko…) still keep both keys with the same text.
   - Never translate: product names (Kobralink, OrcaSlicer, Moonraker, Klipper, Spoolman, Fluidd, Mainsail, Obico, Home Assistant, ACE, Kobra X), protocol/API words (MQTT, GCode, `X-Api-Key`, `/api/camera/*`, `machine-ip`, `localhost`), unit suffixes, the `desktop_issue_body` Markdown skeleton and the backtick code (`bun run build`, `` `{log}` ``).
   - Keep typography native to the language (guillemets « » for fr/es/it, „“ for de, “” for zh, full-width punctuation for zh).
   - "Bridge" stays *bridge* in latin languages; zh uses 桥接.
   - Sensible tone: informal "tu" in es/it/fr-style UIs, "Sie" in de, neutral in zh.

5. **Wire the web side** — `apps/web/src/lib/i18n.ts`:
   - `import 'dayjs/locale/<dayjs-tag>';` (dayjs uses lowercase tags too: `ja`, `pt-br`, `zh-tw`; check `node_modules/dayjs/locale/` if unsure).
   - Add the entry to `LOCALE_LABEL` (`'<tag>': m.locale_<tag_with_underscores>`).
   - Add the entry to `INTL_LOCALE` (`'<tag>': '<Intl tag>'` e.g. `ja: 'ja-JP'`, `'pt-br': 'pt-BR'`). Both records are typed `Record<Locale, …>` so TypeScript fails until both are filled.

6. **README.md** — update the "UI in …" bullet and the `packages/i18n` row of the layout table.

7. **Verify**:
   ```bash
   bun run --filter @kobralink/i18n build && bun run --filter @kobralink/shared build
   bun run check-types
   bun run lint
   ```
   Then run the parity script below: it must print no missing/extra keys and no placeholder diff for every locale.
   ```bash
   python3 - <<'PY'
   import json,re,glob,os
   base=json.load(open('packages/i18n/messages/fr.json'))
   def ph(v):
       if isinstance(v,str): return set(re.findall(r'\{(\w+)\}',v))
       return {p for var in v for m in var['match'].values() for p in re.findall(r'\{(\w+)\}',m)}
   for f in sorted(glob.glob('packages/i18n/messages/*.json')):
       d=json.load(open(f)); l=os.path.basename(f)[:-5]
       print(l,'missing',set(base)-set(d),'extra',set(d)-set(base),'placeholders',[k for k in base if k in d and ph(base[k])!=ph(d[k])])
   PY
   ```

## What NOT to touch

- `apps/api/src/i18n/locale.ts` and `apps/desktop/src/shared/locale.ts` read `locales` from the compiled runtime — nothing to edit there.
- `apps/web/src/paraglide/` and `packages/i18n/src/paraglide/` are generated (gitignored); never edit by hand.
- Do not commit: the user commits themselves.

## Removing a locale

Reverse of the above: drop the tag from `settings.json` + `APP_LOCALES`, delete `messages/<tag>.json`, remove the `locale_<tag>` key from every remaining file, remove the `LOCALE_LABEL` / `INTL_LOCALE` entries and the dayjs import. Existing DB rows with `settings.locale = <tag>` will fail Zod validation — add a migration or a fallback in `settings.service.ts` before shipping.
