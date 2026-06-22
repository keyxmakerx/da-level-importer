# Rebrand / Spin-off Plan

**Decision:** full rebrand — new module id, new package identity, migration shim. Goal:
spin this off as its own project (a **Dungeon Alchemist → Foundry v14 import toolkit**),
distinct from the upstream module it was forked from.

---

## 1. Good news: the migration is essentially free

Audited every bit of persistent state keyed to the module id:
- **One** client-scoped setting — `SETTING_IMPORTER_DEFAULTS` (`main.js:8-13`), the dialog's
  last-used defaults, stored **per-browser**, not in world data.
- **Zero** document flags — every Scene/Level/Wall/Light/Region is created with `flags: {}`;
  there is **no `setFlag`/`getFlag` anywhere** in the codebase.

⟹ Changing the module id triggers **no world-data migration**. The only thing keyed to the
id is one convenience setting; losing it just re-defaults the dialog once. Effectively free.

## 2. The three identities (and why a *new id* is required, not optional)

| Identity | Action | Who |
|---|---|---|
| **GitHub repo** `keyxmakerx/da-level-importer` | Rename in repo settings (GitHub auto-redirects old URLs). | **You** (I can't; not a git op) |
| **Module id** `da-level-importer` | **New id.** Required: the upstream's `da-level-importer` id is registered to the original author; a distinct published spin-off **must** use a new id. | I change in-repo |
| **Foundry package** | Register a **new** package under the new id. (The fork was never the published `da-level-importer` package — that's the original author's.) | **You** register; I prep manifest |

## 3. Mechanical change surface (small — `MODULE_ID` is a single constant)

- `scripts/constants.js:2` — `MODULE_ID` (one line; auto-propagates to the settings namespace,
  the `game.modules.get(id).api` registration, and any future flags namespace).
- `module.json` — `id` (`:2`), `title` (`:3`), `url` (`:24`), `manifest` (`:25`), `download` (`:26`).
- Hardcoded template paths → new id: `importer-dialog.js:113`, `region-adder-dialog.js:42`.
- `README.md` (title, manifest URL, credits) and the API-path comment `region-adder-dialog.js:16`.
- `docs/*` references (ARCHITECTURE is regenerated anyway per `AUDIT.md` §E).

Total ≈ 6 files, mostly one-liners.

## 4. Migration shim (optional, ~10 lines)

On `ready`: if the new-id client setting is empty and the old `da-level-importer` one exists,
copy it across. Or skip it — the only cost is the dialog defaults resetting once.

## 5. Attribution & license (GPLv3 fork — do this right)

- Stays **GPLv3** (the fork's license requires it; no relicensing).
- **Keep crediting the original author** (Mestre Digital): preserve in `README` + add a
  `NOTICE`/credits section stating this is a fork with substantial changes.
- GPLv3 explicitly permits the fork/rename/redistribution; the only obligations are *keep it
  GPLv3* and *preserve attribution*. Both honored.

## 6. Name — DECIDED ✅

- **Title:** Dungeon Alchemist Toolkit
- **Module id:** `dungeon-alchemist-toolkit`
- **Target repo:** `keyxmakerx/dungeon-alchemist-toolkit` (rename the GitHub repo to match).

Positions the project as a *suite* — import automation + native-built stairs/portals +
DA-aware conveniences — per the strategy.

## 7. Sequencing — bundle as a clean **v0.1.0** relaunch

A full rebrand is the moment to ship the audit-driven cleanup so the new project launches
clean (details in `AUDIT.md`):

1. **Fix the must-fix import bugs** — `fog.mode`, unguarded wall/light coords, `visibility:2`
   (`AUDIT.md` §A).
2. **Cut the redundant editors** — Edit-Levels mode, Visible-Levels dropdown machinery,
   hand-rolled tabs (`AUDIT.md` §B). Keep the DA-aware pre-fill at import time.
3. **De-fragilize native coupling** — sidebar buttons via `getSceneControlButtons`,
   level detection via native nav (`AUDIT.md` §C).
4. **Apply the rebrand** — id/title/URLs/template paths + attribution (§3, §5).
5. **Regenerate `ARCHITECTURE.md`; tag `v0.1.0`** under the new identity.
6. **Register the new Foundry package** (you), repoint the manifest.
7. **Then** build the stairs/portal feature on the clean, native-first foundation
   (`STAIRS-PORTAL-DESIGN.md`).

## 8. To start executing, I need from you

1. **The name** (title + machine id).
2. Go-ahead on the §7 sequence (esp. that cutting Edit-Levels mode + the region drawing is
   acceptable — both are audit-sanctioned).

Then I run §3–§5 + the §7 trims on the branch; you handle the GitHub repo rename and the new
package registration (owner-only actions).
