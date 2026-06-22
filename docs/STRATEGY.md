# Product Strategy & v14 Positioning

The north-star document. Every feature — existing or proposed — is judged against this.
If something here conflicts with a feature plan, **this wins** until explicitly changed.

---

## 1. North star

**"Dungeon Alchemist → Foundry v14, made effortless."**

We turn a folder of DA floor exports into a finished, **native** v14 multi-level Scene —
walls, doors, lights, levels, and transit between them — in seconds. Our value is
**automation + DA-awareness**, *not* re-implementing things Foundry already does.

## 2. What we are / are not

- **We ARE** a *bridge and automation layer*. We exploit DA-specific context (per-floor
  files, naming, structure, elevations) to do in one click what is otherwise **SO taxing**
  to do by hand in native UIs.
- **We are NOT** a replacement for native Levels / Regions / behaviors / navigation. We
  **build on** them, **register into** them, and **defer authoritative editing** to them.

> The test the maintainer set: *"the important part is how much we are improving."* If we're
> not meaningfully easier/better than native — ideally by using DA context native can't have —
> we **don't build it**.

## 3. Design principles (guardrails against replace / conflict / bugs)

1. **Build ON native.** Native Levels, Regions V2, native behaviors (`teleportToken`,
   `changeLevel`, `defineSurface`…), and level-aware navigation (`viewLevel`/`cycleLevel`)
   are the substrate. Never shadow or re-create them.
2. **Earn every UI.** Add a tool only where we're clearly easier/better than native —
   especially where we exploit **DA import context**. Otherwise, point users at native.
3. **Pre-populate, don't possess.** Our tools *accelerate and batch* (auto-fill from DA,
   place many things at once); **authoritative ongoing editing stays native.**
4. **Integrate, never parallel.** Extend through documented points (`RegionBehaviorType`,
   the Levels schema, scene controls). **No parallel systems, no scraping native DOM.**
5. **Robustness over surface area.** Less custom code = fewer bugs. Prefer native-backed
   paths; keep features small and testable. Audit gates the build (§7).
6. **Trust nothing external.** DA exports are external data — validate/clamp before writes;
   GM-gate every scene write; degrade gracefully when native APIs differ.

## 4. Feature positioning

Verdicts: **INVEST** (core value) · **BUILD on native** (real gap we fill) · **TRIM**
(keep only the DA-context value, defer the rest) · **DEFER** (native does it; just use it).

| Capability | What native v14 does | Our added value | Verdict |
|---|---|---|---|
| **Import DA folder → Scene + Levels + walls/doors/lights** | Nothing DA-specific | The whole point: one-click automation from DA exports | **INVEST (core)** |
| **Per-level naming / elevation / visibility editing** | Native **Levels tab** (generic, authoritative) | DA-aware *pre-fill* (filenames→names, auto elevations, roof shortcut, media preview), batch | **TRIM** → fold into import; defer standalone editing to native (§6) |
| **Stairs / portals between levels** | `teleportToken` (+`destinations`/`revealed`), `changeLevel`, Regions | Linking UX (wizard + click-connect), **Stairs Manager**, sight-gated clickable player overlay, DM link line, trap/confirm presets | **BUILD on native** (genuine UX gap) |
| **Area blocking / surfaces** | Native `defineSurface` | None | **DEFER** |
| **Level navigation / floor switching** | Native `viewLevel`/`cycleLevel` | None (we just call them) | **DEFER** |
| **Region shapes** | Native rectangle/poly/ellipse + **Ring/Emanation** | None (support them) | **DEFER** |

## 5. The "long-term useful" test (apply to every feature, every phase)

Before building or keeping anything, it must pass all four:
1. **Does native already do this well?** If yes → **defer**, don't duplicate.
2. **Do we make it meaningfully easier/better — ideally via DA context?** If no → **don't build.**
3. **Does it integrate via native extension points with zero conflict?** If no → **redesign.**
4. **Is it small/robust enough not to become a bug source?** If no → **simplify.**

## 6. Resolving the Edit-Levels conflict (native tab vs our 0.0.14 dialog)

Honest comparison (native UX to be confirmed on a live v14 build — its UI is "not final"):

| | Native Levels tab | Our "DA Edit Levels" dialog |
|---|---|---|
| Add/edit elevation ranges, sublevel visibility | ✅ authoritative, always present, core-maintained | ✅ duplicates this |
| DA-aware pre-fill (filenames→names, auto-stacked elevations, roof shortcut) | ❌ | ✅ **real, unique value** |
| Media preview, drag-reorder, basic/advanced view | ❌ | ✅ conveniences |
| Maintenance cost / drift risk as native UI evolves | n/a | ⚠️ high (parallel editor) |

**Verdict: TRIM.** The standalone *editing* is largely redundant with native and will drift
and conflict as native's UI matures — a long-term liability. The **DA-aware conveniences are
genuine value, but they belong at *import time*** (where DA context exists), not as an
ongoing parallel editor. Plan:
- Keep the DA-aware pre-fill/reorder/roof/media features **in the import flow**.
- For post-import edits, **defer to the native Levels tab** (optionally a one-click
  "Open native Levels tab" shortcut).
- Retire the standalone edit-mode of the dialog once import-time parity is confirmed.

This removes the conflict, cuts maintenance, and keeps 100% of our actual value.

## 7. Robustness (anti-bug) commitments

- **Audit-gated build.** The in-flight audits (importer / dialog / region / security) gate
  the next feature work; **fix Criticals before adding surface area.** *(Already found: the
  importer emits a non-v14 `fog.mode`, and unguarded wall/light coordinates can abort an
  entire import — both must be fixed regardless of stairs.)*
- **Native-backed by default** — every place we can lean on a native behavior/API instead of
  custom code, we do.
- **Validate DA input; GM-gate writes; no native-DOM scraping.**

## 8. How the other docs relate

- `STRATEGY.md` *(this)* — why/what; governs everything.
- `STAIRS-PORTAL-DESIGN.md` — the stairs feature, already conformed to these principles
  (builds on native `teleportToken`/Levels/nav).
- `PLAN.md` / `ROADMAP.md` — to be re-aligned to this strategy (drop anything that fails §5).
- `ARCHITECTURE.md` — how the shipped code actually works (developer reference).
