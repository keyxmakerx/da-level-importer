# Stairs / Portal System — Design Spec

**Status:** Proposal, awaiting sign-off. Nothing here is built yet.
**Supersedes:** the current "DA Add Stairs / Elevator" tool (`region-adder*.js`), which
creates a single Region bound to N levels with the core `changeLevel` behavior.

Decisions locked with the maintainer:
- **Design doc first**, then build in phases.
- **socketlib** for the GM→player prompt relay.
- **Place-then-link wizard** as the primary creation flow.

---

## 1. Why the current tool has to change

Today a "stair" is **one Region bound to several levels**, carrying core `changeLevel`.
Core `changeLevel` can only ever move a token to **the same (x, y) on the adjacent
level**. The maintainer's hard requirement — *"the stairs may not be in the same
location on the up level as the down level"* — is impossible in that model.

So a stair must store a **destination position**, not just a destination level. That
single change turns the feature into a **linked-portal system**: two (or more)
independent Regions — each with its own shape, spot, and level — *bound together*,
where entering one moves the token to another's **anchor point + level**.

Everything else the maintainer asked for falls out of this one shift.

---

## 2. The unifying idea

A **portal** is a Region carrying our custom `daPortal` behavior. Portals that share a
**`linkId`** form a **link group**. Entering one member sends the token to another
member's **anchor** (a point) at that member's **level** (elevation).

- **Stairs** = link group whose members are on **different levels**.
- **Teleport** = link group whose members are on the **same level** (the "one big map,
  everything on one page, go to this spot" case). Same mechanism; the only difference is
  whether elevation changes.
- **Trap** = a one-way link whose entrance is **hidden** and has **no confirm prompt**
  (the player just drops through to the destination layer).

This means `stairs` / `teleport` / `trap` are not three separate engines — they are
**presets over the same primitives** (a destination anchor + a few toggles).

---

## 3. Data model — the `daPortal` Region Behavior

Registered as a custom `RegionBehaviorType` (v14 `CONFIG.RegionBehavior.dataModels`),
type id `da-level-importer.portal`. It gets a native config sheet, so **"click the stair
→ edit it"** works through Foundry's own Region UI with zero custom plumbing.

Proposed schema (field names final at implementation; semantics fixed here):

| Field | Type | Meaning |
|---|---|---|
| `linkId` | string | Pairing-group id. All members of one link share it. |
| `anchor` | `{x, y}` | Where a token **lands when arriving at this portal**. Defaults to the region shape's center; the DM can drag a landing pin to override (handles "goes to *this* spot"). |
| `arrivalOnly` | boolean | If true, this member is a **destination only** — entering it does **not** send the token anywhere (used for the far end of a one-way trap). |
| `confirm` | boolean | Prompt the triggering player to confirm before moving. |
| `showDestName` | boolean | Include the destination's level/region name in the prompt. |
| `promptLabel` | string (opt) | Custom prompt text override (else a sensible default). |
| `triggerFor` | enum: `players` / `all` | Whether GM-dragged tokens also trigger, or only player-driven movement. Default `players`. |

Player **visibility** of the shape is the Region's own native `hidden` flag — a trap is
just `hidden: true` + `confirm: false` + one-way. We don't reinvent that.

**Directionality** is emergent, not a mode:
- 2 members, neither `arrivalOnly` → **two-way** stairs/teleport.
- 2 members, far end `arrivalOnly` → **one-way** (trap / drop / one-way teleport).
- **3+ members** sharing a `linkId` → entering one offers a **picker** of the others
  ("Go to: Floor 2 / Roof / Basement") — the maintainer's "accounting for multiple
  levels" / elevator case.

---

## 4. Creation UX — place-then-link wizard

1. DM opens **DA Stairs / Portal**.
2. Dialog: starting level (auto-detected, overridable) + defaults for the toggles
   (`confirm`, `showDestName`, one-way, hidden, `triggerFor`) + mode preset
   (Stairs / Teleport / Trap, which just pre-sets those toggles).
3. **Place entrance** → click (1 grid square) or drag (footprint) on the canvas → Region
   A is created on the starting level with a `daPortal` behavior; a fresh `linkId` is
   minted; `anchor` defaults to the shape center.
4. **Place destination** → pick the destination level from a dropdown (for Teleport this
   is the *same* level) → click/drag on the canvas → Region B is created on that level,
   sharing the `linkId`, with its own `anchor`.
5. *(Optional)* **Add another destination** → repeat step 4 for a 3+-member elevator.
6. Done. If two endpoints share the current view, the **GM link line** appears
   immediately (§7).

Reuses existing, audited machinery: `pickCanvasRectangle`, `getSceneLevels`,
`getCurrentLevelId`, and the up/down level math from `region-adder-dialog.js`.

---

## 5. Editing existing portals

- **Shape / move / which levels / elevation** → native v14 Region editing (Regions
  layer → double-click → Region config). No custom code needed; it already works because
  portals are real Regions.
- **Portal settings** (confirm, names, destinations, one-way, anchor) → the `daPortal`
  **behavior config sheet** (opens from the Region config's Behaviors list). Our tool
  adds a shortcut button to jump straight there, and a **"re-link / add destination"**
  action so a DM can bind an existing region into a link group without recreating it.

---

## 6. Runtime flow (per token entering a portal)

Region behaviors execute **GM-side** (`gmOnly`). Flow:

1. **Trigger:** the token-enter region event fires on the GM client. *(Exact event name
   — `tokenEnter` vs `tokenMoveIn` — to be confirmed on live v14; see §10.)*
2. **Re-entry guard (critical):** if the token carries a fresh `portalCooldown` flag
   (set when it was just teleported), ignore this enter. Prevents A→B→A ping-pong when
   the destination anchor sits inside another portal. Cooldown ~1s, then cleared.
3. **Scope guard:** honor `triggerFor` — ignore GM-driven moves when set to `players`;
   ignore non-owned tokens.
4. **Resolve destinations:** other members of the `linkId` group, excluding any that are
   the same region, and excluding this entrance per directionality rules.
5. **Prompt (if `confirm`):** GM relays to the **triggering player** via socketlib
   (`socket.executeAsUser`): a Yes/No confirm, or a **picker** if >1 destination, showing
   destination names when `showDestName`. Player answers with `DialogV2`.
   - **Decline** → set the cooldown so it won't immediately re-prompt; leave the token
     put (they walk back out themselves).
6. **Move (GM authoritative):** validate the requesting user owns the token and the
   destination is legitimate, then
   `token.update({ x, y, elevation: destLevel.elevation.bottom }, { animate: false })`
   to the destination anchor. Set `portalCooldown` on the token.
7. **Trap path:** `confirm: false` → steps 5 skipped; the player silently drops to the
   destination layer.

**Security:** all writes happen on the GM client; the player only ever *requests*. We
verify ownership and destination validity before moving, never trust client-supplied
coordinates, and only move the **triggering player's own** token.

---

## 7. GM-only link overlay

- On `canvasReady`, level change, and region create/update/delete: group the scene's
  portal Regions by `linkId`.
- For each group, if ≥2 members are on the **currently viewed level** (same layer), draw
  a **translucent line** between their anchors on a GM-only overlay
  (`game.user.isGM`) — the maintainer's "slightly transparent link only visible to the
  DM on single-layer connections."
- **Cross-level** links can't be drawn as a line (you only see one level at a time), so
  each endpoint instead gets a small **arrow/label marker** ("↑ Floor 2") on its own
  level. One-way links render as an arrow rather than a plain line.
- Pure presentation, GM-only, no document writes.

---

## 8. socketlib integration

- Declare the dependency in `module.json` →
  `"relationships": { "requires": [{ "id": "socketlib", "type": "module" }] }`.
- On `socketlib.ready`: `const socket = socketlib.registerModule("da-level-importer")`,
  register a `promptPlayer(payload)` handler that runs on the player client and returns
  their choice.
- GM side: `await socket.executeAsUser("promptPlayer", triggeringUserId, payload)` →
  resolves with the pick → GM applies the move.
- Users must install **socketlib** (standard, widely-used). The module degrades to
  silent moves if it's somehow absent (with a one-time warning).

---

## 9. Migration of existing stairs

Regions made by the old tool (multi-level + core `changeLevel`) keep working untouched.
Optional one-click **"Convert to portal"** action on such a region (mint a `linkId`,
attach `daPortal`) — low priority, not in the MVP.

---

## 10. Open questions / live-v14 verification

Must be confirmed on a live v14 world during Phase 1–2 (the audit and prior egress block
mean a few API specifics are inferred):

1. Exact **region event** for "token entered by movement" (`tokenEnter` /
   `tokenMoveIn` / `tokenMove`) and its payload (`event.data.token`, `event.user`).
2. **Custom `RegionBehaviorType`** registration + config-sheet rendering in the target
   14.x build (`CONFIG.RegionBehavior.dataModels`, schema → auto sheet).
3. Confirmation that behavior scripts truly run **GM-only** (justifies the socket hop).
4. **Elevation landing** band edges (inclusive/exclusive) so a token landing on
   `level.elevation.bottom` reads as *on* the destination level.
5. `token.update` with `x/y/elevation` in one call — teleport vs animated; the right flag
   to avoid a visible slide across the map.

---

## 11. Phased build plan

- **P1 — Foundation & editing.** Register `daPortal` + config sheet (schema, toggles).
  Repoint the create flow to attach `daPortal` (with a `linkId`) instead of core
  `changeLevel`. "Click to edit" working via native Region config + behavior sheet.
- **P2 — Linking + movement.** Place-then-link wizard (entrance → destination(s)).
  GM-side move on token-enter, re-entry guard, scope/ownership guards. **No prompts yet**
  — silent moves. This already delivers teleport, basic stairs, and traps.
- **P3 — GM link overlay.** Translucent same-layer link lines + cross-layer endpoint
  markers, GM-only, live-updating. (Pulled before prompts because it makes P2 linking
  visually verifiable.)
- **P4 — Player prompts (socketlib).** Confirm prompt + destination-name display +
  multi-destination picker.
- **P5 — Polish.** Old-region migration, optional player-facing up/down markers, labels,
  module settings, docs/ARCHITECTURE refresh.

Each phase is independently testable and shippable.

---

## 12. Explicitly out of scope (for now)

Locked/keyed stairs (require an item), per-token permissions, cross-**scene** teleports,
animated transitions, and sound effects on use. Easy to add later on this foundation;
flag any you want pulled forward.
