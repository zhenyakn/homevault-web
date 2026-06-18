---
name: ui-mockup
description: Render quick visual mockups of UI design options as a screenshot so the user can SEE and choose before any real code is written. Use when a task has more than one reasonable UI/layout/placement approach and the user wants to compare ("show me an example first", "what would it look like", "propose a few options", "I need a visual before I decide"). Produces a static HTML mockup, screenshots it with the pre-installed Chromium, and sends the image — no app build, no dependencies, no servers.
---

# Visual UI mockups (decide-before-you-build)

When a request has several plausible UI solutions, don't make the user imagine
them from prose. Build a throwaway static HTML mockup of the options side by
side, screenshot it with the headless Chromium that already ships in this
container, and send the picture. The user picks; *then* you build the real
thing. This is fast (seconds), needs no `pnpm install`, and never touches the
app.

## When to use
- The task is UI/layout/placement and there are 2–4 reasonable approaches.
- The user says "show me", "what would it look like", "give me options",
  "a visual before I decide", or rejects choosing blind.
- You want approval on *look* before investing in the real implementation.

## When NOT to use
- Single obvious design → just build it.
- You need to verify the REAL app's behaviour/pixels → use the `run-app` or
  `responsive-audit` skill instead (those drive the actual stack).

## Recipe

### 1. Write a self-contained HTML file
One file, inline `<style>`, no external assets or network. Put each option in
its own labelled column with a short caption. Make it representative, not
pixel-perfect — the goal is a decision, so use neutral placeholder colors and
say in chat that the real build uses the app's theme tokens.

Tips that make mockups read well:
- For mobile, draw a phone frame (fixed width ~320px, rounded border) so scale
  is obvious. For desktop, use a wider browser-chrome frame.
- Show the *interactive* state too (the open dropdown / sheet / expanded menu),
  not just the resting state — that's usually the part being decided.
- Add a one-line `.label` (option name) and `.sub` (the trade-off) per column.
- Use emoji (🏠 🔔 🔍 ☰ ✓) as stand-in icons — they render without a font setup.
- Lay options out in a single `.row { display:flex }` for an easy side-by-side.

Write it to `/tmp/mockup.html` (or another `/tmp/*.html`).

### 2. Screenshot with the bundled Chromium
The Playwright browsers live under `/opt/pw-browsers` even before `pnpm install`.
Pick whichever path exists:

```bash
CHROME=$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)
"$CHROME" --headless --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=2 \
  --window-size=1080,760 \
  --screenshot=/tmp/mockup.png /tmp/mockup.html
```

- `--force-device-scale-factor=2` → crisp 2× output.
- Size `--window-size` to your layout; too small clips, too large adds margins.
  For three 320px phone columns, ~1080×760 fits well.
- Headless Chrome screenshots the layout viewport, so make the page's own width
  match `--window-size` (or let content define it and size the window to suit).

### 3. Read it back, then send it
`Read` the PNG first to confirm it rendered as intended (catch clipping/empty
frames before the user sees it). Then deliver with `SendUserFile` and a caption
naming each option. Follow up in chat with a 1-line pro/con per option and your
recommendation, and ask the user to pick (e.g. via `AskUserQuestion`).

### 4. After they choose
Build the real component using the app's actual design tokens and i18n — the
mockup was disposable. Delete `/tmp/mockup.*` if you like; it's not part of the
repo.

## Gotchas
- The chromium dir version is pinned (e.g. `chromium-1194`); glob it, don't
  hard-code, so the skill survives Playwright bumps.
- `--no-sandbox` is required in this container (no user namespaces).
- Emoji are the most reliable cross-environment "icons"; bundling icon fonts is
  overkill for a throwaway mockup.
- Keep it ONE file. The moment a mockup needs a build step you've over-invested
  — switch to `run-app` and prototype in the real component instead.
