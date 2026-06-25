# RChery for Obsidian

An Obsidian plugin for recording archery scores. Each scorecard is its own `.rchery` note with **View** mode for interactive entry and **Edit** mode for raw markup.

## Features

- Dedicated `.rchery` scorecard files (the file is the data source)
- **View mode** — score entry via target face or score pad, with Undo
- **Edit mode** — edit the underlying markdown tables directly
- Configurable layouts via presets (Indoor, Outdoor, and custom presets in settings)
- **Default folder** — choose where new scorecards are created, with folder autosuggest as you type
- **Target face** — drag to place arrows on a WA-style face; per-end and per-arrow visibility toggles
- **End notes** — attach markdown notes to individual ends
- **Session review** — inline recap of scores, target placements, and notes when a session is complete
- Auto-calculated end totals and grand totals
- Mobile-friendly layout with configurable touch offset for target scoring
- Scores persist in the file on every change

## Optional dependencies (full functionality)

RChery works on its own for scoring. For training stats, tables, and charts across your scorecards, install these community plugins:

| Plugin | Repository | Purpose |
|--------|------------|---------|
| **Dataview** | [blacksmithgu/obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview) | Query `.rchery` files and aggregate session stats |
| **Charts** | [phibr0/obsidian-charts](https://github.com/phibr0/obsidian-charts) | Interactive charts from Dataview results |

In Community plugins, search for **Dataview** and **Charts** by **phibr0** (not Charts View or similar). Enable **JavaScript queries** in Dataview settings.

See [`docs/archery-stats-dashboard.md`](docs/archery-stats-dashboard.md) for a ready-to-copy stats dashboard note.

## Installation

Install from **Obsidian Community plugins** by searching for **RChery**, or download the latest release from [GitHub Releases](https://github.com/inlinkz/obsidian-rchery/releases).

For a manual install, copy `main.js`, `manifest.json`, `styles.css`, and `versions.json` into `Vault/.obsidian/plugins/rchery/`, then enable the plugin in **Settings → Community plugins**.

## Usage

1. In **Settings → RChery**, set **Default folder** if you want new scorecards saved somewhere specific (e.g. `Archery/Scorecards`). Start typing to see matching vault folders and pick one from the list. Leave it empty to use Obsidian’s default new-file location.
2. Click the **target** ribbon icon or run **New scorecard** to create a scorecard file.
3. Choose a layout preset if the scorecard is empty (Indoor, Outdoor, or a custom preset from settings).
4. The scorecard opens in **View** mode — use the target face or score pad to enter arrows in order.
5. Toggle target visibility per end or arrow column to focus on what you are scoring.
6. Add end notes via the sticky-note button on each row.
7. Use **Undo** to remove the last arrow.
8. Switch to **Edit** to view or change the raw markdown markup.
9. Switch back to **View** to apply edits and continue interactive entry.
10. Run **Reset scorecard** to clear the open scorecard.

## File format

Each `.rchery` file contains markdown tables between HTML comment markers:

```markdown
<!-- archery-scorecard:start -->

### Scorecard 1
| End | 1 | 2 | 3 | 4 | 5 | 6 | Total |
...

<!-- archery-scorecard:end -->
```

In View mode the plugin regenerates this content when you enter scores. In Edit mode you can adjust it manually; switch to View to parse and apply your changes.

## Changelog

### Unreleased
- **Added** default folder setting for new scorecards
- **Added** folder autosuggest in settings — matching vault folders appear as you type

### 1.0.13
- **Fixed** target-face dragging on mobile — touch gestures no longer scroll the workspace or hide the placement preview

### 1.0.12
- **Added** end notes per end with a markdown editor modal
- **Added** inline session review showing scores, target placements, and notes
- **Added** per-end and per-arrow visibility toggles on the target face
- **Added** running end totals and an improved Total column show/hide-all control
- **Added** end color coding on the target face

### 1.0.11
- **Improved** settings tab layout with section headings for Obsidian UI consistency

### 1.0.10
- **Fixed** Obsidian version compatibility and `versions.json` handling

### 1.0.9
- Version alignment release

### 1.0.8
- **Updated** minimum Obsidian version requirement

### 1.0.7
- Version alignment release

### 1.0.6
- **Added** preset-based settings (Indoor, Outdoor, custom presets)
- **Improved** command naming and settings organization
- **Fixed** target face rendering in pop-out windows

### 1.0.5
- **Added** session metadata and stats fields for Dataview queries
- **Added** stats dashboard documentation
- **Fixed** arrow placement validation edge cases

### 1.0.4
- **Added** target face scoring with drag-to-place arrows
- **Added** touch offset setting for mobile target scoring
- **Added** color-coded score pad and read-only embed rendering
- **Renamed** plugin and file extension to RChery (`.rchery`)
- **Improved** scorecard filenames now include date and time

### 1.0.3
- **Added** Indoor/Outdoor presets and custom preset management
- **Improved** mobile UI responsiveness

### 1.0.2
- **Improved** scorecard layout and overall UI styling

### 1.0.1
- **Added** configurable scorecard dimensions (cards, ends, arrows)
- **Added** plugin settings tab
- **Improved** layout resizing

### 1.0.0
- **Initial release** — `.rchery` scorecard files, View/Edit modes, button score entry, Undo, and auto-calculated totals

## License

[RChery Plugin License (Attribution Required)](LICENSE) — you may use and modify this plugin, but any distribution or derivative work must credit [rchery.app](https://rchery.app) and the [original RChery plugin](https://github.com/inlinkz/obsidian-rchery).
