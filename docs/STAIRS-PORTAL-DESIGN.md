# Stairs / Portal System — Design Spec

**Status:** Proposal, awaiting sign-off. Nothing here is built yet.
**Supersedes:** the current "DA Add Stairs / Elevator" tool (`region-adder*.js`).

**Decisions locked with the maintainer:**
- **Design doc first**, then build in phases. Document *everything* — file layout, hooks,
  registration points — so neither of us re-investigates the code (this doc is the single
  reference; see §13 Implementation Map).
- **Follow community norms / go native where the majority does.** Research (§3) shows the
  modern, widely-used path is **native v14 Region behaviors** (`teleportToken`) on **native
  Levels**. We build on those and add the UX layer they lack.
- **Player prompts:** native **`DialogV2.query`** (zero dependency). **socketlib is NOT a
  required dependency** — native region behaviors + `DialogV2.query` cover our needs;
  socketlib stays only as a documented fallback.
- **Linking:** support **both** a **place-then-link wizard** *and* a **direct on-canvas
  connect** (click stair A → click stair B). Editing is **first-class** (a Stairs Manager,
  §6), not a one-shot wizard.
- **Account for the whole v14 native surface and avoid conflicts** — build on native Levels,
  Regions V2, native behaviors, and level-aware navigation; do **not** duplicate the native
  Levels tab or Placeables tab (§4.1).

## Contents
1. Why the current tool has to change
2. The unifying idea
3. Prior art — what others do, and how we align
4. Architecture — build on native, add the layer
5. Creation & linking (wizard + direct connect)
6. Editing & the Stairs Manager
7. Player-facing overlay (sight-gated, clickable) + trigger modes
8. Runtime flow
9. GM-only link overlay
10. Transport — researched decision
11. Performance on huge maps
12. Data model
13. Implementation map — files, hooks, registration
14. Open questions / live-v14 verification
15. Migration
16. Phased build plan
17. Out of scope

---

## 1. Why the current tool has to change

Today a "stair" is **one Region bound to several levels** with core `changeLevel`, which
can only move a token to **the same (x, y) on the adjacent level**. The hard requirement —
*"the up stairs may not be in the same location as the down stairs"* — is impossible there.
A stair must store a **destination position**, not just a destination level.

## 2. The unifying idea

A **portal** is a Region that teleports an entering/clicking token to a **linked**
destination region's **spot + level**. Portals linked together form a group.
- **Stairs** = linked regions on **different levels**.
- **Teleport** = linked regions on the **same level** ("one big map, go to this spot").
- **Trap** = one-way, hidden, auto-on-enter, no prompt.

These are **presets over the same primitives** (a destination + a few toggles).

---

## 3. Prior art — what others do, and how we align

The maintainer asked me to research what the community actually uses and match it. Findings:

| Module / feature | What it does | What we borrow |
|---|---|---|
| **Native `teleportToken` region behavior** (v13+, [#12842](https://github.com/foundryvtt/foundryvtt/issues/12842)) | Teleports a token entering region A to region B — different spot, **level, or scene**. v13 added **`destinations` (plural)** + **`revealed`** to **show names & let the player choose**. | **The movement engine.** Multi-destination, name reveal, and player choice come *free* and native. |
| **Stairways** ([pkg](https://foundryvtt.com/packages/stairways/)) | Click to place; **paired by a shared name**; **connecting line** drawn between ends; config sheet (double-click) to set icon/name; **players see them like doors and teleport on click**. | Our **sight-gated clickable player overlay** and **DM link line** mirror this proven UX. |
| **Monk's Active Tile Triggers** ([pkg](https://foundryvtt.com/packages/monks-active-tiles/)) | Trigger on **click** *or* **token-enter**; huge action list incl. teleport + elevation. | Confirms **dual trigger modes** (click vs enter) are the expected norm. |
| **Region Behaviour Adjustments** ([regionba](https://foundryvtt.com/packages/regionba)) | Set a destination **[scene, level, x, y] by clicking the target**; "next higher/lower level" modes. | Validates our **direct click-to-connect** linking UX. |
| **Multilevel Tokens** ([repo](https://github.com/grandseiken/foundryvtt-multilevel-tokens)) | Mirrors tokens between "in"/"out" regions at the **relative position**. | Idea: land at the **relative position** within the destination, not just its center (nice-to-have). |
| **socketlib** ([pkg](https://foundryvtt.com/packages/socketlib)) | The de-facto socket abstraction; very widely used for custom GM↔player RPC. | Kept as **fallback only** — native behaviors + `DialogV2.query` mean we don't need custom RPC. |

**Takeaway:** the community has converged on **native Regions + `teleportToken`** for the
movement, with **click-or-enter** triggers and **click-the-target** linking. We adopt all of
that and differentiate on the **management UX** (linking tools, Stairs Manager, sight-gated
clickable overlay, DM link line, traps/confirm).

---

## 4. Architecture — build on native, add the layer

**Foundation (native, "what others do"):**
- **Native Scene Levels** (already used by the importer) for the floors.
- **Native `teleportToken` region behavior** for the move + `destinations` + `revealed`
  name/choice. Each stair is a Region with this behavior pointing at its linked region(s).

**Our value-add layer (what native lacks):**
1. **Linking tools** (§5) that auto-configure the native behavior's `destinations` on
   **both** ends (bidirectional) so the DM never hand-edits UUIDs.
2. **Stairs Manager** (§6) — a per-scene, all-levels thumbnail index to find/select/edit.
3. **Sight-gated clickable player overlay** (§7) — the headline player feature.
4. **DM-only link line** overlay (§9).
5. **Trigger modes + confirm/trap** (§7) — click-to-use (verified), auto-on-enter
   (seamless/trap), optional `DialogV2.query` confirm.

**Resilience:** if the live-v14 `teleportToken` can't set the destination *level/elevation*
the way we need, we fall back to our **own GM-side move** (a thin `daPortal` companion
behavior) — which we already need for click-to-use anyway. So we're covered either way (§8,
§14).

### 4.1 v14 native landscape — build on, don't duplicate

v14 is a large release; the spec must **extend** it, never collide. Native features and our
stance on each:

| v14 native feature | Our stance |
|---|---|
| **Scene Levels** + a **Levels tab in Scene Config** (add/edit elevation ranges, sublevel visibility) | **Build on** — stairs target native Levels. ⚠️ **Conflict to resolve:** the importer's separate **"DA Edit Levels" dialog (0.0.14) now overlaps the native Levels tab.** Decide: retire it, or trim it to import-time conveniences native lacks (filename-naming, drag-reorder, roof shortcut, media preview). Tracked separately from this doc. |
| **Level-aware Scene Navigation** (`viewScene` / `viewLevel` / `cycleLevel`) | **Use these** for the Manager's "switch to level" and post-teleport view changes. No custom level switching. |
| **Regions V2** (Templates → Regions; new UI, Behaviors, token-attach; **Ring/Emanation** shapes) | **Build on** — portals are Regions; support native shapes (not rectangle-only); our behavior registers into the **native Behaviors UI** (coexist, no parallel system). |
| **Native behaviors:** `TeleportToken` (`destinations`+`revealed`), `ChangeLevel`, `DefineSurface`, `ExecuteScript/Macro`, `ModifyMovementCost`, `ToggleBehavior` | **`TeleportToken`** = movement engine (different-location stairs). **`ChangeLevel`** = optional same-spot floor change. **`DefineSurface`** already blocks areas — we don't reinvent it. |
| **Native Placeables sidebar tab** (active-level content) | **Differentiate** — the Stairs Manager is stairs-only, **cross-level**, with thumbnails + linking. Complements, doesn't duplicate. |
| **Pop-out support** (ApplicationV2) | Free win — the Manager/wizard pop out into their own window. |
| **Fog exploration modes** (Disabled/Individual/Shared) | Not stairs, but confirms the importer's `fog.mode` audit bug (→ `fog.exploration`); tracked in the audit. |
| Scene Levels **UI/UX explicitly "not final"** | Stay adaptable; prefer documented APIs over scraping native DOM. |

---

## 5. Creation & linking (both paths)

Identity: linked regions share a **`linkId`** (and a friendly **name**, Stairways-style)
stored in a `daPortal` flag/behavior; the native `teleportToken.destinations` are kept in
sync with the link group.

**Path A — place-then-link wizard** (guided): pick start level + toggles + preset
(Stairs/Teleport/Trap) → **place entrance** (click=1 square, drag=footprint) → **pick
destination level** → **place destination** → optionally add more destinations → done.

**Path B — direct connect** (power-user, no wizard): a toolbar toggle "**Link stairs**" →
**click stair A, then click stair B** → bound (bidirectional by default). Works across
levels (switch level between clicks). This is the "go to a level and click to connect one
stair to another" ask; built to **snap and confirm each pick** so it isn't finicky.

Both paths converge on the same bind step (mint/extend `linkId`, set anchors, sync native
`destinations`). Reuses audited helpers: `pickCanvasRectangle`, `getSceneLevels`,
`getCurrentLevelId`.

---

## 6. Editing & the Stairs Manager

Editing is first-class, served three ways:
- **Native Region editing** (Regions layer → double-click): shape, move, levels, elevation.
- **Behavior/portal sheet**: name/label, destinations, confirm, trap, trigger mode, anchor.
  Our tool injects a shortcut + a "re-link / add destination" action here.
- **Stairs Manager** (`DA.StairsManager`) — a per-scene, **all-levels** panel:
  - Every portal grouped by level (sorted by elevation); each row shows **thumbnail**,
    name, level, **mode badge**, one-way arrow, **link partner(s)**.
  - Actions: **Select & pan** (switch level + pan + select), **Edit**, **Delete**
    (optionally the partner), **Go to partner**, plus **Add** / **Link** (launch §5).
  - **Thumbnails phased:** v1 = schematic (icon + level + coords); v2 = **rendered crop** of
    the scene background under the region, generated **on demand + cached** (§11).

---

## 7. Player-facing overlay (sight-gated, clickable) + trigger modes

Per-portal toggle **`showToPlayers`** ("Show player a window"). When on, the stair gets a
player overlay that:
1. **Appears only when the player can see it** — tied to the token's **vision/sight**
   (not revealed before the token has line of sight), and only within `revealRadius`.
2. **Hover** → shows the label (**`label`**, default "Stairs", or the DM override).
3. **Click (in range)** → uses the stair (the Stairways model): triggers the move, going
   through the confirm/picker if configured.

**Trigger modes (per portal):**
- **Click-to-use** (default for visible stairs): the player must click the overlay — the
  click *is* the verification, so no accidental triggering.
- **Auto-on-enter**: walking in triggers it (native `teleportToken`). Used for seamless
  transitions and **traps** (`hidden` + `showToPlayers: false` + no confirm = silent drop).
- **Optional confirm** (`confirm`): on either trigger, `DialogV2.query` asks
  "Go up to *Second Floor*?" (names shown when `showDestName`) or shows the multi-destination
  picker. Decline → stay put + cooldown.

Performance budget for the overlay is in §11 (own token only, current level only, debounced,
proximity-cull before the sight test).

---

## 8. Runtime flow

For **auto-on-enter** (native): the native `teleportToken` behavior handles the move; if
`confirm` is set we wrap it with a `DialogV2.query` first (else native fires directly).

For **click-to-use** (our overlay): player clicks → request to GM →
1. **Validate** the user owns the token and is in range / has sight.
2. **Re-entry guard:** ignore if the token has a fresh `portalCooldown` flag (~1s).
3. **Prompt** if `confirm` (`DialogV2.query` to that player) — confirm or pick destination.
4. **Move (GM-authoritative):** `token.update({x, y, elevation: destLevel.elevation.bottom},
   {animate:false})` to the destination anchor; set `portalCooldown`.

**Security:** writes are GM-side; the player only *requests*; we never trust client
coordinates and only move the triggering player's own token.

## 9. GM-only link overlay

On `canvasReady` / active-level change / region CRUD: group portals by `linkId`; for groups
with ≥2 members on the **current level**, draw a **translucent line** between anchors
(GM-only). Cross-level links get an **arrow/label marker** ("↑ Floor 2") per endpoint.
Event-driven redraw only — never per-frame (§11).

## 10. Transport — researched decision

- **Native `DialogV2.query(user, type, config)`** (v13+, [#12024](https://github.com/foundryvtt/foundryvtt/issues/12024); `type` ∈ `prompt`/`confirm`/`wait`, returns response or `null`) does GM→player prompting natively.
- **Native `teleportToken`** does the move (and its `revealed` flag does the name/choice picker).
- ⟹ **No socketlib dependency.** It's the community standard for *custom* RPC, but we have
  no custom RPC — native covers it, which is itself the "what others do in v13+" path.
  socketlib remains a documented fallback if a future feature needs broad RPC.
- **Performance:** all event-driven, fires only on actual stair use — independent of map size.

## 11. Performance on huge maps

- **Region events / native teleport:** O(1) on enter; re-entry guard prevents loops.
- **Link overlay (§9):** redraw only on `canvasReady`/level-change/region-CRUD; same-level
  lines only; cull off-view. Dozens of portals = a few draws.
- **Player overlay (§7):** the only continuous check — kept cheap: (a) own token only;
  (b) current-level `showToPlayers` portals only; (c) proximity cull *before* (d) the sight
  test; (e) debounced on move (~100–150 ms).
- **Manager thumbnails:** schematic free; rendered crops on demand + cached, never all at once.

---

## 12. Data model

Native `teleportToken` carries the `destinations`. We add a small **`daPortal`** companion
(a custom region behavior *or* a region flag — decided in P1 by whichever the live-v14
behavior allows alongside teleport) holding:

| Field | Type | Meaning |
|---|---|---|
| `linkId` | string | Link-group id shared by paired regions. |
| `name` | string | Friendly link name (Stairways-style), for the Manager + overlay. |
| `label` | string | Player hover/click label (default "Stairs"; DM relabel). |
| `anchor` | `{x,y}` | Landing spot at this end (default shape center). |
| `mode` | enum | `stairs`/`teleport`/`trap` preset. |
| `trigger` | enum | `click` / `enter`. |
| `confirm` | boolean | Prompt before moving. |
| `showDestName` | boolean | Reveal destination name in the prompt (maps to native `revealed`). |
| `showToPlayers` | boolean | Enable the sight-gated player overlay. |
| `revealRadius` | number | Overlay proximity (grid units). |
| `oneWay` | boolean | Don't create the return destination. |
| `triggerFor` | enum | `players` / `all`. |

Player shape visibility = the Region's native `hidden`.

---

## 13. Implementation map — files, hooks, registration

### File layout (proposed)
```
scripts/
  main.js              # init/ready hooks; register behavior/flags, settings, API, controls
  levels.js            # getSceneLevels, getCurrentLevelId (moved out of region-adder.js)
  portal/
    behavior.js        # daPortal companion (behavior or flag schema) + sync to native teleportToken
    runtime.js         # click-to-use path: validate ▸ DialogV2.query ▸ GM move ▸ guards
    linking.js         # wizard + direct click-connect; bind = mint linkId, anchors, sync destinations
    manager.js         # Stairs Manager panel + thumbnail builder
    overlay-dm.js      # GM link lines / cross-level markers (PIXI, hook-driven)
    overlay-player.js  # sight-gated clickable player overlay (PIXI, debounced)
    canvas-pick.js     # pickCanvasRectangle (moved out of region-adder.js)
templates/  portal-link.hbs, portal-manager.hbs
styles/module.css      # + .da-portal-* rules
```
(`region-adder*.js` retired; helpers move to `levels.js` / `canvas-pick.js`.)

### Hooks & registration — where each lives

| Hook / registration | File | Purpose |
|---|---|---|
| `Hooks.once("init")` | `main.js` | Register the `daPortal` companion (behavior type *or* flag schema); module settings; `game.modules.get(ID).api` (`AddStairs`, `LinkStairs`, `StairsManager`). |
| `Hooks.once("ready")` | `main.js` | Expose `window.DA`. |
| `Hooks.on("getSceneControlButtons")` | `main.js` | Add a "Stairs / Portal" tool group (Add / Link / Manage) to canvas controls. |
| native `teleportToken` + (opt) `daPortal` `static events` | `portal/behavior.js` | Auto-on-enter move; optional confirm wrap. |
| `Hooks.on("canvasReady")` | `overlay-dm.js`, `overlay-player.js` | Build DM link overlay; start player-overlay watcher. |
| active-level-change hook *(name TBD §14)* | `overlay-dm.js`, `overlay-player.js` | Rebuild overlays for the newly-viewed level. |
| `createRegion`/`updateRegion`/`deleteRegion` | `overlay-dm.js`, `manager.js` | Refresh overlay + manager on portal changes. |
| `refreshToken`/`updateToken`/`controlToken` | `overlay-player.js` | Drive the sight-gated overlay (debounced). |
| `renderRegionBehaviorConfig` | `behavior.js` | Inject shortcut / "re-link" button. |

### Data flow (click-to-use)
```
player clicks overlay ──► (request) ──► GM: validate ▸ cooldown ▸ confirm?(DialogV2.query)
        └─► GM token.update({x,y,elevation}) ▸ set portalCooldown
```

---

## 14. Open questions / live-v14 verification

Resolved by research:
- ✅ `DialogV2.query(user, type, config)` — native GM→player prompt, no dependency.
- ✅ Native **`teleportToken`** behavior with `destinations` + `revealed` (multi-dest, name
  reveal, player choice) is the movement engine; Stairways-style click-to-use is the player UX.

Confirm on a live v14 world during P1–P2:
1. `teleportToken` **schema** in the target 14.x (`destinations`, `revealed`, how it sets
   the **destination level/elevation**) — decides native-move vs our fallback move.
2. Whether a **second custom behavior** can coexist on the same region as `teleportToken`
   (for confirm/flags) or if a **region flag** is cleaner.
3. Exact **token-enter event** + payload; **active-level-change hook**; the property for the
   currently-viewed level.
4. **Sight/LOS API** for the player overlay (`canvas.visibility.testVisibility` vs a
   sight-polygon collision test).
5. `token.update` teleport-vs-animated flag; elevation band edges (inclusive/exclusive).

## 15. Migration

Old-tool regions keep working. Optional one-click **"Convert to portal"** (mint `linkId`,
attach `daPortal`, set native `destinations`) — low priority, post-MVP.

## 16. Phased build plan

- **P1 — Foundation & editing.** Verify native `teleportToken` (§14.1); register the
  `daPortal` companion + sheet; repoint creation to native teleport + `daPortal`. Refactor
  helpers into `levels.js`/`canvas-pick.js`. "Click to edit" via native + sheet.
- **P2 — Linking + Manager.** Wizard **and** direct click-connect; bidirectional `destinations`
  sync; **Stairs Manager** (schematic thumbnails). Covers teleport, stairs, traps (silent).
- **P3 — DM link overlay.** Translucent same-layer lines + cross-layer markers, GM-only.
- **P4 — Player overlay.** Sight-gated, hover-label + **click-to-use**, performance-gated;
  optional `DialogV2.query` confirm + multi-destination picker (native `revealed`).
- **P5 — Polish.** Rendered Manager thumbnails, relative-position landing, migration,
  settings, docs/ARCHITECTURE refresh.

Each phase is independently testable and shippable.

## 17. Out of scope (for now)

Locked/keyed stairs, per-token permissions, animated transitions, sound effects on use.
Easy to add on this foundation — flag any to pull forward.
