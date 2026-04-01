# Umbra

Umbra is an Electron desktop copilot for technical interviews and live meetings. It combines AssemblyAI streaming transcription, screenshot capture, and LLM responses (Anthropic Claude, OpenAI, or a local Ollama model) in a compact always-on-top window.

Use it only in environments where recording, transcription, screenshots, and AI assistance are allowed.

## Looks

**Compact mode** — toolbar with audio controls, **AI Answer**, **Analyze Screen**, timer, and a thin strip for transcripts and AI output.

![Umbra compact toolbar](./assets/umbra-ui-compact.png)

**Expanded mode** — **Transcription Monitor** (Meeting / You sources), **AI Assistant** chat, and manual context input.

![Umbra expanded window](./assets/umbra-ui-expanded.png)

On the toolbar, **AI Answer** runs the full-context *Ask AI* flow; **Analyze Screen** runs *Screen AI* on enabled screenshots. Other actions (Suggest, Notes, Insights) are available from the menu and keyboard shortcuts (see `src/config.js`).

---

## Features

- Dual-source live transcription for host/system audio and microphone input, with per-source toggles and a live monitor.
- Four AI action buttons, each with a distinct purpose — described in detail below.
- Per-message `AI` / `Off` controls let you keep transcript chunks, screenshots, and prior AI replies visible while excluding them from future prompts.
- **LLM provider** (Settings): Anthropic Claude, OpenAI, or Ollama (local). Multiple API keys per cloud provider are supported as a comma-separated list, with automatic failover on quota or authentication errors.
- Settings include model selection per provider, AssemblyAI speech model, **programming languages** (multi-select, comma-stored priority order), and window opacity.
- Session state is persisted to `cache/app-state.json`, and screenshot retention is bounded by `MAX_SCREENSHOTS`.
- **Mobile companion** — a built-in web server exposes a mobile-optimised chat interface on `http://localhost:7823`. Connect your phone over USB tethering and control the assistant from your pocket.

## AI Action Buttons

Each button sends a different slice of context to the AI and is designed for a different moment in the workflow.

### Ask AI (toolbar: **AI Answer**)

The full-context answer control. Use this when you want a complete, thorough response.

**What it sends:** all enabled transcript messages + all enabled screenshots + full conversation history.

**What it does:** reads the entire context as one unified thread, silently corrects speech-to-text recognition errors, identifies the actual question being asked (even across fragmented or imperfect transcript messages), and produces a complete answer.

**Output:**
- **Understanding** — one sentence confirming what it understood the question to be
- **Answer** — full response, as deep as the question requires
- For coding and algorithmic questions: **Approach → Full solution code → Time/Space complexity → Key points**

Use Ask AI when you need the complete answer, not just the opening move.

---

### Screen AI (toolbar: **Analyze Screen**)

The screenshot interpreter. Use this when the question or problem is visible on screen.

**What it sends:** only the screenshots currently enabled in context.

**What it does:** reads all visible text in the screenshot (constraints, function signatures, error messages, sample I/O), identifies what type of content it is (LeetCode problem, stack trace, terminal output, UI layout, architecture diagram), and responds accordingly.

**Output (for coding/debugging):**
- **Understanding → Approach → Complexity → Full runnable solution code → Explanation** (only if it adds value)

**Output (for non-coding screenshots — UI, architecture, docs):**
- **What I see → Answer → Key Points**

Use Screen AI when the problem is on your screen and you want a direct solution without needing to describe it in words.

---

### Suggest

The opening-move button. Use this when you want something ready to say right now, without the full depth of Ask AI.

**What it sends:** only the enabled transcript messages.

**What it does:** reads the full conversation flow, identifies where the discussion stands, and generates a concise spoken response — something you can say out loud immediately, not a written essay.

**Output:**
- **Best response (say this)** — 2–4 sentences, natural spoken language, technically accurate but not exhaustive
- **Key points** — 2–3 short anchor concepts to hold in mind and expand on if pushed
- **Optional follow-ups** — questions or angles the other person is likely to raise next

Use Suggest to open confidently. Use Ask AI when the interviewer pushes deeper and you need the full answer.

---

### Notes

The structured record button. Use this at any point to capture what has happened in the session.

**What it sends:** all enabled transcript messages and context.

**What it does:** organizes the conversation into a clean, topic-grouped document — correcting for STT noise throughout. Does not add inferences or assumptions not grounded in the actual conversation.

**Output (always all five sections, even if empty):**
- **Key Discussion Points** — main topics covered
- **Decisions Made** — with owner if mentioned
- **Action Items** — checkboxed, with owner and deadline if mentioned
- **Open Questions / Unresolved Items** — what was raised but not resolved
- **Next Steps** — what happens next based on the conversation

Use Notes to produce a shareable record at the end of a meeting or interview debrief.

## Installation

### Requirements

- Windows 10/11 is the primary development target for this repo.
- Node.js `20.x` is recommended. The existing docs and environment were prepared around `20.20.1`.
- npm `10+`
- **LLM:** Configure at least one of: Anthropic API key(s), OpenAI API key(s), or Ollama (no key; local server). Set the active provider in Settings.
- One AssemblyAI API key (configured in the app Settings UI)

### Setup

```powershell
nvm install 20.20.1
nvm use 20.20.1
npm ci
Copy-Item .env.example .env
```

API keys are configured from the in-app Settings panel after launch.

Start the app:

```powershell
npm start
```

Useful variants:

```powershell
npm run dev
npm run start:hidden
```

### Recommended For Windows Use

For day-to-day use on Windows, prefer building the portable app and running the generated `.exe` instead of launching from source every time.

```powershell
npm run build:win
```

This creates:

```text
dist/Umbra.exe
```

You can then run the packaged app directly by double-clicking `dist/Umbra.exe`.

### Native Windows Build Tools

This app depends on native modules. If `npm ci` fails with `node-gyp` or Visual Studio toolchain errors, install the C++ build tools and Python:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-package-agreements --accept-source-agreements --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

## Configuration

### Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `HIDE_FROM_SCREEN_CAPTURE` | No | Defaults to `true`. Controls `BrowserWindow.setContentProtection(...)`. |
| `START_HIDDEN` | No | Defaults to `false`. Also available at runtime via `npm run start:hidden` or `--start-hidden`. |
| `MAX_SCREENSHOTS` | No | Defaults to `50`. Old screenshots are deleted when the limit is exceeded. |
| `SCREENSHOT_DELAY` | No | Defaults to `300` ms. Delay used while briefly hiding the window before capture. |
| `NODE_ENV` | No | Defaults to `production`. `development` opens DevTools automatically. |
| `NODE_OPTIONS` | No | Defaults to `--max-old-space-size=4096`. |

### Source-Of-Truth Config

[`src/config.js`](./src/config.js) defines the app's configurable lists and defaults:

- AI provider options and model lists (Claude, OpenAI, Ollama)
- AssemblyAI speech models
- Programming language options for code-oriented prompts
- Global keyboard shortcuts

The first item in each model/language list is treated as the default.

### Persisted Files

- In development, state is written to `cache/app-state.json` at the repo root. Portable builds create the same `cache/app-state.json` structure next to the executable.
- Development screenshots are stored in `.stealth_screenshots/`. Packaged builds store screenshots under the app's user-data path.
- Saving settings from the UI writes API-key values and selection state to `cache/app-state.json`.

## Mobile Companion

When the app starts, a lightweight HTTP + WebSocket server starts automatically on `http://localhost:7823`. Connect your phone over USB tethering and open that URL in your mobile browser — no app install required.

### Setup (one time)

1. Plug your phone into your PC with a USB cable.
2. On Android: **Settings → Network → Hotspot & Tethering → USB Tethering** (enable).
   On iOS: **Settings → Personal Hotspot** (enable, connect via USB).
3. Open `http://localhost:7823` in your phone's browser.

### Mobile interface

| Button | What it does |
|--------|-------------|
| **Screenshot** | Triggers a stealth desktop capture. A badge shows the current count. |
| **Ask AI** | Sends the typed context (and any captured screenshots) to the AI; response streams in real time. |
| **Mic** | Starts your phone's microphone, streams PCM audio over the USB connection to AssemblyAI, and shows live transcripts in the chat. |
| **Clear** | Clears the AI conversation history and STT buffer. |

The text input above the toolbar lets you type a question or extra context before pressing **Ask AI** or the send button. Both the desktop and mobile views stay in sync — transcripts, AI responses, and screenshot events appear on both screens simultaneously.

> The server binds to `127.0.0.1` only, so it is not reachable from the wider network.

---

## Basic Workflow

1. Launch the app and confirm your API keys and models in Settings.
2. Start transcription and enable whichever sources you need: `Host`, `Mic`, or both.
3. Take screenshots when visual context is needed — a problem statement, error, or UI.
4. Use the right button for the moment:
   - **Suggest** to get a quick, speakable opening response from the transcript
   - **Ask AI** when you need the full, complete answer from all context
   - **Screen AI** when the problem is on your screen and you want a direct solution
   - **Notes** to capture a structured record of what was discussed and decided
5. Toggle noisy messages to `Off` before the next AI call so the prompt stays focused on what matters.
6. Optionally use the **mobile companion** on your phone for discreet control — trigger screenshots, ask AI, or run the mic without touching the desktop.

## Project Structure (Brief)

- `src/main-process/` is the Electron control plane (startup flow, window behavior, global shortcuts, and IPC registration).
- `src/main-process/features/mobile-server/` is the mobile companion — HTTP + WebSocket server (`server.js`) and the mobile UI (`mobile.html`).
- `src/services/` contains reusable domain logic (AI services and prompts under `services/ai/`, AssemblyAI streaming/transcript history, persisted app-state).
- `src/windows/assistant/preload/` is the renderer-safe API boundary (`window.electronAPI` invoke + event wrappers).
- `src/windows/assistant/renderer/features/` contains modular UI logic (chat, listeners, settings, transcription, context bundling, layout).
- `src/windows/legacy/` contains old experiments and is not part of the active runtime path.

Detailed, file-by-file ownership is documented in [`notes.md`](./notes.md).

```text
src/
  bootstrap/             Environment loading, validation, and persistence
  main-process/          Startup orchestration, IPC wiring, window control, assistant runtime
    features/
      mobile-server/     Mobile companion HTTP+WS server and mobile UI HTML
  services/
    ai/                  LLM services (Claude, OpenAI, Ollama) + shared prompt builders
    assembly-ai/         Streaming STT service + transcript history manager
    state/               App-state load/save helpers
  windows/
    assistant/
      preload/           `window.electronAPI` invoke/listener bridge
      renderer/features/ Renderer feature modules (chat, listeners, settings, transcription, AI context, layout)
      window.js          BrowserWindow creation/config
      renderer.js        Renderer composition root
    legacy/              Older experimental files kept out of the active flow
assets/                  Build icons, README screenshots (`umbra-ui-*.png`), packaging assets
cache/                   Generated app state in development
.stealth_screenshots/    Session screenshots in development
dist/                    Packaged build output
repomix-output.txt       Single-file repository snapshot for AI/code review tooling
```

## Shortcuts

All keyboard shortcuts are customizable. Configure them in `src/config.js` to match your preference before building or running the app.

## Scripts

- `npm start` runs the app from source.
- `npm run start:hidden` launches it in background mode from source.
- `npm run dev` enables Electron logging.
- `npm run build:win` creates the portable Windows executable.
- `npm run build:mac` creates a **universal** macOS DMG in `dist/` (Intel + Apple Silicon in one file).
- `npm run build` runs the default `electron-builder` flow.

### CI (GitHub Actions)

[`.github/workflows/build.yml`](./.github/workflows/build.yml) runs a **matrix** on `windows-latest` and `macos-latest`: `npm run build:win` and `npm run build:mac`. Artifacts are **only** the installable files: `dist/Umbra.exe` (`umbra-windows-latest`) and `dist/*.dmg` (`umbra-macos-latest`), not the full `dist/` tree.

**CI artifacts (every push / PR):** **Actions** → **Build** → latest green run → **Artifacts** → **umbra-macos-latest** / **umbra-windows-latest** (zip). These expire after GitHub’s artifact retention (often ~90 days).

### GitHub Releases (installers on the Releases page)

[`.github/workflows/release.yml`](./.github/workflows/release.yml) runs on **`release: created`** (e.g. when you save a **draft** release) and again on **`release: published`**. Each time it builds on Windows and macOS and **uploads** `Umbra.exe` and the `.dmg` file(s) to that release, so you can download binaries from a **draft** before clicking Publish. Publishing triggers a second run (same assets re-uploaded; harmless).

1. Bump **`version`** in [`package.json`](./package.json) to match the tag (e.g. `1.2.0` ↔ tag `v1.2.0`).
2. Commit and push to the default branch.
3. **GitHub → Releases → Draft a new release** → choose/create the tag → add notes → **Save draft** (workflow runs; check **Assets** on the draft) or **Publish release** (runs on publish too).
4. Wait for workflow **Release** to finish; refresh the release page for attached files.

`GITHUB_TOKEN` is used automatically; `permissions: contents: write` is set in the workflow. For a private org with restricted defaults, allow workflows to create releases.

**Build** workflow triggers: **push** or **pull_request** to `main` or `master`, and **workflow_dispatch**. The mac job generates `assets/chrome.icns` from `assets/chrome.ico` when the `.icns` file is not committed.

If nothing runs after changing this file, confirm **Settings → Actions → General** allows workflows (not “Disable actions”), and that your default branch name matches `main` or `master` (or add it under `on.push.branches` in the workflow).

On **Windows**, `npm ci` compiles native addons (`extract-file-icon` via `node-window-manager`). The first run often needs **several minutes**; canceling early produces `Terminate batch job (Y/N)?` and a failed `node-gyp rebuild`. Let the install step finish.

## Build

The recommended Windows build is the portable executable:

```powershell
npm run build:win
```

Expected output:

```text
dist/Umbra.exe
```

Notes:

- This is the recommended way to use the app outside development because it gives you a standalone `.exe` to launch directly.
- `.env` is bundled as an extra resource during packaging.
- The current Windows build is configured as a portable `x64` target with:
  - Product name: `Umbra`
  - Executable name: `Umbra.exe`
  - App ID: `app.umbra.desktop`
  - Publisher name: `Umbra`
- If the build fails with a symlink privilege error, enable Windows Developer Mode or run the build from an elevated terminal.
- The repo already includes [`assets/chrome.ico`](./assets/chrome.ico) for the Windows target. Add `assets/chrome.icns` and `assets/chrome.png` before relying on the macOS or Linux targets defined in `package.json`.
- macOS: `npm run build:mac` writes `dist/Umbra-<version>-universal.dmg` (one binary for Intel and Apple Silicon). Older CI artifacts named `*-arm64.dmg` vs `*-x64.dmg` were easy to mix up; use a fresh universal build.

### Running The Built App

After building:

1. Open the `dist/` folder.
2. Run `Umbra.exe`.
3. If you want background launch behavior, either set `START_HIDDEN=true` before building or launch with:

```powershell
.\dist\Umbra.exe --start-hidden
```

### Build Checks

After packaging, verify:

- `dist/Umbra.exe` exists
- the executable shows the Chrome icon
- the app launches correctly without needing `npm start`

For a build-focused walkthrough, see [`BUILD_INSTRUCTIONS.md`](./BUILD_INSTRUCTIONS.md).

## Good Practices

- Keep `src/config.js` as the single source of truth for model lists, programming languages, and keyboard shortcuts.
- When adding or changing environment variables, update all three places together: [`src/bootstrap/environment.js`](./src/bootstrap/environment.js), [`.env.example`](./.env.example), and this README.
- Preserve Electron boundaries: renderer code should go through `preload` and IPC, not import main-process modules directly.
- Keep cursor behavior stealth-safe: interactive controls intentionally do not switch to per-button pointer cursors. This prevents screen-sharing viewers from inferring user actions from cursor-shape changes while hidden mode is active.
- Add new UI logic under `src/windows/assistant/renderer/features/` and new domain logic under `src/services/` or `src/main-process/features/`.
- The mobile server (`src/main-process/features/mobile-server/`) binds to `127.0.0.1` only. Do not change the bind address without also adding authentication.
- Treat [`src/windows/legacy/`](./src/windows/legacy/) as reference material unless you are intentionally reviving an old experiment.
- Re-test both `npm start` and the relevant packaging path when changing startup flow, window behavior, screenshots, IPC, or global shortcuts.
- Keep real keys out of Git. Use `.env`, and rely on `.env.example` for the documented contract.

## Repomix Snapshot

To regenerate the packed repository snapshot:

```powershell
npx repomix . --style plain -o repomix-output.txt
```

If you want to exclude generated artifacts while experimenting:

```powershell
npx repomix . --style plain -o repomix-output.txt -i "repomix-output.txt,cache/**"
```
