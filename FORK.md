# Fork: NikNikolaenkov/webui

Stalwart WebUI (admin and account pages) for `mail.servgc.space`, **with Ukrainian**.
Upstream: [stalwartlabs/webui](https://github.com/stalwartlabs/webui). License: AGPL-3.0-only (fork files) on top of upstream `AGPL-3.0-only OR LicenseRef-SEL`; headers of upstream files are unchanged.

## Branches

- `main` — exact mirror of upstream `main` (pushed by the nightly workflow, never edited by hand).
- `uk` — default branch: upstream `main` + the fork changes below.

## Fork changes

| File | Why |
|---|---|
| `src/i18n/uk.json` | Ukrainian UI strings (i18next) |
| `src/i18n/schema/translate.ts` | client-side translation of the server schema (`/api/schema`) by a dictionary keyed by schema path; identifiers never change; a changed English original shows English |
| `src/i18n/schema/load.ts` | loads `schema/uk.json` lazily for accounts with locale `uk`/`uk-UA` |
| `src/i18n/schema/uk.json` | the schema dictionary: path → `{en, uk}` |
| `src/i18n/index.ts` | registers `uk`, default language `uk` (the account locale switches it after sign-in) |
| `src/data/session.ts` | translates the schema before it reaches the store |
| `src/components/layout/TopBar.tsx`, `Sidebar.tsx` | section names (Management/Settings/Account are route ids) shown through `t('layouts.<name>')` |
| `tests/i18n/*.test.ts` | `node --experimental-strip-types --test tests/i18n/*.test.ts` |
| `tools/i18n/schema-sync.ts`, `ui-sync.ts` | coverage reports; `schema-sync --write` adds new schema strings to the dictionary |
| `docs/i18n/glossary.md` | terminology (main copy; NikNikolaenkov/webmail follows it) |
| `.github/workflows/uk-sync-release.yml` | nightly sync and release |

Upstream `build.yml` is disabled in this repository's Actions settings.

## How it updates

Every night at 02:00 UTC `uk-sync-release.yml` merges upstream `main` into `uk`; on a conflict it opens an issue «Конфлікт злиття з апстрімом» and stops. Otherwise: typecheck, eslint, fork tests, coverage report (UI strings and the schema of `STALWART_TAG`, non-blocking — untranslated strings show in English), `npm run build`, release `uk-v<version>-<run>` and rolling `uk-latest` with `webui.zip`.
The mail server downloads `https://github.com/NikNikolaenkov/webui/releases/download/uk-latest/webui.zip`.

New server version: bump `STALWART_TAG` in the workflow, then
`node --experimental-strip-types tools/i18n/schema-sync.ts schema.json src/i18n/schema/uk.json --write` and translate the new entries (`uk: ""`).

Secret `SYNC_TOKEN`: fine-grained PAT on this repository with Contents and Workflows read/write.
