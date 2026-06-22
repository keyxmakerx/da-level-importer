# Consolidated Audit Findings

Four read-only audits: one round-1 correctness pass on the importer core, and three
round-2 strategy-lens passes (native-overlap, integration-robustness, DA-value). Organized
by **action**. Every item is `file:line` grounded; native claims were verified against v14
sources.

---

## A. Must-fix bugs (fix regardless of direction)

1. **Scene `fog.mode: 1` is not a v14 field** — `da-importer.js:294`. v14 uses fog
   *exploration* modes (Disabled/Individual/Shared) via `fog.exploration`, not numeric
   `mode`. Can fail `Scene.create` validation → **aborts the whole import**. *(round-1, S2-C3, S3)*
2. **Unguarded wall coordinates** — `da-importer.js:460` (`c: daWall.c`) + loop `:272`. A
   non-finite/missing `c` in any floor's JSON aborts the single `Scene.create` (**all floors
   lost**). Skip/validate malformed walls. *(round-1-C2)*
3. **Unguarded light `x/y/dim/bright`** — `da-importer.js:487-495`. Same whole-import abort
   risk. Coerce/guard. *(round-1-C3)*
4. **Region `visibility: 2` magic integer** — `region-adder.js:259`. v14 reworked Region
   visibility to named modes (default `LAYER_UNLOCKED`) + ownership. Use
   `CONST.REGION_VISIBILITY.*` or omit. *(S2-C2)*
5. **`changeLevel` behavior `system: {}`** — `region-adder.js:274-282`. Build via documented
   behavior defaults; an empty system may fail as the schema gains fields. *(S2-M3)*

Lesser correctness items: self-reference allowed in `visibility.levels` (`da-importer.js:258-260`);
`_senseEnum` coerces unknown values to NONE (`:426-430`); orphan/mismatch floors warn only to
console, not UI (`:385-387`).

## B. Cut — generic reimplementation that duplicates native (the bug/fragility surface)

1. **Edit-Levels standalone mode** — `main.js:17-23,53-58`; `importer-dialog.js:84-88,117-208,412-417`;
   `module.css:18-23`. Duplicates the native v14 **Levels tab**, has **no DA context**, keeps
   a **parallel snapshot** that silently clobbers concurrent native edits and drops unmodeled
   `Level` fields. Fails all 4 strategy tests. *(S1-C1, S2-M2, S3-#6)*
2. **Visible-Levels dropdown machinery** — `importer-dialog.js:785-868`, teardown `:428-459`.
   The densest bug surface in the codebase (body-reparented `position:fixed` + manual
   outside-click lifecycle) to edit a generic `visibility.levels`. Replace with native
   `foundry.applications.fields.createMultiSelectInput`. *(S3-#7, S2-L3)*
3. **Hand-rolled tab system** — `importer-dialog.js:330-344`; `importer.hbs:14-18`. Use native
   ApplicationV2 `static TABS`. *(S3-#14)*
4. **Region Adder bespoke canvas drawing** — `pickCanvasRectangle` `region-adder.js:88-204`
   (PIXI v7 immediate-mode in undocumented `canvas.controls`, capture-phase DOM interception).
   Fragile to PIXI v8 / canvas refactor, duplicates native region drawing, superseded by the
   portal design. Keep only the level-span binding helper. *(S1-C2, S2-H2/H3, S3-#9)*

## C. Fix native-coupling fragility (future-proofing)

1. **Sidebar DOM injection** — `main.js:39-74`. Scrapes `SceneDirectory` markup
   (`.directory-header`/`.action-buttons`); if classes move, **all entry points vanish
   silently**. Use `getSceneControlButtons`/a documented hook; fail loudly. *(S2-C1)*
2. **`getCurrentLevelId` internals probing** — `region-adder.js:48-65`. Probes 4 undocumented
   `activeLevel` paths → silently wrong floor. Use native `viewLevel`/`cycleLevel` /
   `SceneViewOptions.level`. *(S1-C3, S2-H1)*
3. **`changeLevel`-only transit can't reach a different location** — `region-adder.js:274-282`.
   Repoint onto native **`teleportToken`** (`destinations`+`revealed`) per the portal design.
   *(S1-C2)*
4. **Body-appended hover tooltips** — `importer-dialog.js:357-374,698-714`. Use native
   `dataset.tooltip`. *(S2-L3, S3-#6)*

## D. Keep / invest — the moat (DA automation native can't replicate)

1. **Import pipeline** — `da-importer.js:144-335`. One-click DA folder → native multi-level
   Scene. The product.
2. **DA-format intelligence** — pairing/sort/media-priority/orphan + mixed-folder detection
   `:344-416`; wall/light enum bridge `:426-505`.
3. **DA-aware import-time pre-fill** — filename→name, auto-stacked elevations, roof-from-filename,
   media size warning `importer-dialog.js:600-769`. Keep **at import time only**.
4. **Stairs/portal as scoped in `STAIRS-PORTAL-DESIGN.md`** — the linking layer on native
   `teleportToken` + the sight-gated player overlay. The right home for stairs energy.

## E. Docs

`ARCHITECTURE.md` documents **v0.0.6** and is wrong about the current dialog (no edit-mode,
wrong field names). Regenerate or mark provisional.
