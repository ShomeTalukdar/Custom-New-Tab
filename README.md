# Custom New Tab — Minimalist Generative Interface

A minimalist, monochromatic browser New Tab extension designed like a developer command tool and interactive generative art installation. Inspired by the design aesthetics of **Vercel**, **Linear**, **Raycast**, and creative coding experiments.

---

## Features

- **Generative Magnetic Dust Clock**:
  - High-density particle system (~1,500 points) rendered on HTML5 Canvas.
  - Dual-zone physical cursor interaction (inner kinetic scatter, outer magnetic eddy).
  - Harmonic idle respiration and breathing movement.
  - Coordinate-stable morphing (zero jitter or particle shaking across second transitions).
  - Dimmer seconds display for understated typographical depth.
- **Interactive Environment**:
  - Ambient stardust background field gently displaced by cursor wake.
  - Procedural fractal noise texture and soft radial atmospheric cursor glow.
  - Faint technical radial grid reticle fading seamlessly into near-black `#000000`.
- **Integrated Command Search Bar**:
  - Direct URL detection or instant Google search.
  - Focus immersion: automatically dims peripheral UI when focused.
  - Shortcuts: `⌘K` / `Ctrl+K` or `/` to focus, `Esc` to clear/blur.
- **Environment-Integrated Favorites Sidebar**:
  - Proximity awakening: subtle opacity at rest, illuminates when cursor approaches.
  - Micro-interactions: horizontal hover slide, hairline accent tick, and favicon color reveal.
  - Keyboard navigation (`↑` / `↓` and `Enter`).
  - Full CRUD with persistent `localStorage` storage.
- **Chrome Extension Ready**:
  - Manifest V3 compliant (`chrome_url_overrides.newtab`).

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>⌘ K</kbd> / <kbd>Ctrl K</kbd> or <kbd>/</kbd> | Focus command search |
| <kbd>Esc</kbd> | Dismiss search / close open dialogs |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Navigate favorites in sidebar |
| <kbd>Enter</kbd> | Open selected favorite / execute search |
| <kbd>Ctrl N</kbd> | Add new favorite dialog |
| <kbd>T</kbd> | Toggle 12-hour / 24-hour time format |
| <kbd>S</kbd> | Toggle seconds display |
| <kbd>Ctrl B</kbd> | Toggle favorites sidebar rail |
| <kbd>?</kbd> | Open shortcuts reference cheat sheet |

---

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build production bundle & Chrome extension
npm run build
```

---

## Load in Chrome Extension

1. Run `npm run build`
2. Open Google Chrome and navigate to `chrome://extensions/`
3. Toggle on **Developer mode** in the upper-right corner
4. Click **Load unpacked**
5. Select the `dist/` directory generated in this repository
6. Open a new tab to experience the interface
