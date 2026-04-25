# 0.0.2

## [Added]
- Scenes directory sidebar button "DA Level Importer" injected below the search bar via the `renderSceneDirectory` hook for quick one-click access to `DA.Importer()`.
- Tabbed importer dialog: "Scene Defaults" and "Doors" tabs for organized settings.
- Door texture selector with 25 Foundry canvas door options; includes real-time preview with hover tooltip showing enlarged image.
- Door sound selector with 21 Foundry door sound options; includes play preview button to audition sounds before import.
- Automatic door texture and sound application: when importing, any wall with `door=1` receives the selected texture (with swing animation) and sound key.
- Multi-level region creation tool `DA.AddRegion()`: opens a dialog to configure a staircase/elevator transit region spanning multiple consecutive levels. User selects a starting level, specifies how many levels above and below should also have the region, then clicks on canvas to place. Single region document bound to all target levels with native `changeLevel` behavior.


