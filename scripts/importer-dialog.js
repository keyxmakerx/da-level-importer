import { importFolder } from "./da-importer.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DAImporterDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "da-importer",
    tag: "form",
    form: {
      closeOnSubmit: false
    },
    window: {
      title: "Dungeon Alchemist Level Importer",
      resizable: false
    },
    position: {
      width: 480,
      height: "auto"
    },
    actions: {
      browse: DAImporterDialog.#onBrowse,
      import: DAImporterDialog.#onImport
    }
  };

  static PARTS = {
    form: {
      template: "modules/da-level-importer/templates/importer.hbs"
    }
  };

  static async #onBrowse(_event, _target) {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    const picker = new FilePicker({
      type: "folder",
      current: "",
      callback: (path) => {
        const folderInput = this.element.querySelector("input[name='folder']");
        const sourceInput = this.element.querySelector("input[name='source']");
        if (folderInput) folderInput.value = path;
        if (sourceInput) sourceInput.value = picker.activeSource ?? "data";
      }
    });
    await picker.browse("");
  }

  /**
   * Wire the grid-alpha range input to its adjacent display span.
   * Triggered by the ApplicationV2 _onRender lifecycle stage after each render.
   *
   * @param {ApplicationRenderContext} _context
   * @param {ApplicationRenderOptions} _options
   * @override
   */
  _onRender(_context, _options) {
    const range = this.element.querySelector("input[name='gridAlpha']");
    const display = this.element.querySelector(".range-value");
    if (!range || !display) return;

    // Sync the label to the current value on first render.
    display.textContent = parseFloat(range.value).toFixed(2);

    range.addEventListener("input", () => {
      display.textContent = parseFloat(range.value).toFixed(2);
    });
  }

  static async #onImport(_event, _target) {
    const folder = this.element.querySelector("input[name='folder']")?.value?.trim();
    const source = this.element.querySelector("input[name='source']")?.value?.trim() || "data";
    if (!folder) {
      ui.notifications.warn("Please select a folder first.");
      return;
    }

    const backgroundColor = this.element.querySelector("input[name='backgroundColor']")?.value ?? "#000000";
    const gridAlpha = parseFloat(this.element.querySelector("input[name='gridAlpha']")?.value ?? "0");
    const copyImages = this.element.querySelector("input[name='copyImages']")?.checked ?? false;

    const scene = await importFolder({ source, path: folder, backgroundColor, gridAlpha, copyImages });
    if (scene) this.close();
  }
}
