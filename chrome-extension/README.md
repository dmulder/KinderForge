# KinderForge Khan Extension

This extension moves lesson orchestration directly into Khan Academy so learners can use their own Khan account while KinderForge handles adaptive sequencing.

## What it does

- Stores a learner-managed path of lesson/practice steps.
- Detects the current Khan page, shows an in-page coach banner, and recommends the next step.
- Captures completion-like score signals from page text and updates path progression.
- Auto-advances to the next unlocked step when enabled.

## Install locally (Chrome)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `chrome-extension` directory from this repo.

## Quick start (automatic)

1. Go to a Khan lesson or practice page.
2. The extension prompts: **Start a learning path from this lesson?**
3. Click **Start path**.
4. KinderForge auto-builds a starter path from the current page + nearby lesson links.
5. Continue learning; the guide suggests and can auto-jump to next steps.

## Optional manual editing

You can still open **Path settings** to tweak path names, reorder/remove steps, and change adaptive thresholds.

## Validation notes against khanacademy.org

- A direct fetch of `https://www.khanacademy.org/` and `https://www.khanacademy.org/math` returns a lightweight app shell with `#app-shell-root` and metadata.
- Primary course/lesson/result content is client-rendered after hydration.
- The content script therefore observes live DOM mutations and URL paths at runtime rather than relying only on initial HTML.

## Current limitations

- Score/completion detection uses generic textual heuristics and should be hardened with Khan-specific post-hydration selectors in future iterations.
- No cloud sync yet; settings are local to the browser profile (`chrome.storage.local`).
