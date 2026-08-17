import {
  isAssessPronunciationMessage,
  type PronunciationAssessmentResponse,
} from './pronunciation/types';

const PRACTICE_SELECTION_MENU_ID = 'practice-selection';
const PRACTICE_FREE_SPEECH_MENU_ID = 'practice-free-speech';
const PRONUNCIATION_ENDPOINT =
  'http://127.0.0.1:8765/api/pronunciation/assess';

function base64ToBlob(value: string, type: string) {
  const bytes = Uint8Array.from(atob(value), (character) =>
    character.charCodeAt(0),
  );
  return new Blob([bytes], { type });
}

async function assessPronunciation(
  wavBase64: string,
  referenceText?: string,
): Promise<PronunciationAssessmentResponse> {
  const body = new FormData();
  body.append('audio', base64ToBlob(wavBase64, 'audio/wav'), 'recording.wav');
  if (referenceText) body.append('referenceText', referenceText);

  try {
    const response = await fetch(PRONUNCIATION_ENDPOINT, {
      method: 'POST',
      headers: { 'X-Pronunciation-Client': 'skrbt-extension' },
      body,
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const detail =
        data && typeof data === 'object' && 'detail' in data
          ? String(data.detail)
          : `The local service returned HTTP ${response.status}.`;
      return { ok: false, error: detail };
    }
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error:
        'The local pronunciation service is not running. Start it on 127.0.0.1:8765 and retry.',
    };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: PRACTICE_SELECTION_MENU_ID,
    title: 'Practice selected text',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: PRACTICE_FREE_SPEECH_MENU_ID,
    title: 'Score recorded speech',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (typeof tab?.id !== 'number') {
    return;
  }

  const message =
    info.menuItemId === PRACTICE_SELECTION_MENU_ID && info.selectionText
      ? { type: 'PRACTICE_SELECTION' as const, text: info.selectionText }
      : info.menuItemId === PRACTICE_FREE_SPEECH_MENU_ID
        ? { type: 'PRACTICE_FREE_SPEECH' as const }
        : undefined;
  if (!message) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  });

  await chrome.tabs.sendMessage(tab.id, message);
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (!isAssessPronunciationMessage(message)) {
      return false;
    }

    void assessPronunciation(message.wavBase64, message.referenceText).then(
      sendResponse,
    );
    return true;
  },
);
