# Monochrome — Minimalist New Tab & AI Copilot

A developer-grade, ultra-minimalist browser New Tab extension designed as a hybrid command interface, generative art installation, and privacy-first AI copilot. Inspired by the design aesthetics of **Vercel**, **Linear**, **Raycast**, and creative coding experiments.

Built with **TypeScript**, **HTML5 Canvas**, and **Vite**, featuring true AMOLED matte-black styling (`#000000`), kinetic particle simulations, multi-provider AI intelligence, and a companion Chrome AMOLED theme.

---

## ⚡ Overview & Key Highlights

- **Generative Magnetic Dust Clock**: Real-time canvas simulation with ~1,500 particles, dual-zone cursor magnetic physics, and coordinate-stable transitions.
- **Sentinel AI Copilot**: Built-in multi-provider AI assistant supporting **Groq**, **Google Gemini**, **OpenRouter**, **OpenAI**, and **Anthropic Claude**.
- **Multimodal Vision & Image Input**: Attach images via click, drag-and-drop, or clipboard paste (<kbd>Ctrl</kbd>+<kbd>V</kbd>) for instant visual analysis.
- **Local Intent Engine**: Instant client-side math calculations, browser navigation, and natural language favorites management before querying AI.
- **Fast Command Search**: Google search and direct URL resolution with live autocomplete predictions and recent history.
- **Environment-Integrated Favorites**: Quick-launch sidebar with high-resolution favicons, proximity illumination, and full CRUD support.
- **Privacy-First (BYOK)**: Zero intermediary servers. API keys are stored solely in your local browser storage and dispatched directly to provider APIs.
- **Manifest V3 & AMOLED Chrome Theme**: Fully compliant Chrome Extension bundled with a standalone pitch-black Chrome browser theme.

---

## 🚀 Features in Detail

### 1. Generative Magnetic Dust Clock
- **High-Density Particle Simulation**: ~1,500 individual particles rendered at 60 FPS on HTML5 Canvas.
- **Dual-Zone Cursor Interaction**:
  - **Inner Kinetic Zone**: Repels particles dynamically based on cursor movement and velocity.
  - **Outer Magnetic Zone**: Induces swirling magnetic eddy currents around the cursor.
- **Organic Idle Respiration**: Particles gently oscillate using precomputed 1024-entry trigonometric lookup tables for zero CPU/GPU overhead.
- **Coordinate-Stable Morphing**: Zero particle jitter or random re-shuffling between seconds and digit transitions.
- **Typographic Depth**: Soft alpha tiers for seconds and digits for understated hierarchy.
- **Live Canvas Telemetry**: Real-time FPS monitor and particle counter rendered in the status bar.
- **Interactive Trigger**: Click directly on the particle clock to activate Sentinel AI mode.

### 2. Sentinel AI Copilot (Multi-Provider & BYOK)
- **100% Free & BYOK Provider Ecosystem**:
  - **Groq**: Ultra-fast free inference with Llama 3.3 70B Versatile, Llama 3.1 8B Instant, Mixtral 8x7B, and Gemma 2 9B.
  - **OpenRouter**: Free multi-model routing (`openrouter/free`, Gemma 4, Nemotron 3.5, Liquid LFM).
  - **Google Gemini**: Free tier (Gemini 2.0 Flash, Gemini 3.8 Flash, Gemini 3.8 Pro, Gemini 3.5 Flash/Pro) with adaptive model fallback.
  - **OpenAI**: Flagship GPT-4o and lightweight GPT-4o Mini.
  - **Anthropic Claude**: Claude 3.5 Sonnet and Claude 3.5 Haiku.
- **Connection Diagnostics**: Built-in connection tester to validate keys and API connectivity directly within the settings dialog.
- **Minimalist Stage UI**: Clean typography and live markdown parsing (headers, lists, inline code, syntax blocks) without chat bubbles or screen clutter.

### 3. Multimodal Vision & Image Analysis
- **Triple Image Ingestion**:
  - **File Picker**: Click the <kbd>+</kbd> attachment button in the search bar.
  - **Drag and Drop**: Drag image files anywhere over the search bar with active visual drop indicator.
  - **Clipboard Paste**: Press <kbd>Ctrl</kbd>+<kbd>V</kbd> anywhere on the page to attach copied images or screenshots.
- **Image Preview Chip**: Thumbnail preview with image title and instant removal button (<kbd>Backspace</kbd> / click).
- **Vision Model Routing**: Automatically sends base64 image data to vision-capable models (Gemini, GPT-4o, Claude 3.5).

### 4. Hybrid Local Intent Engine
Before routing requests to external LLMs, Sentinel evaluates queries locally in sub-milliseconds:
- **Instant Math Calculations**: Evaluates arithmetic expressions and percentages directly in the browser (e.g. `284 * 17`, `15% of 240`, `1024 / 8`).
- **Direct URL Recognition**: Recognizes domains (e.g. `github.com`, `linear.app`) and navigates immediately.
- **Natural Language Navigation**: Handles commands such as `"open youtube"`, `"go to figma"`, or `"launch discord"`.
- **Natural Favorites Management**: Add or remove bookmarks conversationally (e.g. `"add github to favorites"`, `"remove x from favorites"`).
- **Explicit Web Search Delegation**: Routes queries prefixed with `"search for ..."` or `"google ..."` straight to search.

### 5. Integrated Command Search & Suggestions
- **Smart Omnibox Execution**: Distinguishes between URLs and search queries seamlessly.
- **Real-Time Autocomplete**: Live Google search predictions alongside recent search history with clock icons and individual history deletion.
- **Focus Immersion**: Peripheral UI components and background grids smoothly dim when the search bar is active.
- **Instant Mode Switching**: Switch between Web Search and Sentinel AI with a single click (<kbd>AI</kbd> sparkle button) or shortcut (<kbd>Ctrl</kbd>+<kbd>A</kbd>).

### 6. Environment-Integrated Favorites Rail
- **Proximity Awakening**: Rests in near-invisible opacity and subtly illuminates as the cursor approaches the left screen edge.
- **High-Resolution Favicon Fetching**: Automatically resolves high-definition domain icons using Google Favicon services.
- **Full CRUD Management**: Add custom bookmarks with title and URL, edit existing items, or remove them with smooth micro-animations.
- **Keyboard Navigation**: Full arrow-key traversal (<kbd>↑</kbd> / <kbd>↓</kbd>) and instant launch with <kbd>Enter</kbd>.
- **Local Persistence**: State preserved persistently via `localStorage`.

### 7. Atmospheric Visual Design System
- **AMOLED Pitch Black**: Built on a pure `#000000` base with curated gray tiers (`#050505`, `#8e8e8e`, `#262626`).
- **Hardware-Accelerated Glow**: Smooth radial cursor illumination running on GPU `translate3d` transforms for 0ms lag.
- **Procedural Noise & Reticle**: Subtle ambient grain overlay paired with faint technical radial grid lines.
- **Modern Typography**: Powered by **Geist**, **Geist Mono**, **Inter**, and **JetBrains Mono**.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>⌘ K</kbd> / <kbd>Ctrl K</kbd> or <kbd>/</kbd> | Focus command search bar |
| <kbd>Esc</kbd> | Dismiss search, clear suggestions, close open modals |
| <kbd>Ctrl A</kbd> | Toggle between Web Search and Sentinel AI mode |
| <kbd>Ctrl V</kbd> | Paste image from clipboard to attach to query |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Navigate favorites sidebar or search suggestions |
| <kbd>Enter</kbd> | Execute search, launch selected favorite, or query AI |
| <kbd>Ctrl N</kbd> | Open "Add New Favorite" modal |
| <kbd>Ctrl B</kbd> | Toggle Favorites sidebar rail visibility |
| <kbd>T</kbd> | Toggle between 12-hour and 24-hour time format |
| <kbd>S</kbd> | Toggle seconds display on the particle clock |
| <kbd>?</kbd> | Open keyboard shortcuts reference cheat sheet |

---

## 🛠️ Project Structure

```text
Custom-New-Tab/
├── api/
│   └── suggest.js              # Serverless Google search suggestion proxy
├── chrome-theme/               # Standalone Matte AMOLED Black Chrome theme
│   ├── manifest.json           # Theme manifest (V3)
│   └── icons/
├── public/                     # Static icons and assets
├── src/
│   ├── ai/
│   │   ├── intent.ts           # Client-side local intent & math engine
│   │   ├── markdown.ts         # Lightweight markdown & codeblock parser
│   │   ├── prompt.ts           # Sentinel system prompt definitions
│   │   ├── provider.ts         # Base AI provider contract & interfaces
│   │   ├── sentinel.ts         # Sentinel AI core service coordinator
│   │   └── providers/          # Gemini, Groq, OpenRouter, OpenAI, Claude providers
│   ├── storage/
│   │   └── sentinel-settings.ts# BYOK encrypted/local storage coordinator
│   ├── styles/
│   │   └── index.css           # Design system tokens, layouts, animations
│   ├── canvas-clock.ts         # Particle simulation, physics, & respiration
│   ├── favorites.ts            # Sidebar manager, favicon fetcher, CRUD
│   ├── main.ts                 # Application lifecycle, events, wiring
│   └── search.ts               # Search bar controller, image upload, suggestions
├── index.html                  # Main New Tab markup & modals
├── manifest.json               # Chrome Extension Manifest V3 configuration
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 💻 Getting Started & Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `pnpm`

### Installation
```bash
# Clone the repository
git clone https://github.com/ShomeTalukdar/Custom-New-Tab.git
cd Custom-New-Tab

# Install dependencies
npm install

# Start Vite local development server
npm run dev
```

Visit the local server URL (e.g. `http://localhost:5173`) in your browser.

### Building for Production
```bash
# Compile TypeScript and generate production bundle in /dist
npm run build
```

---

## 🧩 Installing into Google Chrome

### 1. Load the Custom New Tab Extension
1. Build the project with `npm run build` (outputs to the `dist/` directory).
2. Open Google Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button.
5. Select the **`dist/`** directory in this project.
6. Open a new tab (<kbd>Ctrl</kbd> + <kbd>T</kbd>) to view your new tab!

### 2. Load the Companion Matte AMOLED Black Theme
1. Navigate to `chrome://extensions/` with Developer mode active.
2. Click **Load unpacked**.
3. Select the **`chrome-theme/`** directory from this repository.
4. The Chrome omnibox, tab strip, window frame, and toolbars will instantly transform to true AMOLED matte black (`#000000`).

---

## 🔒 Privacy & Security

- **Strictly Local Storage**: All API keys, custom bookmarks, and preferences are stored locally in the browser's `localStorage`.
- **No Telemetry or Intermediary Proxies**: Sentinel dispatches AI queries directly to your chosen provider's official API endpoints.
- **Zero Account Creation**: No logins, subscriptions, or external accounts are required to use this extension.

---

## 📄 License

MIT License. Feel free to fork, customize, and build upon this project!
