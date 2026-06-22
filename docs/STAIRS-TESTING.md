# Stairs / Portal — Implementation Status & Testing Guide

Status: **built on the branch, pending your live test.** Built on Foundry v14's
native `teleportToken` region behavior (it does the verified cross-level/cross-
position move + the confirm prompt + destination names); our code is the linking
UX, Manager, and overlays native lacks.

## Modules (`scripts/portal/`)
- **portal-core.js** — data model (a `flags."dungeon-alchemist-toolkit".portal`
  stamp `{linkId,label,mode,role}`) + `createLinkedStairs` / `linkExistingRegions`
  (create paired Regions, each carrying a native `teleportToken` behavior pointing
  at the other), mode presets, link-group + region helpers.
- **portal-wizard.js** — options prompt + the dialog-free place-then-link flow +
  direct-connect (link two selected regions).
- **portal-manager.js** — the Stairs Manager panel.
- **portal-overlay.js** — GM-only link line + portal ring markers.
- **portal-player-overlay.js** — sight-gated clickable "Stairs" labels for players.

## API (`window.DA`)
- `DA.AddStairs()` — prompt for type/label/two-way, then place entrance → switch
  level → place exit.
- `DA.AddStairs({ mode:"stairs"|"teleport"|"trap", label, twoWay })` — skip the prompt.
- `DA.LinkStairs()` — link the two currently-selected Regions into a pair.
- `DA.StairsManager()` — open the manager.
- Sidebar buttons: **DA Add Stairs / Portal**, **DA Stairs Manager**.

---

## How to test

1. **Install/update** Foundry as `dungeon-alchemist-toolkit` (point at the branch
   manifest), open a **multi-level scene** (import a DA folder, or any scene with ≥2 Levels).
2. **Create stairs:** *DA Add Stairs / Portal* → choose **Stairs** → click/drag to
   place the **entrance** on floor 1 → switch to floor 2 → click/drag the **exit**.
3. **Use them (GM):** drag a token onto the entrance → expect a native **"teleport?"
   confirm** → token lands at the floor-2 exit.
4. **Teleport mode:** same flow but place **both ends on the same level** → same-map
   teleport; the GM overlay should draw a **faint line** between the two ends.
5. **Trap:** `DA.AddStairs({mode:"trap"})` → hidden, silent, one-way (walk in → moved, no prompt).
6. **Manager:** *DA Stairs Manager* → see the link; click an **end** to pan/select it;
   **edit** opens the region sheet; **delete** removes both ends.
7. **Player labels:** as a *player* who owns a token, walk near a visible stair → a
   **"Stairs" label** should appear once it's in sight + range → **click** it to use.
8. **Direct-connect:** select two existing Regions (Regions layer, click + shift-click)
   → `DA.LinkStairs()` → they become a pair.

---

## Verify-live flags (where a tweak is most likely)

Foundry's API site was egress-limited during the build, so a handful of leaf
details are inferred from release notes. If something misbehaves it's almost
certainly one of these — each a small, localized fix:

1. **`teleportToken` system schema** — `portal-core.js` `buildTeleportBehavior`
   emits `system: { destinations:[regionUUID], choice, revealed }`. If the
   **move/confirm never fires**, check `CONFIG.RegionBehavior.dataModels.teleportToken.schema`
   (or an existing teleport region's `behaviors[0].system`) and adjust the field names.
2. **Level-view API** — `portal-manager.js` `viewLevel` (and the overlay's
   "current level") is best-effort. If **select-&-pan doesn't switch floors** or the
   GM line shows on the wrong level, tell me the live v14 "view this level" call.
3. **LOS test** — `portal-player-overlay.js` `hasSight` uses
   `canvas.visibility.testVisibility(point,{object:token})`. If labels show through
   walls (or never show), this is the spot.
4. **Click-to-use nudge** — `usePortal` moves the token onto the region so native
   teleport fires. If clicking the label doesn't trigger it, the region-enter
   semantics differ and I'll switch to calling the behavior directly.
5. **Canvas layers / PIXI** — overlays attach to `canvas.controls` / `canvas.interface`
   with PIXI v7 Graphics; all feature-detected. Worst case is "no overlay," never a crash.

## Known *native* behaviors (not bugs in our code)
- Two linked teleport regions can ping-pong (native [#10887](https://github.com/foundryvtt/foundryvtt/issues/10887)) — core handles re-entry; flag it if you see a loop.
- The GM's *view* may not auto-follow a cross-level teleport (native [#14344](https://github.com/foundryvtt/foundryvtt/issues/14344)) — a core view nit; the move itself works.

## Deferred / next
- Importer hand-rolled tabs → native `TABS` (separate from stairs; a working-code rewrite best done with live verification).
- Active-level-change overlay redraw (no confirmed hook yet — re-open the Manager or pan to refresh).
- Cross-level links draw a per-end **ring marker** (a connecting line needs both ends on one level).
- Once you confirm the schema in #1, I'll bump to **v0.2.0** and add the CHANGELOG entry.
