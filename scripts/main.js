import { DAImporterDialog } from "./importer-dialog.js";
import { DARegionAdderDialog } from "./region-adder-dialog.js";
import { MODULE_ID } from "./constants.js";

Hooks.once("init", () => {
  game.modules.get(MODULE_ID).api = {
    Importer: () => new DAImporterDialog().render(true),
    AddRegion: () => new DARegionAdderDialog().render(true)
  };
});

Hooks.once("ready", () => {
  window.DA = game.modules.get(MODULE_ID).api;
});

/**
 * Injects the DA Level Importer button into the Scenes directory header.
 * Fires on every render of SceneDirectory (ApplicationV2 lifecycle: renderSceneDirectory).
 *
 * @param {SceneDirectory} _app
 * @param {HTMLElement} html
 */
Hooks.on("renderSceneDirectory", (_app, html) => {
  if (html.querySelector(".da-importer-sidebar-btn")) return;

  const header = html.querySelector(".directory-header");
  if (!header) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "da-importer-sidebar-btn";
  btn.innerHTML = '<i class="fas fa-file-import"></i> DA Level Importer';
  btn.addEventListener("click", () => game.modules.get(MODULE_ID).api.Importer());

  // Insert after the native action buttons (Create Scene / Create Folder) so the button
  // sits between those and the search bar, regardless of the search element's tag/class in v14.
  const actionButtons = header.querySelector(".action-buttons") ?? header.querySelector(".header-actions");
  const anchor = actionButtons ? actionButtons.nextSibling : null;
  header.insertBefore(btn, anchor);
});
