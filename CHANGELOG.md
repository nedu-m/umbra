# Umbra change log

## Current State

The app is now functional end to end for:

- Claude-powered AI responses
- AssemblyAI live transcription
- screenshot capture and Claude screenshot analysis
- transcript-driven auto-answer updates
- macOS-oriented window controls and UI behavior

The main runtime issue that blocked transcription-based answers was the microphone input selection on the machine, not the application pipeline itself. Once the correct mic input was selected, the full speech -> transcript -> AI answer loop worked.

## What Was Fixed

### 1. Claude integration and environment loading

- Replaced the older Gemini-centered flow with Claude-based runtime wiring.
- Added support for standard environment variables:
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_API_KEYS`
  - `ASSEMBLY_AI_API_KEY`
- Updated startup fallback behavior so missing keys in saved app state can be hydrated from `.env`.

Key files:

- [src/bootstrap/environment.js](/Users/Edu/Projects/umbra/src/bootstrap/environment.js)
- [src/main-process/start-application.js](/Users/Edu/Projects/umbra/src/main-process/start-application.js)

### 2. Screenshot upload fixes for Claude

- Added screenshot preprocessing to keep images within Claude limits.
- Added compression and resizing for oversized screenshots.
- Fixed MIME-type handling so JPEG bytes are no longer mislabeled as PNG.

This resolved:

- Claude 5 MB image limit failures
- Claude invalid media type / mismatched image type failures

Key file:

- [src/main-process/features/assistant/screenshot-manager.js](/Users/Edu/Projects/umbra/src/main-process/features/assistant/screenshot-manager.js)

### 3. Manual message flow

- Typing a message and pressing `Send` or `Enter` now triggers AI response generation.
- Manual input no longer only stores context silently.

Key files:

- [src/windows/assistant/renderer/features/chat/chat-ui-manager.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/chat/chat-ui-manager.js)
- [src/windows/assistant/renderer/features/listeners/event-listeners.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/listeners/event-listeners.js)

### 4. macOS window controls and app chrome

- Fixed custom traffic-light controls so they no longer conflict with native macOS window buttons.
- Enabled real minimize / fullscreen behavior in the Electron window.
- Removed duplicate control rendering on macOS.

Key files:

- [src/windows/assistant/window.js](/Users/Edu/Projects/umbra/src/windows/assistant/window.js)
- [src/windows/assistant/renderer.html](/Users/Edu/Projects/umbra/src/windows/assistant/renderer.html)
- [src/windows/assistant/renderer.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer.js)
- [src/windows/assistant/styles.css](/Users/Edu/Projects/umbra/src/windows/assistant/styles.css)
- [src/windows/assistant/preload/actions.js](/Users/Edu/Projects/umbra/src/windows/assistant/preload/actions.js)
- [src/main-process/features/assistant/ipc.js](/Users/Edu/Projects/umbra/src/main-process/features/assistant/ipc.js)
- [src/main-process/features/window/window-controller.js](/Users/Edu/Projects/umbra/src/main-process/features/window/window-controller.js)

### 5. macOS UI redesign

- Reworked the UI to feel more macOS-native and less Windows-like.
- Simplified visual effects after Electron compositor warnings appeared.
- Fixed compact/minimized layout scrolling so AI output remains reachable.

Key files:

- [src/windows/assistant/renderer.html](/Users/Edu/Projects/umbra/src/windows/assistant/renderer.html)
- [src/windows/assistant/styles.css](/Users/Edu/Projects/umbra/src/windows/assistant/styles.css)

### 6. Toolbar simplification and fast-feel polish

This pass reduced visual and interaction overhead so the assistant feels more immediate.

- Replaced the old titlebar plus two-column control rack with a single 38px toolbar row.
- Left side now holds the transcription control and screenshot action as icon-first controls.
- Center now uses three tab-style actions:
  - `AI Answer`
  - `Analyze Screen`
  - `Chat`
- Right side now holds timer, screenshot count, a three-dot overflow menu, and minimize / resize / close controls.
- Moved secondary actions behind the three-dot menu:
  - `Auto Answer`
  - `Suggest`
  - `Notes`
  - `Insights`
  - `Clear`
  - `Theme`
  - `Settings`
  - `Hide`
- Deleted the large macOS redesign block from CSS and removed most of the layered glass styling.
- Reduced `backdrop-filter: blur(...)` usage from many repeated surfaces down to the main shell only.
- Removed blur from buttons, cards, panels, monitor, and chat surfaces.
- Simplified the visual treatment to a dark translucent overlay around `rgba(18, 18, 24, 0.88)`.
- Tightened motion so no CSS transition runs longer than `0.12s`, making interactions feel nearly instant.
- Added toolbar menu wiring in the renderer for open/close behavior and click-outside dismissal.
- Added DOM bindings for `toolbarMenuBtn`, `toolbarMenu`, and `chatTabBtn`.
- Removed macOS platform-specific toolbar detection that was no longer needed after the layout simplification.

What stayed stable:

- Existing button IDs were preserved, so `event-listeners.js` did not need a selector rewrite.
- IPC wiring, settings, close confirmation, chat, and transcription monitor behavior stayed intact.
- Keyboard shortcuts still work.

Key files:

- [src/windows/assistant/renderer.html](/Users/Edu/Projects/umbra/src/windows/assistant/renderer.html)
- [src/windows/assistant/styles.css](/Users/Edu/Projects/umbra/src/windows/assistant/styles.css)
- [src/windows/assistant/renderer.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer.js)

### 7. Labeling and UX clarity

- Renamed the primary concepts for clearer mental mapping:
  - `Host` -> `Meeting`
  - `Mic` -> `You`
  - `Listen` -> `Transcribe`
  - `Capture` -> `Snap Screen`
  - `Screen AI` -> `Read Screen`
  - `Ask AI` -> `Answer Now`
- Added helper copy explaining what screen-only analysis vs full-context answering means.

Key files:

- [src/windows/assistant/renderer.html](/Users/Edu/Projects/umbra/src/windows/assistant/renderer.html)
- [src/windows/assistant/renderer/features/assembly-ai/source-state.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/assembly-ai/source-state.js)
- [src/windows/assistant/renderer/features/chat/chat-ui-manager.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/chat/chat-ui-manager.js)
- [src/windows/assistant/renderer/features/ai-context/message-types.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/ai-context/message-types.js)
- [src/windows/assistant/renderer/features/transcription/transcription-manager.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/transcription/transcription-manager.js)

### 8. Transcription-driven auto answer

- Added `Auto Answer` modes:
  - `Off`
  - `Transcript`
  - `Transcript + Screen`
- Finalized transcript chunks now enter AI context and can trigger answer refresh automatically after a short pause.
- Default source selection now enables both `Meeting` and `You`.
- Default auto-answer behavior now starts in a useful transcript-driven mode instead of requiring everything to be manual.

Key files:

- [src/windows/assistant/renderer.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer.js)
- [src/windows/assistant/renderer/features/assembly-ai/source-state.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/assembly-ai/source-state.js)
- [src/windows/assistant/renderer/features/transcription/transcription-manager.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/transcription/transcription-manager.js)
- [src/windows/assistant/renderer/features/assembly-ai/transcript-buffer.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/assembly-ai/transcript-buffer.js)

## Runtime Behavior Now

### Context capture

- `Meeting` captures desktop/system/other-speaker audio.
- `You` captures microphone audio.
- `Transcribe` starts live transcription for the selected sources.
- `Snap Screen` captures a screenshot and adds it to context.

### AI actions

- `Read Screen` analyzes visible screen context only.
- `Answer Now` uses transcript context plus screen context when available.
- `Auto Answer` refreshes answers after finalized transcript segments and a short pause.

### Transcript lifecycle

Current flow:

1. AssemblyAI websocket connects
2. audio chunks stream continuously
3. partial transcript arrives
4. final transcript arrives
5. transcript buffer flushes after a short pause
6. flushed transcript is added to AI context
7. auto-answer can trigger answer refresh

## Diagnostics Added During Debugging

Temporary deep diagnostics were added during investigation to trace:

- mic and meeting source lifecycle
- AssemblyAI websocket begin / turn / final flow
- transcript buffering and flushing
- auto-answer scheduling
- audio chunk flow

Most of the noisy logging has now been removed, while useful lifecycle logging remains.

Key files involved:

- [src/windows/assistant/renderer.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer.js)
- [src/windows/assistant/renderer/features/transcription/transcription-manager.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/transcription/transcription-manager.js)
- [src/windows/assistant/renderer/features/assembly-ai/audio-pipeline.js](/Users/Edu/Projects/umbra/src/windows/assistant/renderer/features/assembly-ai/audio-pipeline.js)
- [src/services/assembly-ai/service.js](/Users/Edu/Projects/umbra/src/services/assembly-ai/service.js)

## Known Remaining Issues

- Electron still emits security warnings in development because the renderer configuration is permissive:
  - disabled `webSecurity`
  - `allowRunningInsecureContent`
  - insecure / missing CSP
- Electron compositor warnings may still appear on some macOS setups if the window becomes very visually heavy again.
- Desktop/system audio behavior depends on macOS capture permissions and device routing.

## Important Debugging Conclusion

The final transcription issue was not caused by the AI pipeline or transcript buffering logic.

The actual blocker was the machine's microphone input selection. Once the correct mic input was active, the application correctly:

- received AssemblyAI partial transcripts
- received AssemblyAI final transcripts
- flushed transcript context
- triggered auto-answer
- rendered Claude responses automatically

## Suggested Next Improvements

- Add a visible input-device selector inside Settings for microphone source choice.
- Add a clearer active-mode indicator near `Auto Answer`.
- If shipping beyond local use, harden Electron security settings and CSP.
