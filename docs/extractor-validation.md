# GBFRDataTools validation

## Pinned release

The extraction adapter targets GBFRDataTools `2.0.0`, released on 2026-07-13 from commit `488513052f2e6cc60bc6a0bb277b29056b45c904`.

- Release asset: `GBFRDataTools-2.0.0-win-x64.zip`
- SHA-256: `2F355E7785D7ED7D1A4F99B1FCCC626BB9D949CE29A4F08B816A233DAB77F63B`
- Runtime requirement: Microsoft .NET 10 x64 runtime
- Upstream coverage reported by the release and local archive probe: 391,699 of 408,165 archive paths (95.97%)

Do not replace this version without repeating the sample extraction, conversion, and hash verification below. Keep the executable outside the game installation directory.

## Read-only sample workflow

Use private directories represented by placeholders. Never paste real installation paths into documentation or commit extracted output.

```powershell
GBFRDataTools.exe extract -i "<game-directory>\data.i" -o "<private-raw-directory>" -f system/table/chara.tbl
GBFRDataTools.exe extract -i "<game-directory>\data.i" -o "<private-raw-directory>" -f system/table/weapon.tbl
GBFRDataTools.exe extract -i "<game-directory>\data.i" -o "<private-raw-directory>" -f system/table/gem.tbl
GBFRDataTools.exe extract -i "<game-directory>\data.i" -o "<private-raw-directory>" -f system/table/ability.tbl
GBFRDataTools.exe tbl-to-sqlite -i "<private-raw-directory>\system\table" -o "<private-local-directory>\candidate-tables.sqlite" -v 2.0.0
```

The `extract` and `tbl-to-sqlite` commands read the installed archives and write only to the private output locations. The validation workflow must never call `add-external-files` because it modifies `data.i`.

## Results from 2026-07-15

The pinned release successfully opened the current local archive and converted these candidate tables:

| Public category | Source candidate           | SQLite table | Rows  | Columns | Finding                                                        |
| --------------- | -------------------------- | ------------ | ----- | ------- | -------------------------------------------------------------- |
| Characters      | `system/table/chara.tbl`   | `chara`      | 41    | 45      | Viable structural source; display-name joins remain to map     |
| Weapons         | `system/table/weapon.tbl`  | `weapon`     | 410   | 73      | Viable structural source; ownership and text joins remain      |
| Sigils          | `system/table/gem.tbl`     | `gem`        | 1,034 | 22      | Viable sigil candidate; category and localization need mapping |
| Skills          | `system/table/ability.tbl` | `ability`    | 278   | 14      | Viable ability candidate; character and text joins remain      |

`system/table/skill.tbl` was extracted but did not convert. GBFRDataTools reported that the table was larger than its expected layout. Treat `skill.tbl` as incompatible with release `2.0.0`; do not silently discard it or infer its schema. The importer should start from `ability.tbl` for the skill candidate set while keeping the `skill.tbl` incompatibility visible as a structured import warning.

Korean display names are not established by these four structural tables. Localization message paths and identifier joins require a separate mapping investigation before normalized records can be published.

## Configuration and preflight

Copy `.env.example` to a private `.env` and provide machine-specific values there. The adapter accepts only the pinned extractor version and checks that:

- `GBFRDataTools.exe`, `data.i`, and `data.0` exist;
- the extractor is outside the game installation directory;
- the private output is a directory or a not-yet-created path;
- the private output is outside the game installation directory.

The preflight output uses stable English error codes and Korean messages without echoing local paths. Passing preflight does not authorize extraction or publication; both remain explicit operations.

After loading the private environment variables into the current shell, run:

```bash
pnpm --filter @relink-wiki/extractor preflight
```
