# RChery for Obsidian

An Obsidian plugin for recording archery scores. Each scorecard is its own `.rchery` note with **View** mode for button entry and **Edit** mode for raw markup.

## Features

- Dedicated `.rchery` scorecard files (the file is the data source)
- **View mode** — two 6-end × 6-arrow grids with 1–10 button entry and Undo
- **Edit mode** — edit the underlying markdown tables directly
- Auto-calculated end totals and grand totals
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

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to `Vault/.obsidian/plugins/rchery/`, then enable the plugin in Obsidian settings.

The folder name **must** match `id` in `manifest.json` (currently `rchery`).

For development, run `npm run dev` and symlink the project folder into your vault plugins directory.

## Usage

1. Click the **target** ribbon icon or run **New archery scorecard** to create a `Scorecard.rchery` file.
2. The scorecard opens in **View** mode — press **1–10** to enter arrows in order (scorecard 1, then scorecard 2).
3. Use **Undo** to remove the last arrow.
4. Switch to **Edit** to view or change the raw markdown markup.
5. Switch back to **View** to apply edits and continue interactive entry.
6. Run **Reset archery scorecard** to clear the open scorecard.

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

## Development

```bash
npm install
npm run dev
```

Reload Obsidian after code changes (`Ctrl/Cmd + R`).

## License

[RChery Plugin License (Attribution Required)](LICENSE) — you may use and modify this plugin, but any distribution or derivative work must credit [rchery.app](https://rchery.app) and the [original RChery plugin](https://github.com/inlinkz/obsidian-rchery).
