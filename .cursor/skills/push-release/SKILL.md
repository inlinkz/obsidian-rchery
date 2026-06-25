---
name: push-release
description: >-
  Run the full RChery release workflow: build, commit changes, bump manifest
  version, tag, and push to GitHub. Use when the user says "push it", "release
  it", "ship it", "tag and push", or asks to commit, version, tag, and push.
---

# Push release (RChery)

When the user says **push it** (or similar), run this entire workflow without asking for confirmation at each step — unless there are no changes to release or a blocker (failed build, push rejected).

## Preconditions

- Work from repo root: `/Users/aris/dev/obsidian-rchery` (or current workspace if this is the repo).
- NEVER update git config.
- NEVER use destructive git commands (`push --force`, `reset --hard`) unless explicitly requested.
- NEVER skip hooks (`--no-verify`).
- NEVER use interactive git (`-i` flags).

## What to commit vs ignore

**Include** in release commits:
- `src/**`
- `main.js`, `styles.css`, `manifest.json`, `versions.json`
- `README.md`, `docs/**` (if changed)
- `TestVault/.obsidian/plugins/rchery/main.js`
- `TestVault/.obsidian/plugins/rchery/manifest.json`
- `TestVault/.obsidian/plugins/rchery/styles.css`

**Exclude** (local test data — do not commit):
- `TestVault/.obsidian/workspace.json`
- `TestVault/.obsidian/workspaces.json`
- `TestVault/**/*.rchery`
- `TestVault/**/*.canvas`
- Other TestVault notes unless the user explicitly changed them for the release

## Version rules

1. Read current version from `manifest.json` `version` field.
2. Read latest git tag: `git tag -l --sort=-v:refname | head -1`
3. Next release = **patch bump** on the higher of those two (e.g. `1.0.13` → `1.0.14`).
4. Tag name = version string **without** `v` prefix (e.g. `1.0.14`).
5. Update version in all three files:
   - `manifest.json`
   - `TestVault/.obsidian/plugins/rchery/manifest.json`
   - `versions.json` — add `"<version>": "<minAppVersion>"` using `minAppVersion` from `manifest.json`; do not remove older entries.

## Workflow (run in order)

### 1. Inspect state

Run in parallel:
```bash
git status
git diff
git diff --staged
git log --oneline -5
git tag -l --sort=-v:refname | head -5
```

If there is nothing to commit and manifest already matches the next tag, stop and tell the user.

### 2. Build

```bash
npm run build
```

Build must succeed before committing. `npm run build` deploys `main.js`, `manifest.json`, and `styles.css` to `TestVault/.obsidian/plugins/rchery/`.

### 3. Commit 1 — changes

Stage only relevant plugin/source files (see include/exclude lists).

Draft a commit message focused on **why** (1–2 sentences). Use HEREDOC:

```bash
git add <relevant files>
git commit -m "$(cat <<'EOF'
<feature/fix summary>

<optional second sentence>
EOF
)"
```

If README has an `### Unreleased` changelog section, keep it for now (move it in commit 2).

### 4. Commit 2 — version bump

1. Bump version in `manifest.json`, TestVault plugin `manifest.json`, and `versions.json`.
2. In `README.md`, move `### Unreleased` bullets under `### <new-version>` (remove the Unreleased heading if empty).
3. Run `npm run build` again so TestVault plugin manifest copy is current.
4. Stage only version/release files.

```bash
git commit -m "$(cat <<'EOF'
Release v<version> with <short summary>.
EOF
)"
```

### 5. Tag

```bash
git tag <version>
```

Tag the **release commit** (commit 2), not the feature commit.

### 6. Push

```bash
git push origin main
git push origin <version>
```

Request `git_write` and `full_network` permissions. If push to `main` is blocked by approval, retry with `request_smart_mode_approval: true`.

### 7. Verify

```bash
git status
git log --oneline -3
```

Report: commits created, new version, tag name, and that `main` + tag were pushed.

## Two-commit layout (required)

| Commit | Contents |
|--------|----------|
| 1 | Source changes + built `main.js` / `styles.css` / TestVault plugin copies |
| 2 | Version bump in manifests + `versions.json` + README changelog |

This matches prior releases (`dea5f16` then `af294a7` for v1.0.13).

## Single-commit exception

If the only pending change **is** the version bump (manifest already updated, no source diff), one release commit + tag is acceptable.

## Commit message style

Match existing repo tone — complete sentences, concise:

- Feature: `Fix target-face dragging on mobile touch devices.`
- Release: `Release v1.0.14 with default folder setting and folder autosuggest.`

## GitHub release

Pushing the tag triggers `.github/workflows/release.yml`, which builds and attaches `main.js`, `manifest.json`, `styles.css`, and `versions.json` to the GitHub release. No extra release step needed unless the user asks.

## Failure handling

- **Build fails**: fix errors, do not commit or tag.
- **Commit hook fails**: fix issues, create a **new** commit (never `--amend` unless user rule conditions are all met).
- **Push fails**: report error; do not force-push.
