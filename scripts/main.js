import { DAImporterDialog } from "./importer-dialog.js";
import { DARegionAdderDialog } from "./region-adder-dialog.js";
import { startAddStairs, startLinkRegions } from "./portal/portal-wizard.js";
import { MODULE_ID, SETTING_IMPORTER_DEFAULTS } from "./constants.js";

Hooks.once("init", () => {
  // Per-client memory of the importer dialog's last-used selections (door
  // texture/sound, scene colors, copy toggle). Hidden from the Settings UI.
  game.settings.register(MODULE_ID, SETTING_IMPORTER_DEFAULTS, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.modules.get(MODULE_ID).api = {
    Importer: () => new DAImporterDialog().render(true),
    // New native-teleport stairs/portal flow (place entrance -> switch level -> place exit).
    AddStairs: (opts) => startAddStairs(canvas?.scene, opts),
    // Link two already-selected Regions into a teleport pair.
    LinkStairs: (opts) => startLinkRegions(canvas?.scene, opts),
    // Legacy: the original single-region changeLevel tool (kept available, no button).
    AddRegion: () => new DARegionAdderDialog().render(true)
  };
});

Hooks.once("ready", () => {
  window.DA = game.modules.get(MODULE_ID).api;
});

/**
 * Injects the DA Level Importer and Add Stairs/Region buttons into the Scenes
 * directory header. Fires on every render of SceneDirectory.
 *
 * @param {SceneDirectory} _app
 * @param {HTMLElement} html
 */
Hooks.on("renderSceneDirectory", (_app, html) => {
  if (html.querySelector(".da-importer-sidebar-btn")) return;

  const header = html.querySelector(".directory-header");
  if (!header) return;

  const api = game.modules.get(MODULE_ID).api;

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "da-importer-sidebar-btn";
  importBtn.innerHTML = '<i class="fas fa-file-import"></i> DA Level Importer';
  importBtn.addEventListener("click", () => api.Importer());

  const stairsBtn = document.createElement("button");
  stairsBtn.type = "button";
  stairsBtn.className = "da-region-sidebar-btn";
  stairsBtn.innerHTML = '<i class="fas fa-stairs"></i> DA Add Stairs / Portal';
  stairsBtn.dataset.tooltip = "Place an entrance, switch level, place an exit — linked as a native teleport (stairs, elevator, or same-map teleport)";
  stairsBtn.addEventListener("click", () => api.AddStairs());

  // Insert after the native action buttons (Create Scene / Create Folder) so the
  // buttons sit between those and the search bar, regardless of v14's markup.
  const actionButtons = header.querySelector(".action-buttons") ?? header.querySelector(".header-actions");
  const anchor = actionButtons ? actionButtons.nextSibling : null;
  header.insertBefore(importBtn, anchor);
  header.insertBefore(stairsBtn, anchor);
});
