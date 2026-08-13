# American English Pronunciation Practice Plan

## Goal

Let the user select an English sentence on a web page, hear it spoken with an American English voice, record their own pronunciation, and receive word- and phoneme-level feedback.

The practice panel will show:

- Green words when pronunciation is correct.
- Orange words when pronunciation is close but needs improvement.
- Red words when they are mispronounced or omitted.
- Expected and likely spoken IPA phonemes for incorrect sounds.
- Sentence-level clarity, speaking-rate, stress, rhythm, pause, and intonation coaching.

Example result:

```text
The   weather   is   beautiful
green green     red  green
                  expected /z/
                  heard    /s/
```

"Accent feedback" means comparing likely spoken sounds with an American English reference pronunciation. Local results are coaching estimates, not objective or standardized accent scores. The extension will not guess the speaker's nationality or native accent.

## User flow

1. The user selects a sentence on an HTTPS page.
2. The user right-clicks and chooses **Practice selected text**.
3. A floating practice panel opens on the current page.
4. The user presses **Hear** to listen to an `en-US` reference voice.
5. The user presses **Record**, reads the sentence, and presses **Stop**.
6. The extension sends the recording and reference sentence to a local companion service on `127.0.0.1`.
7. The panel colors each word and shows detailed feedback.
8. The user can listen again or retry the recording.

## Architecture

```text
Selected page text
       |
       v
Extension service worker ---- injects ----> Page practice panel
                                                |
                                  records mono PCM WAV audio
                                                |
                                                v
                              Local HTTP adapter on 127.0.0.1
                                                |
                                                v
                           mcp-server-pronunciation process
                                                |
                                                v
                      Whisper + optional wav2vec2 phoneme alignment
                                                |
                                                v
                            Losslessly formatted engine result
```

Use the MIT-licensed `mcp-server-pronunciation` package as the underlying local assessment engine. Run it with the optional `[phoneme]` extra so wav2vec2 forced alignment can support stronger word-presence and acoustic-confidence checks in addition to local Whisper transcription.

The Chrome extension cannot start a native Python process directly. A small local Python HTTP adapter will manage a long-running `mcp-server-pronunciation` subprocess over MCP stdio and expose only the assessment operation required by the extension. Audio remains on the user's computer.

## Planned files

```text
public/manifest.json
src/background.ts
src/pronunciation/content.tsx
src/pronunciation/PracticePanel.tsx
src/pronunciation/content.css
src/pronunciation/audio.ts
src/pronunciation/scoring.ts
src/pronunciation/types.ts
src/pronunciation/theme.ts
local-service/pyproject.toml
local-service/app.py
local-service/mcp_client.py
local-service/result_formatter.py
local-service/README.md
vite.config.ts
```

## 1. Register the selection action

Add `activeTab`, `contextMenus`, and the existing `scripting` permission. Register a Manifest V3 service worker with a stable build filename.

Small manifest example:

```json
{
  "permissions": [
    "activeTab",
    "clipboardWrite",
    "contextMenus",
    "scripting",
    "tabs"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "host_permissions": [
    "http://127.0.0.1:8765/*"
  ]
}
```

Create the context-menu item during extension installation. When invoked, inject the content bundle and send it the selected text:

```ts
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'practice-selection' || !info.selectionText) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  });

  await chrome.tabs.sendMessage(tab.id, {
    type: 'PRACTICE_SELECTION',
    text: info.selectionText,
  });
});
```

Use `activeTab` so access is granted only after the user invokes the extension on the current page.

## 2. Create the in-page practice panel

Use Ant Design as the pronunciation feature's component library. Render the React panel inside a Shadow DOM so the host page cannot override Ant Design styles and the extension cannot change the page's styles.

Add these UI dependencies during implementation:

```text
antd
@ant-design/icons
@ant-design/cssinjs
```

Mount Ant Design's generated styles inside the same Shadow DOM as the panel:

```tsx
createRoot(mountNode).render(
  <StyleProvider container={shadowRoot}>
    <ConfigProvider
      getPopupContainer={() => mountNode}
      theme={pronunciationTheme}
    >
      <AntdApp>
        <PracticePanel selectedText={selectedText} />
      </AntdApp>
    </ConfigProvider>
  </StyleProvider>,
);
```

Use Ant Design components for the visible interface:

- `Card` for the floating panel.
- `Flex` and `Space` for layout.
- `Typography` for the sentence, labels, and coaching text.
- `Button` with Ant Design icons for **Hear**, **Record**, **Stop**, **Retry**, and **Close**.
- `Tag` for colored word results.
- `Progress` for clarity and acoustic-confidence scores.
- `Tooltip` for expected and likely spoken IPA.
- `Alert` for microphone, local-service, model-loading, and uncertain-result messages.
- `Spin` while the local assessment is running.

Do not recreate buttons, cards, progress indicators, alerts, tooltips, or loading states with custom HTML and CSS. Keep `content.css` limited to the fixed panel position, maximum dimensions, z-index, scrolling, and small word-flow adjustments that Ant Design does not provide.

The panel will contain:

- The selected sentence rendered as individual word tokens.
- **Hear**, **Record**, **Stop**, **Retry**, and **Close** controls.
- Recording and assessment progress.
- Overall scores.
- A detail tooltip for every incorrect word.
- Clear microphone and network error messages.

Use the Ant Design theme tokens in `theme.ts` for result colors instead of scattering color literals through components:

```ts
export const pronunciationTheme = {
  token: {
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
  },
};
```

Keep the first version limited to 300 characters and 30 seconds of audio. Preserve punctuation for the assessment reference while associating scores only with word tokens.

Guard content-script initialization so invoking the context menu repeatedly reuses one panel instead of mounting duplicate panels.

## 3. Play the American English reference

Use the browser Speech Synthesis API for the first version. Prefer an installed `en-US` voice and fall back to the browser's default English voice.

```ts
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = 'en-US';
utterance.voice =
  speechSynthesis.getVoices().find((voice) => voice.lang === 'en-US') ?? null;

speechSynthesis.speak(utterance);
```

Installed system voices vary, so reference playback may sound different across computers. Keep playback local in this feature version.

## 4. Record and prepare the user's audio

Request microphone access only after the user presses **Record**:

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  },
});
```

Recording behavior:

1. Start `MediaRecorder` from the microphone stream.
2. Stop automatically at 30 seconds or when the user presses **Stop**.
3. Stop every microphone track immediately.
4. Convert the recording to mono, 16 kHz PCM WAV.
5. Send the WAV file only to `http://127.0.0.1:8765` after the explicit recording action.
6. Discard the browser copy after assessment unless the user retries playback.

## 5. Add the local pronunciation companion service

Create a Python 3.11+ companion service and initially pin `mcp-server-pronunciation[phoneme]==0.3.0`. Upgrade only after its response-format contract and integration tests pass. The local service exposes this extension-facing contract:

```text
POST /api/pronunciation/assess
Content-Type: multipart/form-data

audio: recording.wav
referenceText: "The weather is beautiful."
```

The adapter will:

- Bind only to `127.0.0.1:8765`, never `0.0.0.0`.
- Accept only WAV uploads and reference text within the configured limits.
- Reject unexpected browser origins and require an extension-specific request header.
- Keep one warm MCP subprocess instead of loading speech models for every request.
- Invoke the public uploaded-audio and reference-sentence assessment tools from `mcp-server-pronunciation`.
- Enable its optional wav2vec2 forced-alignment path.
- Apply a timeout and terminate stuck assessment sessions safely.
- Never accept arbitrary local file paths or expose general MCP tool execution over HTTP.
- Delete temporary recordings immediately after the engine result is returned.

The content script sends the small WAV payload to the extension service worker. The service worker makes the loopback request so it uses the extension origin and declared host permission instead of the selected page's origin.

Small service-worker request:

```ts
const wavBlob = base64ToBlob(message.wavBase64, 'audio/wav');
const body = new FormData();
body.append('audio', wavBlob, 'recording.wav');
body.append('referenceText', message.referenceText);

const response = await fetch(
  'http://127.0.0.1:8765/api/pronunciation/assess',
  {
    method: 'POST',
    headers: { 'X-Pronunciation-Client': 'skrbt-extension' },
    body,
  },
);
```

Return the engine result without changing its meaning. The adapter may only make lossless format changes required for transport, such as converting engine-native objects to JSON-compatible values or nesting the result in an API envelope:

```ts
{
  provider: 'mcp-server-pronunciation',
  result: toJsonCompatible(engineResult),
}
```

Formatting must be one-to-one and lossless. Do not recalculate, round, clamp, relabel, summarize, add inferred fields, or convert uncertain results into definite right/wrong decisions. Keep engine-provided scores, labels, messages, and uncertainty unchanged.

## 6. Map results to displayed words

Tokenize the selected sentence while retaining punctuation and stable token indexes. Normalize case and surrounding punctuation when aligning engine results, but do not collapse repeated words.

Associate result types with display tokens without changing the engine result:

- Normal result: align it to the next matching reference token.
- Omission: mark the reference word red.
- Insertion: display the additional word in a separate "Extra words" message.
- Mispronunciation: mark the word red and show its weakest phonemes.
- Low-confidence or conflicting result: mark the word orange or unscored and ask the user to retry.
- No matching result: leave the word unscored and show that assessment was incomplete.

## 7. Display engine scoring and feedback

Use the engine-provided status directly. UI code may map that status to presentation, but it must not derive a replacement status from scores, confidence values, or phoneme details:

```ts
const statusClassName = {
  correct: styles.correct,
  'needs-work': styles.needsWork,
  incorrect: styles.incorrect,
  uncertain: styles.uncertain,
}[word.status];
```

Display rules:

- `correct`: green.
- `needs-work`: orange.
- `incorrect`: red.
- `uncertain`: gray with a retry request.
- Weak phonemes: underline and show expected versus likely spoken IPA.
- Prosody: show sentence-level stress, rhythm, pause, and intonation as coaching estimates.

Whether a word or sentence passes comes from the engine result. The extension does not introduce its own thresholds or override the engine when its signals disagree.

## 8. Configure the build

Add typed Vite entry points for the existing popup, service worker, and content script. Author all extension source as TypeScript or TSX. Compile `background.ts` and `content.tsx` to the stable artifact names `background.js` and `content.js` because Chrome manifests execute JavaScript and reference the compiled filenames directly.

The content script must mount Ant Design CSS-in-JS styles into the Shadow DOM through `StyleProvider`. It must not rely on the selected page to load Ant Design or extension styles.

## 9. Error and privacy behavior

Provide specific messages for:

- No selected text.
- Selection is too long.
- Microphone permission was denied.
- No microphone is available.
- No `en-US` playback voice is installed.
- Recording contains no recognizable speech.
- Local companion service is not installed or not running.
- Speech models are still downloading or failed to load.
- Local assessment times out.
- The current page does not permit extension injection.

Show a short disclosure before the first recording that audio is processed by a local companion application and that feedback is an estimate. Do not retain recordings or assessment results by default.

## 10. Validation

Add focused tests for:

- Tokenization with punctuation, contractions, and repeated words.
- Correct, borderline, incorrect, omitted, and inserted word results.
- Word and phoneme alignment.
- Engine scores, labels, messages, and uncertainty survive formatting unchanged.
- Repeated context-menu invocation without duplicate panels.
- Ant Design styles are injected only into the extension Shadow DOM.
- Ant Design popups and tooltips render inside the Shadow DOM rather than `document.body`.
- Recording cleanup and microphone track shutdown.
- Loopback-origin validation and rejection of unsafe requests.
- MCP subprocess startup, reuse, timeout, and shutdown.
- Local API validation and lossless engine-error formatting.

Manually verify:

1. Select and practice a sentence on several HTTPS sites.
2. Confirm that playback uses an `en-US` voice when available.
3. Test clearly correct and intentionally incorrect pronunciations.
4. Confirm the page DOM and styles remain unaffected.
5. Open tooltips and other overlays and confirm they retain Ant Design styling inside the Shadow DOM.
6. Deny microphone access and verify recovery.
7. Retry several times and confirm old results are cleared.
8. Stop the companion service and verify that the panel shows installation/startup guidance.
9. Confirm temporary WAV files are removed after successful and failed assessments.
10. Compare intentional `/θ/` to `/s/`, `/z/` to `/s/`, omitted-word, and noisy-audio samples.
11. Confirm uncertain audio is not incorrectly marked green or red.

Run the project build after implementation:

```powershell
pnpm build
```

Then load `dist` as an unpacked Chrome extension and test the complete selection, playback, recording, assessment, and feedback flow.

## Delivery order

1. Context-menu action and injected Shadow DOM panel.
2. American English playback and microphone recording.
3. Local HTTP adapter, persistent MCP subprocess, and lossless response-format contract.
4. Word alignment, coloring, and phoneme feedback.
5. Local installer/startup guidance, error handling, tests, and manual extension validation.

## Required local setup before implementation is complete

- Python 3.11 or newer and `uv` on the user's computer.
- A pinned installation of `mcp-server-pronunciation[phoneme]` with its MIT license notice preserved.
- Approximately 150 MB for the default English Whisper model plus approximately 360 MB for optional wav2vec2 phoneme weights; Python and ML runtime dependencies require additional disk space.
- A local startup command or packaged launcher that keeps the companion service available on `127.0.0.1:8765` while the extension is used.
- A calibration set containing correct speech, intentional phoneme substitutions, omissions, and noisy recordings from the intended user.
