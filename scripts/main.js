import { DAImporterDialog } from "./importer-dialog.js";

Hooks.once("init", () => {
  game.modules.get("da-level-importer").api = {
    Importer: () => new DAImporterDialog().render(true)
  };
});

Hooks.once("ready", () => {
  window.DA = game.modules.get("da-level-importer").api;
});
