# Restructuring the AvNav Updater UI

Summary of the UI rework of the update plugin (`index.html`, `index.css`, `index.js`).

## Goals

- Mobile friendly and responsive; the page runs in an iframe, so it must not depend on fixed dimensions.
- Replace the package table with a card list showing all information and the checkboxes.
- Group the other controls: Status, Options, Refresh, Action, Tools.

## Layout

- **Package cards** (`ul#infoFrame`): name, state label, version line, "Select for update" checkbox.
- **Control groups** (`aside.sidebarFrame`):
  - Status: Internet and Auto Update on one row, AvNav state, Activity (list/action state plus Console button).
  - Options: Allow downgrade, Beta (with hints), Enable/Disable Beta.
  - Refresh: Reload, Refresh Package Info.
  - Action: Update Packages, Select all / Select none.
  - Tools: Restart AvNav, AvNav Log, AvNav Config.
- All original element IDs used by `index.js` are kept.

## Scrolling and responsiveness

- Header always visible; `html`/`body` do not scroll.
- Wide screens (above 760px): two columns. The package list scrolls on its own. The sidebar scrolls separately, with Status sticky at its top and the control boxes directly below it.
- Narrow screens (760px or less): one column. `#root` scrolls, Status is a compact sticky bar on top, followed by packages and then controls.
- The Console button is always visible; it is only enabled while an action runs.

## Visual design

- Package cards have a coloured left edge: green (update candidate), red (downgrade), grey (no candidate), pale grey (disabled).
- Control boxes are flat with an uppercase title and a dark underline, so they differ clearly from the cards.
- Disabled buttons are dimmed with a not-allowed cursor.
- The "Select for update" row is dimmed when its checkbox is disabled.
- Overlay dialog buttons (log, config, console, confirm) have gaps, padding, borders and a minimum width.

## Behaviour

- Update button is disabled when nothing is selected, and shows "Update N packages" otherwise.
- A confirm dialog lists `name: from -> to` (downgrades in red) and notes that AvNav is stopped during the update.
- Packages without a candidate have a disabled checkbox. Downgrade candidates are shown in red and only appear with Allow downgrade ticked.
- Version line `installed -> candidate`; "up to date" or "no candidate" when there is nothing newer.
- State labels with tooltips: Update available, Downgrade possible, Up to date, Not installed, Disabled.
- Filter chips (Updates, All, Disabled), a search box, and a count in the heading ("2 of 12 updatable"). The old "Show disabled packages" checkbox was replaced by the chips. The chips use the same button styling as the other buttons; the active one is dark blue-grey.
- "Updates" shows only installed packages with a newer candidate (not-installed and disabled packages are excluded); the heading count uses the same rule. Not-installed packages are listed under "All".
- Sorting: updates first, then downgrades, up to date, disabled; each group by name.
- Select all never selects packages that are not installed.
- The Activity row shows "Reading packages...", then "Package list updated", then "List read HH:MM". This is the time the browser read the list, not the apt refresh time.
- Toggling Allow downgrade rebuilds the list from cached data (`renderList`) without a new server request. `fetchList` only reads from the server.

## Known leftovers

- Select all still ticks downgrade candidates when Allow downgrade is on.
- Rebuilding the list resets manual checkbox selections.
- Possible later improvements: confirmation for Restart AvNav, disabling Tools buttons while an action runs, larger touch targets, visible focus outlines.
- A typo `retturn;` in `apiRequest` was left untouched.

## Testing notes

- Page served at `http://10.222.10.85:8085/index.html`.
- Browsers cache CSS and JS aggressively; use a hard refresh after changes.
- `fetchList` can take several seconds on the device.
