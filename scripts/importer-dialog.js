import { importFolder, collectFloorPairs } from "./da-importer.js";
import { FLOOR_HEIGHT } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DAImporterDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {{stem:string, index:number, json:string, jpg:string}[]} */
  _floorPairs = [];
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
      import: DAImporterDialog.#onImport,
      previewSound: DAImporterDialog.#onPreviewSound
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
      callback: async (path) => {
        const folderInput = this.element.querySelector("input[name='folder']");
        const sourceInput = this.element.querySelector("input[name='source']");
        if (folderInput) folderInput.value = path;
        const source = picker.activeSource ?? "data";
        if (sourceInput) sourceInput.value = source;

        // Browse the folder so the Levels tab can show per-level rows.
        try {
          const listing = await FilePicker.browse(source, path);
          this._floorPairs = collectFloorPairs(listing.files);
        } catch (_err) {
          this._floorPairs = [];
        }
        this._populateLevelsTab();
      }
    });
    await picker.browse("");
  }

  /**
   * Plays the "open" sound for the currently selected door sound key as a preview.
   * Resolves the sound file path via CONFIG.Wall.doorSounds, which maps string keys
   * to their associated audio file paths in Foundry v14.
   *
   * Triggered by the ApplicationV2 action system on renderDAImporterDialog.
   *
   * @param {PointerEvent} _event
   * @param {HTMLElement} _target
   */
  static async #onPreviewSound(_event, _target) {
    const soundKey = this.element.querySelector("select[name='doorSound']")?.value;
    if (!soundKey) return;
    const soundConfig = CONFIG.Wall.doorSounds?.[soundKey];
    if (!soundConfig) return;
    const src = soundConfig.open ?? soundConfig.close;
    if (src) foundry.audio.AudioHelper.play({ src, volume: 1 });
  }

  /**
   * Wire the grid-alpha range input to its adjacent display span, set up tab
   * switching, and bind the door texture preview image.
   * Triggered by the ApplicationV2 _onRender lifecycle stage after each render.
   *
   * @param {ApplicationRenderContext} _context
   * @param {ApplicationRenderOptions} _options
   * @override
   */
  _onRender(_context, _options) {
    // Range slider display sync
    const range = this.element.querySelector("input[name='gridAlpha']");
    const display = this.element.querySelector(".range-value");
    if (range && display) {
      display.textContent = parseFloat(range.value).toFixed(2);
      range.addEventListener("input", () => {
        display.textContent = parseFloat(range.value).toFixed(2);
      });
    }

    // Tab switching
    const tabBtns = this.element.querySelectorAll(".da-tab-btn");
    const tabPanels = this.element.querySelectorAll(".da-tab-panel");
    for (const btn of tabBtns) {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        for (const b of tabBtns) {
          b.classList.toggle("da-tab-btn--active", b.dataset.tab === target);
          b.setAttribute("aria-selected", String(b.dataset.tab === target));
        }
        for (const panel of tabPanels) {
          panel.classList.toggle("da-tab-panel--hidden", panel.dataset.tab !== target);
        }
      });
    }

    // Door texture image preview — updates whenever the select changes
    const doorSelect = this.element.querySelector("select[name='doorTexture']");
    const doorPreview = this.element.querySelector(".da-door-preview");
    if (doorSelect && doorPreview) {
      const syncPreview = () => {
        doorPreview.src = doorSelect.value;
        doorPreview.hidden = !doorSelect.value;
      };
      syncPreview();
      doorSelect.addEventListener("change", syncPreview);

      // Hover tooltip — shows an enlarged version of the preview image
      let tooltip = null;
      doorPreview.addEventListener("mouseenter", () => {
        if (doorPreview.hidden || !doorPreview.src) return;
        tooltip = document.createElement("div");
        tooltip.className = "da-door-tooltip";
        const img = document.createElement("img");
        img.src = doorPreview.src;
        tooltip.appendChild(img);
        document.body.appendChild(tooltip);
        const rect = doorPreview.getBoundingClientRect();
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top  = `${rect.top - 8}px`;
      });
      doorPreview.addEventListener("mouseleave", () => {
        tooltip?.remove();
        tooltip = null;
      });
    }

    // Uniform floor-height field — when changed, recalculates all per-level inputs.
    const uniformInput = this.element.querySelector("input[name='uniformFloorHeight']");
    if (uniformInput) {
      uniformInput.addEventListener("change", () => {
        const h = parseInt(uniformInput.value, 10);
        if (!Number.isFinite(h) || h < 1) return;
        this._floorPairs.forEach((_, i) => {
          const bInput = this.element.querySelector(`input[name="levelBottom[${i}]"]`);
          const tInput = this.element.querySelector(`input[name="levelTop[${i}]"]`);
          if (bInput) bInput.value = String(i === 0 ? 0 : i * h + 1);
          if (tInput) tInput.value = String((i + 1) * h);
        });
      });
    }

    // Restore levels tab rows after any re-render.
    this._populateLevelsTab();
  }

  /**
   * Rebuild the Levels tab rows from this._floorPairs.
   * Called after folder selection and after each render.
   * Shows a placeholder when no folder has been selected yet.
   */
  _populateLevelsTab() {
    const placeholder = this.element?.querySelector(".da-levels-placeholder");
    const list = this.element?.querySelector(".da-levels-list");
    if (!list) return;

    if (!this._floorPairs.length) {
      if (placeholder) placeholder.hidden = false;
      list.innerHTML = "";
      return;
    }

    if (placeholder) placeholder.hidden = true;
    list.innerHTML = "";

    // Header row
    const header = document.createElement("div");
    header.className = "da-levels-header";
    for (const label of ["", "Name", "Bottom", "Top"]) {
      const span = document.createElement("span");
      span.textContent = label;
      header.appendChild(span);
    }
    list.appendChild(header);

    for (let i = 0; i < this._floorPairs.length; i++) {
      const pair = this._floorPairs[i];
      const defaultBottom = i === 0 ? 0 : i * FLOOR_HEIGHT + 1;
      const defaultTop = (i + 1) * FLOOR_HEIGHT;

      const row = document.createElement("div");
      row.className = "da-level-row";

      const thumb = document.createElement("img");
      thumb.className = "da-level-thumb";
      thumb.src = pair.jpg;
      thumb.alt = "";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.name = `levelName[${i}]`;
      nameInput.value = `Floor ${i}`;
      nameInput.placeholder = "Level name";

      const bottomInput = document.createElement("input");
      bottomInput.type = "number";
      bottomInput.name = `levelBottom[${i}]`;
      bottomInput.value = String(defaultBottom);
      bottomInput.min = "0";
      bottomInput.step = "1";

      const topInput = document.createElement("input");
      topInput.type = "number";
      topInput.name = `levelTop[${i}]`;
      topInput.value = String(defaultTop);
      topInput.min = "0";
      topInput.step = "1";

      row.append(thumb, nameInput, bottomInput, topInput);
      list.appendChild(row);
    }
  }

  /**
   * Remove any lingering door texture tooltip when the dialog closes.
   * Guards against the edge case where the mouse is over the preview at close time.
   *
   * @param {ApplicationCloseOptions} options
   * @override
   */
  async _onClose(options) {
    document.querySelector(".da-door-tooltip")?.remove();
    return super._onClose(options);
  }

  static async #onImport(_event, _target) {
    const folder = this.element.querySelector("input[name='folder']")?.value?.trim();
    const source = this.element.querySelector("input[name='source']")?.value?.trim() || "data";
    if (!folder) {
      ui.notifications.warn("Please select a folder first.");
      return;
    }

    const backgroundColor = this.element.querySelector("input[name='backgroundColor']")?.value || "#000000";
    const gridAlpha = parseFloat(this.element.querySelector("input[name='gridAlpha']")?.value ?? "0");
    const lastLevelIsRoof = this.element.querySelector("input[name='lastLevelIsRoof']")?.checked ?? false;
    const copyImages = this.element.querySelector("input[name='copyImages']")?.checked ?? false;
    const doorTexture = this.element.querySelector("select[name='doorTexture']")?.value || "";
    const doorSound   = this.element.querySelector("select[name='doorSound']")?.value   || "";

    const levelOverrides = this._floorPairs.map((_, i) => ({
      name:   this.element.querySelector(`input[name="levelName[${i}]"]`)?.value?.trim() || `Floor ${i}`,
      bottom: parseInt(this.element.querySelector(`input[name="levelBottom[${i}]"]`)?.value ?? "", 10),
      top:    parseInt(this.element.querySelector(`input[name="levelTop[${i}]"]`)?.value ?? "", 10)
    }));

    const scene = await importFolder({ source, path: folder, backgroundColor, gridAlpha, lastLevelIsRoof, copyImages, doorTexture, doorSound, levelOverrides });
    if (scene) this.close();
  }
}
