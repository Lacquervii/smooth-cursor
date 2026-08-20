# smooth-cursor

A smooth, comet-mode animated caret for the [DSH](https://github.com/deepseek-ai/deepseek-harness) chat composer textarea — ported from the Obsidian Animated Cursor plugin. Replaces the native text caret with a glowing comet that glides across the input as you type, with a configurable trail, accent color, and thickness.

![category](https://img.shields.io/badge/category-UI_Enhancement-orange)

## Features

- **Breathing caret** — a smooth eased caret that glides to the text position instead of blinking.
- **Comet trail** — a tapered, fading trail follows the caret while you move it.
- **Configurable** — enable/disable, trail on/off, accent color (preset swatches or custom picker), thickness (thin / medium / thick).
- **IME-aware** — measurement respects composition so Chinese/Japanese input stays accurate.
- **Browser-local persistence** — settings are stored in `localStorage`; no host restart or round-trip needed.

## Install

### As a DSH plugin (recommended)

```bash
dsh plugin add github:<your-name>/smooth-cursor
```

Or with an explicit git URL:

```bash
dsh plugin add git+https://github.com/<your-name>/smooth-cursor.git
```

Then restart `dsh web` and find the **Input caret** row under **Settings → General**.

### Manual (local development)

Clone this repo and add it as a plugin bundle:

```bash
git clone https://github.com/<your-name>/smooth-cursor.git
cd smooth-cursor
pnpm install --ignore-scripts
pnpm build
```

Then register it in your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: smooth-cursor
      name: smooth-cursor
```

## Usage

The effect activates whenever the composer textarea has focus. Open **Settings → General → Input caret** to:

- Toggle the whole effect or just the comet trail.
- Pick an accent color from the swatches, or use the custom color picker.
- Choose the caret thickness.

## Development

```bash
pnpm install --ignore-scripts
pnpm build     # tsc types + tsdown bundles (node half + client half)
pnpm watch     # incremental rebuild
```

`lib/` is committed so the plugin works straight from a git install even when a package manager blocks the `prepare` build step.

## License

MIT
