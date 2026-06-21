# DA Level Importer — Architecture

Developer documentation for the **Dungeon Alchemist Level Importer** Foundry VTT module
(`module.json:2` → id `da-level-importer`, version `0.0.5`, compatibility minimum/verified `14`,
authored by *Mestre Digital*; `module.json:6-9`, `module.json:11-17`).

The module imports a multi-floor Dungeon Alchemist export — one background media file
(image **or** video) plus one `.json` per floor — into a **single Foundry v14 Scene** that uses
**native v14 Scene Levels**, with walls/doors/lights bound to each level. It also ships a region
tool that creates multi-level staircase/elevator transit regions.

> All references below are `file:line` into the real source as of v0.0.5. Where behavior is
> inferred or relies on undocumented Foundry internals, this is called out explicitly.

---

## Table of Contents

1. [Overview & Entry Points](#1-overview--entry-points)
2. [Import Data Flow (End-to-End)](#2-import-data-flow-end-to-end)
3. [Key Data Shapes](#3-key-data-shapes)
4. [The Importer Dialog](#4-the-importer-dialog)
5. [The Region Adder](#5-the-region-adder)
6. [v14-Specific APIs Relied Upon](#6-v14-specific-apis-relied-upon)
7. [Extension Points — Where to Change Things](#7-extension-points--where-to-change-things)

---

## File Map

| File | Role |
| --- | --- |
| `scripts/main.js` | Entry hooks (`init`/`ready`), the `DA` global API, Scenes-sidebar button injection |
| `scripts/da-importer.js` | Core import logic: pairing, fetch/parse, copy-to-world, Scene payload, wall/light mapping |
| `scripts/importer-dialog.js` | `DAImporterDialog` — the tabbed ApplicationV2 UI |
| `scripts/region-adder.js` | Region helpers: level introspection, canvas click capture, region creation |
| `scripts/region-adder-dialog.js` | `DARegionAdderDialog` — the region configuration ApplicationV2 UI |
| `scripts/constants.js` | `MODULE_ID`, `FLOOR_HEIGHT`, `SETTING_IMPORTER_DEFAULTS` shared constants |
| `templates/importer.hbs` | Handlebars template for the importer dialog |
| `templates/region-adder.hbs` | Handlebars template for the region dialog |
| `styles/module.css` | All module styling (dialogs, tabs, toggles, dropdowns, sidebar button) |
| `module.json` | Manifest (esmodule entry = `scripts/main.js`; `module.json:19-22`) |

---

## 1. Overview & Entry Points

The module is loaded as a single ES module via `module.json:19-21` (`esmodules: ["scripts/main.js"]`),
with `styles/module.css` registered as the only stylesheet (`module.json:22`).

### `init` hook — register the setting + API (`scripts/main.js:5-19`)

```js
Hooks.once("init", () => {
  // Per-client memory of the importer dialog's last-used selections.
  game.settings.register(MODULE_ID, SETTING_IMPORTER_DEFAULTS, {
    scope: "client", config: false, type: Object, default: {}
  });

  game.modules.get(MODULE_ID).api = {
    Importer: () => new DAImporterDialog().render(true),
    AddRegion: () => new DARegionAdderDialog().render(true)
  };
});
```

On `init`, the module does two things:

- **Registers a client-scoped, hidden setting** keyed by `SETTING_IMPORTER_DEFAULTS`
  (`= "importerDefaults"`, `scripts/constants.js:14`) via `game.settings.register`
  (`scripts/main.js:8-13`). `scope: "client"` keeps it per-browser; `config: false` hides it from
  the Settings UI. It stores the importer dialog's last-used selections (door texture/sound,
  background color, grid alpha, copy toggle) so they survive across opens — see
  [§4](#persisted-dialog-defaults).
- **Attaches an `api` object** onto its own module entry (`scripts/main.js:15-18`). The API has two
  members:
  - `Importer()` — constructs and renders a `DAImporterDialog` (`scripts/importer-dialog.js:42`).
  - `AddRegion()` — constructs and renders a `DARegionAdderDialog` (`scripts/region-adder-dialog.js:19`).

`MODULE_ID` is the shared constant `"da-level-importer"` (`scripts/constants.js:2`), kept in sync
with `module.json:2`.

### `ready` hook — expose the `DA` global (`scripts/main.js:21-23`)

```js
Hooks.once("ready", () => {
  window.DA = game.modules.get(MODULE_ID).api;
});
```

This makes the same API reachable from the browser console or any macro as `DA.Importer()` /
`DA.AddRegion()`. The canonical, namespaced access path remains
`game.modules.get("da-level-importer").api.{Importer,AddRegion}()`; `DA` is a convenience alias bound
to the identical object.

### Scenes-directory sidebar button injection (`scripts/main.js:32-49`)

```js
Hooks.on("renderSceneDirectory", (_app, html) => {
  if (html.querySelector(".da-importer-sidebar-btn")) return;          // idempotency guard
  const header = html.querySelector(".directory-header");
  if (!header) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "da-importer-sidebar-btn";
  btn.innerHTML = '<i class="fas fa-file-import"></i> DA Level Importer';
  btn.addEventListener("click", () => game.modules.get(MODULE_ID).api.Importer());
  const actionButtons = header.querySelector(".action-buttons") ?? header.querySelector(".header-actions");
  const anchor = actionButtons ? actionButtons.nextSibling : null;
  header.insertBefore(btn, anchor);
});
```

Notable details:

- The hook fires on **every** `SceneDirectory` render; the early-return guard at `scripts/main.js:33`
  prevents duplicate buttons.
- The handler receives the **DOM element** (`html`) directly and calls `querySelector` on it —
  this is the ApplicationV2 hook signature, not the jQuery object older Foundry passed.
- Placement is defensive: it looks for `.action-buttons` and falls back to `.header-actions`
  (`scripts/main.js:46`), inserting the button **after** the native Create-Scene/Create-Folder
  buttons so it lands between them and the search bar regardless of the search element's
  tag/class in v14 (`scripts/main.js:44-48`).
- The button click goes through the namespaced API (`game.modules.get(MODULE_ID).api.Importer()`),
  not the `DA` global — so it works even if something has clobbered `window.DA`.
- Styling: `.da-importer-sidebar-btn` is full-width minus padding (`styles/module.css:2-5`).

```mermaid
flowchart LR
  A[module load] --> B["Hooks.once init<br/>scripts/main.js:5"]
  B --> S["game.settings.register<br/>importerDefaults<br/>scripts/main.js:8"]
  B --> C["module.api = { Importer, AddRegion }"]
  A --> D["Hooks.once ready<br/>scripts/main.js:21"]
  D --> E["window.DA = module.api"]
  A --> F["Hooks.on renderSceneDirectory<br/>scripts/main.js:32"]
  F --> G["inject .da-importer-sidebar-btn"]
  G -->|click| H["api.Importer() → DAImporterDialog.render"]
  C -.-> H
  E -.-> H
```

---

## 2. Import Data Flow (End-to-End)

The whole pipeline lives in `importFolder(...)` (`scripts/da-importer.js:144-327`), driven by the
dialog's `#onImport` handler (`scripts/importer-dialog.js:527-559`). The stages below trace one
import from the user's click to `Scene.create`.

```mermaid
flowchart TD
  U["User clicks Import<br/>importer-dialog.js:527 #onImport"] --> OV["Build levelOverrides[]<br/>from form fields<br/>importer-dialog.js:544-555"]
  OV --> IF["importFolder(...)<br/>da-importer.js:144"]

  IF --> BR["FilePicker.browse(source, path)<br/>da-importer.js:149"]
  BR -->|browse error| ERR1["ui.notifications.error → return null"]
  BR --> CFP["collectFloorPairs(listing.files)<br/>da-importer.js:155 / 336"]
  CFP -->|0 pairs| ERR2["warn 'no floor pairs' → return null"]
  CFP --> FETCH["Promise.all: fetch + parse each p.json<br/>da-importer.js:164-168"]
  FETCH -->|fetch/JSON error| ERR3["error → return null"]

  FETCH --> COPY{copyImages?}
  COPY -->|yes| CP["_commonStem → _toKebab →<br/>_ensureUniqueSubfolder →<br/>_copyMedia per floor (mutates f.media)<br/>da-importer.js:179-208"]
  COPY -->|no| LV
  CP --> LV["Build levels[] (one per floor)<br/>da-importer.js:214-241"]

  LV --> VIS["Compute visibility.levels per level<br/>(isRoof + visibleLevels, deduped)<br/>da-importer.js:246-255"]
  VIS --> WL["Map walls + lights per floor<br/>_mapWall / _mapLight<br/>da-importer.js:259-266"]
  WL --> SD["Assemble sceneData<br/>(grid, env, levels, initialLevel, walls, lights)<br/>da-importer.js:269-304"]
  SD --> SC["Scene.create(sceneData)<br/>da-importer.js:310"]
  SC -->|throws / null| ERR4["error → return null"]
  SC --> OK["notify success → return scene<br/>da-importer.js:325-326"]
```

### Stage 1 — Folder browse (dialog side)

`#onBrowse` (`scripts/importer-dialog.js:84-110`) opens a `FilePicker` in `folder` mode
(`scripts/importer-dialog.js:86-87`). On selection, the callback:

1. Writes the chosen path into the hidden/readonly inputs `folder` and `source`
   (`scripts/importer-dialog.js:90-94`); `source` defaults to the picker's `activeSource`
   or `"data"`.
2. Immediately calls `FilePicker.browse(source, path)` and feeds the file list into
   `collectFloorPairs` to populate `this._floorPairs` (`scripts/importer-dialog.js:98-99`).
3. Clamps `_initialLevelIndex` to the new floor count so a re-selection with fewer floors can't
   leave the star highlighting no row (`scripts/importer-dialog.js:105`), then calls
   `_populateLevelsTab()` to rebuild the Levels-tab rows (`scripts/importer-dialog.js:106`).

So the **dialog browses the folder twice** in effect: once eagerly (to render per-level rows),
and again inside `importFolder` at import time (`scripts/da-importer.js:149`) as the source of truth.

### Stage 2 — `collectFloorPairs` (pairing rules, sorting, media precedence)

`collectFloorPairs(files)` (`scripts/da-importer.js:336-382`) is the heart of pairing. It is
**exported** so the dialog can inspect pairs before a full import.

Inputs are full URLs from `FilePicker.browse()`. The algorithm:

1. **Group by filename stem** (`scripts/da-importer.js:337-360`). For each file it
   `decodeURIComponent`s the basename, splits off the extension, and keys a `Map` by the stem
   (everything before the final dot).
2. **Filter to relevant extensions** (`scripts/da-importer.js:344`): only `json` or a member of
   `MEDIA_EXTS` is considered; anything else is skipped.
   - `IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"]` (`scripts/da-importer.js:27`)
   - `VIDEO_EXTS = ["webm", "mp4", "m4v"]` (`scripts/da-importer.js:28`)
   - `MEDIA_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS]` (`scripts/da-importer.js:29`)
3. **Slot assignment per stem** (`scripts/da-importer.js:347-359`):
   - `json` files fill `entry.json`.
   - Media files compete for a single `entry.img` / `entry.imgExt` slot. When a floor ships more
     than one media file, the winner is chosen **deterministically** by `MEDIA_PRIORITY`
     (`scripts/da-importer.js:36`) — the order `["webm", "mp4", "m4v", "webp", "png", "jpeg",
     "jpg"]`, i.e. *video > webp > png > jpg*. Each candidate's `MEDIA_PRIORITY.indexOf(ext)` is its
     rank (lower = preferred); a new file only displaces the current pick if its rank is strictly
     lower (`scripts/da-importer.js:353-358`). Because the decision is by extension rank rather than
     arrival order, the outcome is independent of the order `FilePicker` returns files in.
4. **Build pair objects** (`scripts/da-importer.js:362-381`): only stems that have **both** a
   `json` and an `img` become a pair; any stem missing one side is pushed onto an `orphans` list
   instead (`scripts/da-importer.js:364-368`). The floor index is parsed from the `-_NN` suffix via
   `FLOOR_RE = /-_(\d+)$/` (`scripts/da-importer.js:20`, applied at `:369`); stems without the
   suffix get `index: 0`.
5. **Warn on orphans** (`scripts/da-importer.js:377-379`): if any unpaired files were collected
   (a `.json` with no media, or media with no `.json`), the whole list is logged once via
   `console.warn("[DA Importer] skipped N unpaired file(s):", orphans)` — they are skipped, not
   silently dropped, so a mis-exported folder is diagnosable from the console.
6. **Sort** (`scripts/da-importer.js:380`): ascending by parsed `index`, then `localeCompare` on
   the stem as a tiebreaker.

The resulting pair object is `{ stem, index, json, media }` (`scripts/da-importer.js:370-375`),
where `media` is the chosen background media URL for the floor — an image **or** a video,
whichever won the `MEDIA_PRIORITY` contest.

> Pairing is purely filename-stem based, which is why the README requires one map per folder
> (`README.md:19`).

### Stage 3 — JSON fetch & parse (`scripts/da-importer.js:162-172`)

All pairs are fetched in parallel with `Promise.all`. Each floor object is a **shallow copy** of its
pair plus a `data` field holding the parsed JSON (`{ ...p, data: await res.json() }`,
`scripts/da-importer.js:167`). A non-OK HTTP response throws and aborts the whole import with an
error notification (`scripts/da-importer.js:166`, `:169-172`).

The shallow-copy detail matters later: because `floors[i]` is its own object, the copy-to-world
stage can mutate `floors[i].media` without touching the original `pairs[i]`
(comment at `scripts/da-importer.js:198-200`).

### Stage 4 — Optional copy-to-world (`scripts/da-importer.js:179-208`)

Gated on the `copyImages` flag. When enabled, the world becomes self-contained: each floor's media
is copied into `worlds/<id>/da-imported/<map>/` and renamed to kebab-case.

- **Destination folder name** comes from `_commonStem(pairs)` (`scripts/da-importer.js:180` →
  `:390-393`), which strips the `-_NN` suffix from the first stem; it is then kebab-cased via
  `_toKebab` (`scripts/da-importer.js:181`), falling back to `"da-map"`.
- **`_ensureUniqueSubfolder(baseName)`** (`scripts/da-importer.js:80-106`):
  - `root = worlds/<game.world.id>/da-imported` (`scripts/da-importer.js:82`).
  - Best-effort `FP.createDirectory("data", root, {})`, ignoring errors if it already exists
    (`scripts/da-importer.js:84-86`).
  - Then probes `root/<candidate>` by calling `FP.browse(...)`: **success means the directory
    already exists** (so try the next name); a thrown error means it's free
    (`scripts/da-importer.js:92-98`). The first free slot is created and returned.
  - Collision handling appends an incrementing integer: `tavern → tavern1 → tavern2 …`
    (`scripts/da-importer.js:103-104`).
- **Per-floor copy** (`scripts/da-importer.js:190-206`):
  - Derives the original filename and extension from `f.media` (decoding the URL;
    `scripts/da-importer.js:192-195`), defaulting the extension to `"jpg"` if there's no dot.
  - Computes the kebab filename from `f.stem` via `_toKebab` (`scripts/da-importer.js:196`).
  - Calls `_copyMedia(...)` and **reassigns `f.media`** to the uploaded path
    (`scripts/da-importer.js:201`). Because the `levels[]` build below reads `f.media`, this is what
    redirects the Scene to the copies.
  - Any failure aborts with an error notification and `return null`
    (`scripts/da-importer.js:202-205`).
- **`_copyMedia(srcUrl, destFolder, kebabStem, ext)`** (`scripts/da-importer.js:118-130`): the
  copy primitive (its JSDoc describes it as downloading an "image or video";
  `scripts/da-importer.js:108-117`). `fetch`es the source URL, wraps the blob in a `File` named
  `<kebabStem>.<ext>`, and `FP.upload("data", destFolder, file, {})`, returning `result.path`. A
  non-OK fetch throws (`scripts/da-importer.js:122`).
- **`_toKebab(name)`** (`scripts/da-importer.js:61-68`): NFD-normalizes, strips combining
  diacritics (`[̀-ͯ]`), collapses any non-alphanumeric run to a single `-`, trims leading/
  trailing hyphens, and lowercases.

> The `_copyMedia` extension is computed from `f.media` (the chosen media URL), so video floors are
> copied with their real extension (`.webm` etc.), preserving the animated background.

### Stage 5 — Build `levels[]` (`scripts/da-importer.js:214-241`)

One Scene Level per floor. For floor `i`:

- `name` = override's trimmed name, else `` `Floor ${i}` `` (`scripts/da-importer.js:216`).
- **Default elevation** uses `FLOOR_HEIGHT` (= 10; `scripts/constants.js:8`):
  - `defaultBottom = i === 0 ? 0 : i * FLOOR_HEIGHT + 1` (`scripts/da-importer.js:217`).
  - `defaultTop = (i + 1) * FLOOR_HEIGHT` (`scripts/da-importer.js:218`).
  - i.e. `0–10`, `11–20`, `21–30`, … — the `+1` (added in v0.0.2) prevents adjacent floors from
    sharing a boundary elevation (`CHANGELOG.md:47-48`).
  - Overrides win only when finite: `Number.isFinite(ov?.bottom) ? ov.bottom : defaultBottom`
    (`scripts/da-importer.js:219-220`).
- `_id` is a fresh `foundry.utils.randomID()` (`scripts/da-importer.js:222`); this id is the
  binding key reused by walls, lights, `initialLevel`, and `visibility.levels`.
- `background.src` = `f.media` (the possibly-copied media URL; `scripts/da-importer.js:226`).
- `sort = i` (`scripts/da-importer.js:238`).

The complete emitted Level shape is documented in [§3](#scene-level-object).

#### `visibility.levels` second pass (`scripts/da-importer.js:246-255`)

After all levels exist (so their `_id`s are known), `visibility.levels` is computed per level by
**merging two sources, deduplicated**:

- **`isRoof` shortcut**: if `i > 0` and the override marks this level a roof, push the
  *immediately-lower* level's id (`scripts/da-importer.js:249`). Per the toggle's tooltip, a roof
  renders only when the floor directly below it is active (`scripts/importer-dialog.js:384`).
- **Explicit `visibleLevels`**: for each selected index `j`, push `levels[j]._id` if present and
  not already included (`scripts/da-importer.js:250-253`).

### Stage 6 — Map walls & lights (`scripts/da-importer.js:259-266`)

For each floor, with `levelId = levels[i]._id` and `elevation = levels[i].elevation.bottom` — the
level's **resolved** bottom, which honors any per-level override rather than recomputing a raw
`i * FLOOR_HEIGHT` that would ignore overrides (`scripts/da-importer.js:263`, comment at `:261-262`):

- `f.data.walls ?? []` → `_mapWall(w, levelId, doorTexture, doorSound)`
  (`scripts/da-importer.js:264`).
- `f.data.lights ?? []` → `_mapLight(l, levelId, elevation)` (`scripts/da-importer.js:265`).

Mapping details are in [§3](#wall-document-mapping). Counts are logged at
`scripts/da-importer.js:267`.

### Stage 7 — Assemble `sceneData` & create (`scripts/da-importer.js:269-327`)

The Scene payload (`scripts/da-importer.js:269-304`) pulls map-wide properties from the **first
floor's JSON** (`first = floors[0].data`, `scripts/da-importer.js:211`):

- `name` = `_commonStem` result, else `"Dungeon Alchemist Map"` (`scripts/da-importer.js:270`).
- `width` / `height` / `padding` from `first` (padding defaults `0.25`;
  `scripts/da-importer.js:271-273`).
- `grid`: `type: 1` (square), `size: first.grid`, plus color/alpha/distance/units pulled from
  `first` with fallbacks (`scripts/da-importer.js:275-284`); `alpha` is the dialog's `gridAlpha`.
- `tokenVision: true`, `fog.mode: 1` (`scripts/da-importer.js:285-286`).
- `environment` block (`scripts/da-importer.js:287-299`): `darknessLevel`, a `globalLight` whose
  `enabled` mirrors `!!first.globalLight`, plus static `base`/`dark` color grading.
- `levels` (from Stage 5), `initialLevel`, `walls`, `lights` (`scripts/da-importer.js:300-303`).
- **`initialLevel`** = `(levels[initialLevelIndex] ?? levels[0])._id`
  (`scripts/da-importer.js:301`) — the selected floor's id, falling back to the first level.

`Scene.create(sceneData)` is wrapped in try/catch (`scripts/da-importer.js:308-315`); a thrown
error or a falsy return both abort with notifications (`scripts/da-importer.js:316-319`). On
success it reads back `scene.levels` / `scene.walls` / `scene.lights` sizes for a confirmation
notification (`scripts/da-importer.js:321-326`). The function returns the created `Scene` (or
`null`). Back in the dialog, a truthy result closes the dialog (`scripts/importer-dialog.js:558`).

---

## 3. Key Data Shapes

### The floor-pair object (`collectFloorPairs`)

Produced at `scripts/da-importer.js:370-375`:

```js
{
  stem:  "TavernMap-_1",   // filename stem (no extension)
  index: 1,                // parsed from the -_NN suffix (FLOOR_RE), else 0
  json:  "<url>.json",     // the .json sibling URL
  media: "<url>.webm"      // the chosen background media URL (image OR video, per MEDIA_PRIORITY)
}
```

After `Promise.all` (`scripts/da-importer.js:167`) each **floor object** is `{ ...pair, data }`,
where `data` is the parsed DA JSON. If `copyImages` is on, `floor.media` is later overwritten with
the copied path (`scripts/da-importer.js:201`).

<a name="scene-level-object"></a>
### The Scene Level object (every field)

Emitted at `scripts/da-importer.js:221-240`, with `visibility.levels` filled by the second pass
(`scripts/da-importer.js:254`):

```js
{
  _id: "<randomID>",                       // da-importer.js:222 — binding key
  name: "Floor 0",                         // override or `Floor ${i}`        :216
  elevation: { bottom, top },              // override or FLOOR_HEIGHT default :219-220, :225
  background: {
    src: f.media,                          // floor media (possibly copied)   :226
    color: backgroundColor,                // dialog background color         :227
    tint: "#ffffff",
    alphaThreshold: 0.75
  },
  foreground: { src: null, tint: "#ffffff", alphaThreshold: 0.75 },  // :231
  fog: { src: null, tint: "#ffffff" },                                // :232
  textures: {                                                         // :233-236
    anchorX: 0.5, anchorY: 0.5,
    fit: "fill", scaleX: 1, scaleY: 1
  },
  visibility: { levels: [/* ids */] },     // filled by 2nd pass             :237, :254
  sort: i,                                 // floor index                    :238
  flags: {}                                // :239
}
```

> The `textures` block no longer carries `offsetX`/`offsetY`/`rotation`: those keys were removed
> from Foundry's `TextureData` in v14.354, so emitting them would fail schema validation.

### DA → Foundry wall enums (`_senseEnum` / `_moveEnum`)

DA's compact `{0: none, 1: normal, 2: limited}` restriction scheme is translated by **two**
helpers, because v14 has different value sets for *sense* vs *movement* restrictions:

- **`_senseEnum(v)`** (`scripts/da-importer.js:403-407`) — used for **sight** and **sound** (the
  `WALL_SENSE_TYPES` set `{NONE: 0, LIMITED: 10, NORMAL: 20}`). It maps `2→10`, `1→20`, anything
  else (incl. `0`) `→0`, clamping to exactly the three values DA emits.
- **`_moveEnum(v)`** (`scripts/da-importer.js:419-421`) — used for **movement**. v14
  `WALL_MOVEMENT_TYPES` only defines `{NONE: 0, NORMAL: 20}` — there is **no** `LIMITED` for
  movement — so it collapses to binary `v ? 20 : 0`: any blocking value (normal *or* limited) maps
  to `NORMAL`, and `0` stays `NONE`. Routing movement through `_senseEnum` would emit the invalid
  value `10` (rationale at `scripts/da-importer.js:409-418`).

| field | helper | DA `2` (limited) | DA `1` (normal) | DA `0`/other (none) |
| --- | --- | --- | --- | --- |
| `sight` | `_senseEnum` | `10` (`LIMITED`) | `20` (`NORMAL`) | `0` (`NONE`) |
| `sound` | `_senseEnum` | `10` (`LIMITED`) | `20` (`NORMAL`) | `0` (`NONE`) |
| `move`  | `_moveEnum`  | `20` (`NORMAL`)  | `20` (`NORMAL`) | `0` (`NONE`) |

<a name="wall-document-mapping"></a>
### Wall document mapping (`_mapWall`)

`_mapWall(daWall, levelId, doorTexture, doorSound)` (`scripts/da-importer.js:435-450`):

```js
{
  c: daWall.c,                       // [x1,y1,x2,y2] segment endpoints, passed through
  move:  _moveEnum(daWall.move  ?? 1),    // 0 or 20 only (no LIMITED for movement)
  sight: _senseEnum(daWall.sense ?? 1),   // NB: DA field is `sense`, Foundry field is `sight`
  sound: _senseEnum(daWall.sound ?? 1),
  door:  daWall.door ?? 0,           // 0 none, 1 door (DA passthrough)
  ds: 0,                             // door state: closed
  levels: [levelId]                  // SceneLevelsSetField binding
}
```

If `daWall.door === 1` **and** the dialog supplied options
(`scripts/da-importer.js:445-448`):

- `doorTexture` (non-empty) → `wallDoc.animation = { texture: doorTexture, type: "swing" }`.
- `doorSound` (non-empty) → `wallDoc.doorSound = doorSound` (a `CONFIG.Wall.doorSounds` key).

Defaults of `?? 1` on `move`/`sense`/`sound` mean an absent DA flag is treated as *normal*
(→ `20`).

<a name="light-document-mapping"></a>
### Light document mapping (`_mapLight`)

`_mapLight(daLight, levelId, elevation)` (`scripts/da-importer.js:462-482`):

```js
{
  x: daLight.x, y: daLight.y,
  rotation: 0,
  walls: true,                       // light occluded by walls
  vision: false,
  elevation,                         // = levels[i].elevation.bottom (resolved) da-importer.js:263
  config: {
    dim:   daLight.dim,
    bright: daLight.bright,
    color: daLight.tintColor ?? null,
    alpha: daLight.tintAlpha ?? 0.5,
    angle: 360,
    coloration: 1,
    luminosity: 0.5,
    animation: { type: null, speed: 5, intensity: 5, reverse: false }
  },
  levels: [levelId]                  // SceneLevelsSetField binding
}
```

`elevation` is the level's **resolved** `elevation.bottom` — honoring any per-level override, not a
recomputed `i * FLOOR_HEIGHT` — stamped as a sensible default so the light sorts correctly in
3D-aware tooling (comment at `scripts/da-importer.js:452-461`, value computed at `:263`).

### Region document (see also §5)

Built in `createMultiLevelRegion` (`scripts/region-adder.js:130-181`). Summary:

```js
{
  name, color: "#b0cc28",
  elevation: { bottom: minBottom, top: maxTop },  // spans the bound levels  region-adder.js:142-143,:148
  levels: levelIds,                               // Set of bound level ids  :149
  visibility: 2, highlightMode: "shapes",
  displayMeasurements: false, hidden: false,
  shapes: [ { type: "rectangle", x, y, width: gridSize, height: gridSize, ... } ],  // :154-167
  behaviors: [ { name: "Change Level", type: "changeLevel", system: {}, disabled: false, flags: {} } ]  // :168-176
}
```

---

## 4. The Importer Dialog

`DAImporterDialog` (`scripts/importer-dialog.js:42-560`).

### Class structure (ApplicationV2 + HandlebarsApplicationMixin)

```js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;   // :4
export class DAImporterDialog extends HandlebarsApplicationMixin(ApplicationV2) { ... }
```

**Instance state** (`scripts/importer-dialog.js:43-56`):

- `_floorPairs` — the pairs from the last folder browse (`:43-44`).
- `_visDropdowns` — body-attached dropdown elements to clean up on rebuild/close (`:45-46`).
- `_visCheckboxes` — `Map` keyed `"levelIndex,otherIndex"` for O(1) lookup at import time (`:47-48`).
- `_thumbVideos` — the Levels-tab `<video>` thumbnails currently mounted; paused/released on
  rebuild and close (`:49-50`).
- `_visOutsideHandler` — the single tracked document-level "click outside to close" handler for the
  Visible Levels dropdowns (`:51-52`).
- `_initialLevelIndex` — zero-based initial level, default `0` (`:53-54`).
- `_restoredDefaults` — guards the one-time restore of persisted selections on first render
  (`:55-56`).

**`DEFAULT_OPTIONS`** (`scripts/importer-dialog.js:57-76`):

- `id: "da-importer"`, `tag: "form"`, `form.closeOnSubmit: false`.
- `window.title`, `window.resizable: false`; `position.width: 620` (widened in v0.0.3 to fit the
  Visible column — `CHANGELOG.md:37`), `height: "auto"`.
- **`actions`** map (the ApplicationV2 click-delegation system; keyed by `data-action` in the
  template): `browse → #onBrowse`, `import → #onImport`, `previewSound → #onPreviewSound`
  (`:71-75`).

**`PARTS`** (`scripts/importer-dialog.js:78-82`): a single `form` part →
`modules/da-level-importer/templates/importer.hbs`.

<a name="persisted-dialog-defaults"></a>
### Persisted dialog defaults (`game.settings`)

The dialog remembers a handful of selections **per client** across opens, backed by the hidden
setting registered in `init` (`scripts/main.js:8-13`, key `SETTING_IMPORTER_DEFAULTS`). Two methods
bracket the lifecycle:

- **`_restoreSavedDefaults()`** (`scripts/importer-dialog.js:137-156`): runs **once**, guarded by
  the `_restoredDefaults` flag (`:138-139`) so later re-renders can't clobber in-progress edits. It
  `game.settings.get`s the saved object (tolerating a thrown/absent setting via try-catch; `:141-142`)
  and writes each remembered value back into the corresponding input — `backgroundColor`,
  `gridAlpha`, `doorTexture`, `doorSound` via a `setValue` helper (`:145-153`), and the `copyImages`
  checkbox's `checked` state (`:154-155`). It is invoked at the **top** of `_onRender` (`:179`) so
  the range-display and door-preview wiring below reflect the restored values.
- **`_saveCurrentDefaults({...})`** (`scripts/importer-dialog.js:159-165`): called from `#onImport`
  just before the import runs (`:542`); `game.settings.set`s the same five fields. Failures are
  swallowed as non-fatal (`:160-164`).

Remembered fields: background color, grid alpha, door texture, door sound, and the Copy-Media
toggle. (The Levels-tab per-row inputs are **not** persisted — they depend on the selected folder.)

### Tabbed UI (`templates/importer.hbs` + `_onRender`)

The template declares three tab buttons and three panels keyed by `data-tab`: **Scene Defaults**,
**Doors**, **Levels** (`templates/importer.hbs:14-18`, panels at `:20`, `:67`, `:145`). The Scene
Defaults tab is active by default (`da-tab-btn--active`, `templates/importer.hbs:15`).

Tab switching is wired in `_onRender` (`scripts/importer-dialog.js:192-205`): clicking a
`.da-tab-btn` toggles `da-tab-btn--active` + `aria-selected` on the buttons and
`da-tab-panel--hidden` on the panels. (`.da-tab-panel--hidden { display: none }`,
`styles/module.css:59-61`.)

`_onRender` (`scripts/importer-dialog.js:176-255`) also handles:

- **Restore persisted defaults** first thing (`:179`) — see
  [Persisted dialog defaults](#persisted-dialog-defaults).
- **Grid-alpha range sync** (`:182-189`) — mirrors the slider value into `.range-value`, formatted
  to 2 decimals.
- **Door texture preview + tooltip** (`:208-236`) — sets `.da-door-preview` `src` from the
  `doorTexture` select and shows an enlarged hover tooltip appended to `document.body`
  (`:219-235`).
- **Uniform floor-height recompute** (`:239-251`) — on change, recalculates every
  `levelBottom[i]`/`levelTop[i]` input using `i === 0 ? 0 : i*h+1` and `(i+1)*h`, mirroring the
  importer's defaults.
- Finally re-runs `_populateLevelsTab()` so rows survive any re-render (`:254`).

### Doors tab

Pure template (`templates/importer.hbs:67-143`): a 25-option **door texture** `<select>` (each value
a `canvas/doors/...webp` path; `:73-100`) with the preview `<img class="da-door-preview">`
(`:101`), and a 21-option **door sound** `<select>` (`:111-134`) with a `previewSound` button
(`:135-137`). `#onPreviewSound` (`scripts/importer-dialog.js:122-129`) resolves the selected key
through `CONFIG.Wall.doorSounds`, picks `open` (falling back to `close`), and plays it via
`foundry.audio.AudioHelper.play(...)`.

### Levels-tab construction (`_populateLevelsTab`, `scripts/importer-dialog.js:299-508`)

This method **fully rebuilds** the Levels list from `this._floorPairs`. It is called after a folder
browse (`:106`) and after every render (`:254`).

1. **Teardown** prior body dropdowns via `_teardownVisDropdowns()` (`:300` → `:262-267`) **and**
   prior video thumbnails via `_teardownThumbVideos()` (`:301` → `:282-287`).
2. **Placeholder vs list** (`:303-314`): with no pairs, the
   `.da-levels-placeholder` ("Select a folder above…", `templates/importer.hbs:157`) is shown and
   the list cleared; otherwise the placeholder is hidden and the list rebuilt.
3. **Header row** (`:316-324`): columns `# · "" · Name · Bottom · Top · Roof · Start · Visible`.
4. **First pass — one `.da-level-row` per floor** (`:327-410`):
   - Index badge (`:336-338`).
   - **Thumbnail** via `_buildThumbEl(pair.media, "da-level-thumb", { animate: false })` (`:340`) —
     paused on its first frame; if it's a `<video>` it's pushed onto `_thumbVideos` for later
     teardown (`:341`). A hover tooltip media built with `_buildThumbEl(pair.media, "", { animate:
     true })` (autoplaying) is appended to `document.body` (`:343-359`); on mouse-leave the tooltip
     video is paused before removal (`:355-359`).
   - `levelName[i]` text input defaulting to `` `Floor ${i}` `` (`:361-365`).
   - `levelBottom[i]` / `levelTop[i]` number inputs seeded with the `FLOOR_HEIGHT` defaults
     (`:330-331`, `:367-379`).
   - **Roof toggle** `levelIsRoof[i]` — a styled checkbox with the roof-behavior tooltip
     (`:382-395`).
   - **Initial-level star button** (`:398-405`) — `★`/`☆`, `da-initial-btn--active` when
     `i === this._initialLevelIndex`.
5. **Initial-level wiring** (`:413-424`): clicking any star sets `_initialLevelIndex` and resets all
   other stars — a radio-style, single-select toggle.
6. **Second pass — Visible Levels dropdown per row** (`:429-507`): see below.

#### The Visible Levels dropdowns (and why they're appended to `document.body`)

Built in the second pass so that, by the time a dropdown is created, **all** rows (and their
name inputs) exist and each dropdown can list *every other* level by name
(`scripts/importer-dialog.js:429-456`):

- Each row gets a `.da-vis-wrap` containing a `.da-vis-btn` and a `.da-vis-dropdown`.
- The dropdown is `document.body.appendChild`'d and tracked in `_visDropdowns`
  (`:442-443`).
- For every other level `j`, a checkbox `levelVisibility[i][j]` is created, registered in
  `_visCheckboxes` under key `` `${i},${j}` `` (`:445-456`), labeled with that level's name.
- The button label (`updateBtn`, `:462-477`) shows `— ▾` for none, `N ▾` for a single selection,
  and `Many ▾` (with a `title` listing all indices) for multiple.
- Clicking the button (`:479-503`) closes all other dropdowns and drops any prior outside-click
  handler via `_removeVisOutsideHandler()` (`:485`), positions this one using
  `getBoundingClientRect()` + `position: fixed`, and installs a deferred outside-click handler — now
  **tracked on the instance** as `_visOutsideHandler` (via `setTimeout(..., 0)` so the opening click
  doesn't immediately close it; `:493-501`).

**Why `document.body`:** the dropdown is `position: fixed` (`styles/module.css:308-319`).
Foundry's ApplicationV2 window uses a CSS `transform` for positioning, and a `position: fixed`
descendant of a transformed ancestor is positioned **relative to that transformed ancestor**, not
the viewport — so the dropdown would land at the wrong screen coordinates. Re-parenting it to
`document.body` (outside the window's transform) makes its fixed coordinates viewport-relative again
(comments at `scripts/importer-dialog.js:296-298`, `:427-428`, and `styles/module.css:306-307`).
The trade-off is manual lifecycle management: dropdowns are explicitly removed in
`_teardownVisDropdowns()` (`:262-267`) — which also calls `_removeVisOutsideHandler()` (`:270-275`)
to drop the single tracked outside-click listener — and the whole teardown runs again on `_onClose`
(`:517-525`).

#### Thumbnails: image-vs-video, paused vs animated (`_buildThumbEl`, `isVideoPath`)

`_buildThumbEl(src, className, { animate = false })` (`scripts/importer-dialog.js:21-40`): builds a
`<video>` when `isVideoPath(src)`, otherwise an `<img>` (`:22-23`). Videos are always `muted`,
`loop`, `playsInline`, but **autoplay is gated on the `animate` option**: `el.autoplay = animate`
and `el.preload = animate ? "auto" : "metadata"` (`:29-34`). So the small row thumbnail
(`animate:false`) sits **paused on its first frame** — a tall building doesn't spin up N video
decoders at once — while the enlarged **hover tooltip** (`animate:true`) autoplays. A load/decode
error tags the element `da-thumb-error` and logs a `console.warn` (`:25-28`); the CSS then renders a
hatched placeholder (see [Thumbnail states](#thumbnail-states)).

`isVideoPath(path)` (`scripts/da-importer.js:46-51`, exported): strips any `?`/`#` query/hash, takes
the lowercased extension, and returns whether it's in `VIDEO_EXTS`. It's used for both the row
thumbnail and the hover tooltip (`scripts/importer-dialog.js:340`, `:348`), and the tooltip CSS sizes
`img` and `video` identically (`styles/module.css:392-398`).

<a name="thumbnail-states"></a>
**Video thumbnail teardown.** Because detached `<video>` elements keep decoding until GC,
`_teardownThumbVideos()` (`scripts/importer-dialog.js:282-287`) pauses each tracked video, clears its
`src`, and calls `load()` to release it. It runs before the list is rebuilt (`:301`) and on close
(`:519`). The error-state appearance is the `.da-level-thumb.da-thumb-error` rule
(`styles/module.css:374-377`) — a hatched gradient placeholder with a red border instead of a blank
box.

### Import handler & teardown

- **`#onImport`** (`scripts/importer-dialog.js:527-559`): reads `folder`/`source` (warns if no
  folder; `:528-533`), reads `backgroundColor`/`gridAlpha`/`copyImages`/`doorTexture`/`doorSound`
  (`:535-539`), **persists those five via `_saveCurrentDefaults(...)`** (`:542`), then builds
  `levelOverrides` by reading each row's inputs — `name`, `bottom`, `top`, `isRoof`, and
  `visibleLevels` (resolved from `_visCheckboxes`; `:544-555`). It calls `importFolder(...)` with
  `initialLevelIndex: this._initialLevelIndex` (`:557`) and closes on success (`:558`). Note the UI
  toggle is labelled **"Copy Media to World"** (`templates/importer.hbs:47`) but the param/field is
  still named `copyImages`.
- **`_onClose`** (`scripts/importer-dialog.js:517-525`): tears down body dropdowns (`:518`) **and
  video thumbnails** (`:519`), pauses and removes any lingering door/level tooltips — pausing the
  level tooltip's `<video>` before removal (`:520-523`) — then delegates to `super._onClose`.

---

## 5. The Region Adder

Goal: bind a **single** Region document to several **consecutive** levels and attach a native
`changeLevel` behavior, so one shape acts as a transit point (stairs/ladder/elevator) across floors
(`scripts/region-adder.js:1-12`, `:111-129`).

### Helpers (`scripts/region-adder.js`)

- **`getSceneLevels(scene)`** (`:22-34`): returns the scene's levels **sorted ascending by
  `elevation.bottom`** (bottom floor first). It tolerates both a Collection (`.contents`) and a
  plain array, since v14 may hydrate `scene.levels` either way (`:29-32`).
- **`getCurrentLevelId(scene)`** (`:45-59`): best-effort detection of the level being viewed. It
  probes, in order, `canvas.scene.activeLevel._id`, `canvas.environment.activeLevel._id`,
  `canvas.activeLevel._id`, `game.user.activeLevel`, then `scene.initialLevel`, finally falling
  back to the bottom-most level (`:47-58`). These are candidate properties across the v14 canvas
  pipeline; the layered fallback is intentional because the exact source varies with canvas state.
- **`pickCanvasPosition()`** (`:71-109`): resolves the next left-click's world coordinates
  (`canvas.mousePosition`). Listeners are attached in **capture phase** (`true`) so they fire before
  Foundry's own canvas handlers, avoiding accidental token selection/drag (`:105-106`).
  `Escape` rejects with an `Error("cancelled")` (`:90-97`); both paths run `cleanup()` to remove
  listeners and the `da-region-picking` body class (`:99-103`) — the latter drives the crosshair
  cursor (`styles/module.css:497-500`).
- **`createMultiLevelRegion({ scene, x, y, levelIds, name })`** (`:130-181`): validates a non-empty
  `levelIds` (`:131-134`), resolves the matching level objects (`:137-140`), computes the region's
  elevation span as `[min(bottom), max(top)]` over those levels (`:142-143`), and builds the region
  data (see [§3](#region-document)). The shape is a **1-grid-square rectangle centered on the
  click** (`x - gridSize/2`, `y - gridSize/2`, `width/height = gridSize`; `:158-165`). It then calls
  `scene.createEmbeddedDocuments("Region", [regionData])` and returns the created document
  (`:179-180`).

> Single region, not one per floor: `Region.levels` is a Set of ids, so one document appears on
> every requested floor, and `changeLevel` lets the user pick the destination at runtime
> (`scripts/region-adder.js:117-122`).

### Dialog (`scripts/region-adder-dialog.js` + `templates/region-adder.hbs`)

`DARegionAdderDialog` (`scripts/region-adder-dialog.js:19-229`) — also
`HandlebarsApplicationMixin(ApplicationV2)`. `DEFAULT_OPTIONS` (`:20-38`): `id: "da-region-adder"`,
`tag: "form"`, `classes: ["da-region-adder"]`, `width: 420`, `height: "auto"`, single action
`pickLocation → #onPickLocation`. `PARTS` → `templates/region-adder.hbs` (`:40-44`).

- **`_prepareContext`** (`:55-78`): the ApplicationV2 data-prep stage. If there's no active scene or
  no levels, returns `{ hasScene: false }` (the template then renders the empty state,
  `templates/region-adder.hbs:2-3`). Otherwise computes the current level index, the per-level
  dropdown options (with the current one `selected`), and **`maxUp`/`maxDown`** — how many floors
  exist above/below the current one (`:69-77`). These bound the number inputs
  (`templates/region-adder.hbs:31`, `:42`).
- **`_onRender`** (`:88-102`): wires the starting-level `<select>` `change` (→ `#updateLimits` +
  `#refreshPreview`) and the up/down `input` events (→ `#refreshPreview`), then seeds the preview.
- **`#updateLimits`** (`:122-138`): after the starting level changes, recomputes the up/down maxima
  and clamps the current values so the user can never select out of bounds.
- **`#computeTargetLevelIds`** (`:166-184`): resolves the **contiguous, inclusive** range
  `[idx - down … idx + up]` (clamped to the scene), returning level ids **ascending by elevation**.
- **`#refreshPreview`** (`:144-157`): re-renders the `.da-region-target-list` `<ul>`
  (`templates/region-adder.hbs:49`) with the formatted labels (name + elevation range,
  `#formatLevelLabel` at `:111-115`) of the currently-targeted levels.
- **`#onPickLocation`** (`:198-228`): the action handler. Validates an active scene
  (`:199-203`) and a non-empty target set (`:204-208`), **closes the dialog** (`:210`), prompts the
  user to click (`:211`), awaits `pickCanvasPosition()` (cancel → info notification; `:213-219`),
  then calls `createMultiLevelRegion(...)` and notifies success/failure (`:221-227`).

```mermaid
sequenceDiagram
  participant U as User
  participant D as DARegionAdderDialog
  participant H as region-adder.js helpers
  participant S as Scene

  U->>D: DA.AddRegion()
  D->>H: getSceneLevels / getCurrentLevelId
  H-->>D: sorted levels + current id
  D->>U: render (Starting Level, Up, Down, live preview)
  U->>D: adjust → #refreshPreview (#computeTargetLevelIds)
  U->>D: click "Pick Location" (#onPickLocation)
  D->>D: validate + this.close()
  D->>H: pickCanvasPosition() [capture-phase listeners]
  U->>H: left-click on canvas (or Esc → cancel)
  H-->>D: {x, y}
  D->>H: createMultiLevelRegion({scene, x, y, levelIds})
  H->>S: scene.createEmbeddedDocuments("Region", [regionData])
  S-->>U: region appears on all target levels (changeLevel behavior)
```

---

## 6. v14-Specific APIs Relied Upon

- **Native Scene Levels.** The whole import targets `scene.levels[]` — the v14 feature that lets one
  Scene hold multiple floors (`scripts/da-importer.js:214-241`, `:300`; read back at `:321`).
  Each level carries `_id`, `elevation`, `background`, `visibility.levels`, `sort`, etc. — the
  full shape in [§3](#scene-level-object).
- **`SceneLevelsSetField` on walls/lights** — the `levels` field (a Set of Level `_id`s) on
  `BaseWall` and `BaseAmbientLight`. The module emits `levels: [levelId]` per document
  (`scripts/da-importer.js:443`, `:480`; rationale at `:1-16`, `:423-433`). The same Set-of-ids
  field exists on `Region` (`scripts/region-adder.js:149`).
- **`initialLevel`** — the Scene field naming the floor shown on load; set from the dialog's star
  selection (`scripts/da-importer.js:301`) and consulted as a fallback by `getCurrentLevelId`
  (`scripts/region-adder.js:52`).
- **`visibility.levels`** on a Level — controls which other floors are co-visible when that level is
  active; populated by the roof + Visible-Levels merge (`scripts/da-importer.js:246-255`).
- **`game.settings.register` / `get` / `set`** — a **client-scoped, `config:false`** setting
  (`SETTING_IMPORTER_DEFAULTS`) registered on `init` (`scripts/main.js:8-13`) and read/written by the
  dialog to remember last-used selections across opens (`scripts/importer-dialog.js:141`, `:161`).
- **`foundry.applications.apps.FilePicker.implementation`** — the v14 FilePicker entry point, used
  for `browse`, `createDirectory`, and `upload` (`scripts/da-importer.js:81`, `:119`, `:145`;
  `scripts/importer-dialog.js:85`). Probing existence via `browse` throwing is an intentional
  idiom (`scripts/da-importer.js:92-98`).
- **`foundry.applications.api.ApplicationV2` + `HandlebarsApplicationMixin`** — both dialogs are
  ApplicationV2 (`scripts/importer-dialog.js:4`, `:42`; `scripts/region-adder-dialog.js:8`, `:19`).
  This brings the `static PARTS` template system, the `static DEFAULT_OPTIONS.actions` click map
  (handlers invoked with `this` bound to the instance), and lifecycle stages `_prepareContext` /
  `_onRender` / `_onClose`.
- **ApplicationV2 render hook signature** — `renderSceneDirectory` passes a raw `HTMLElement`, which
  `main.js` uses with `querySelector`/`insertBefore` (`scripts/main.js:32-48`).
- **`CONFIG.Wall.doorSounds`** — the registry mapping door-sound keys to `{ open, close }` file
  paths; used for the sound preview (`scripts/importer-dialog.js:125-128`). The selected key is
  also stamped onto door walls as `doorSound` (`scripts/da-importer.js:447`).
- **`foundry.audio.AudioHelper.play(...)`** — plays the door-sound preview
  (`scripts/importer-dialog.js:128`).
- **`foundry.utils.randomID()`** — generates Level `_id`s (`scripts/da-importer.js:222`).
- **`scene.createEmbeddedDocuments("Region", ...)`** with a `changeLevel` **Region Behavior**
  (`type: "changeLevel"`) — the native multi-level transit mechanism
  (`scripts/region-adder.js:168-179`).
- **`Scene.create(...)`** — top-level Scene creation (`scripts/da-importer.js:310`).
- **Canvas access** — `canvas.scene`, `canvas.mousePosition`, `canvas.app.view`, and the candidate
  `*.activeLevel` properties for current-level detection (`scripts/region-adder.js:47-53`, `:73`,
  `:85`).

> **Uncertainty noted:** `getCurrentLevelId` probes *several* candidate `activeLevel` locations
> precisely because the authoritative source isn't fixed across v14 canvas states
> (`scripts/region-adder.js:46-59`). Likewise `getSceneLevels` handles both Collection and array
> shapes (`:29-32`). These are deliberate hedges against v14 API surface that the code treats as not
> fully settled — not signs of a bug.

---

## 7. Extension Points — Where to Change Things

- **Support a new background format.** Add the extension to `IMAGE_EXTS` or `VIDEO_EXTS`
  (`scripts/da-importer.js:27-28`); `MEDIA_EXTS` (`:29`), the pairing filter (`:344`), `isVideoPath`
  (`:46-51`), and `_buildThumbEl` (`scripts/importer-dialog.js:21-40`) all derive from those two
  arrays, so a one-line change propagates. **Also add it to `MEDIA_PRIORITY`**
  (`scripts/da-importer.js:36`), which decides which file wins when a floor ships several — a new
  extension absent from that list ranks `Infinity` (least-preferred) and would never be chosen over
  a listed sibling.
- **Change floor pairing / sorting.** The suffix regex is `FLOOR_RE` (`scripts/da-importer.js:20`),
  consumed by `collectFloorPairs` (`:369`) and `_commonStem` (`:391`). Pairing logic, the
  one-media-per-floor `MEDIA_PRIORITY` rule, and the orphan-warning live in `collectFloorPairs`
  (`:336-382`); the sort comparator is at `:380`.
- **Add / change door options.** Door **texture** options are template `<option>`s
  (`templates/importer.hbs:73-100`); door **sound** options at `:111-134` (values must be valid
  `CONFIG.Wall.doorSounds` keys). The application of texture/sound to door walls is in `_mapWall`
  (`scripts/da-importer.js:445-448`) — change the animation `type` or add new door doc fields here.
- **Add a per-level field (Levels tab).** Three coordinated edits: (1) render the input in the
  first pass of `_populateLevelsTab` and extend the header columns
  (`scripts/importer-dialog.js:316-324`, `:327-410`) — and update the CSS grid template
  `grid-template-columns` at `styles/module.css:266`; (2) read it into `levelOverrides` in
  `#onImport` (`scripts/importer-dialog.js:544-555`); (3) consume it when building `levels[]` in
  `importFolder` (`scripts/da-importer.js:214-255`).
- **Persist a new dialog default.** Add the field to the `_saveCurrentDefaults({...})` payload and
  call site (`scripts/importer-dialog.js:159-165`, `:542`) and restore it in `_restoreSavedDefaults`
  (`:137-156`). The setting itself is registered in `init` (`scripts/main.js:8-13`); its key is
  `SETTING_IMPORTER_DEFAULTS` (`scripts/constants.js:14`).
- **Change default elevation math.** `FLOOR_HEIGHT` (`scripts/constants.js:8`) is the single source;
  the default formulas appear in three places that must stay consistent: the importer
  (`scripts/da-importer.js:217-218`), the row seeds (`scripts/importer-dialog.js:330-331`), and the
  uniform-height recompute (`scripts/importer-dialog.js:247-248`).
- **Change Scene-wide defaults** (grid style, fog, environment/global-light, padding). Edit the
  `sceneData` literal in `importFolder` (`scripts/da-importer.js:269-304`).
- **Change wall sense/movement mapping.** `_senseEnum` (`scripts/da-importer.js:403-407`, for
  sight/sound) and `_moveEnum` (`:419-421`, for movement) are the only places DA's 0/1/2 scheme is
  translated to Foundry's `WALL_SENSE_TYPES` / `WALL_MOVEMENT_TYPES` enums; they are wired up in
  `_mapWall` (`:438-440`).
- **Change light defaults.** `_mapLight` (`scripts/da-importer.js:462-482`) — e.g. enable vision,
  add animation, or change `luminosity`/`coloration`.
- **Change region shape / behavior / color.** `createMultiLevelRegion`
  (`scripts/region-adder.js:130-181`): the rectangle/grid-square geometry (`:154-167`), the
  `changeLevel` behavior block (`:168-176`), color (`:147`), or elevation span (`:142-143`). To
  change how the target range is chosen, edit `#computeTargetLevelIds`
  (`scripts/region-adder-dialog.js:166-184`).
- **Add a new dialog action / button.** Add an entry to the relevant `DEFAULT_OPTIONS.actions` map
  (`scripts/importer-dialog.js:71-75` or `scripts/region-adder-dialog.js:35-37`) and a matching
  `data-action="..."` element in the template.
- **Module identity.** `MODULE_ID` (`scripts/constants.js:2`) must match `module.json:2`; the
  template paths in `PARTS` are hard-coded to `modules/da-level-importer/...`
  (`scripts/importer-dialog.js:80`, `scripts/region-adder-dialog.js:42`) and would need updating if
  the id changes.

---

*Generated from source at v0.0.5. Keep `file:line` references in sync when the source changes.*
