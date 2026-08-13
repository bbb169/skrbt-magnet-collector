export interface ReferencePlayback {
  usedAmericanVoice: boolean;
  finished: Promise<void>;
}

function selectEnglishVoice(voices: SpeechSynthesisVoice[]) {
  const americanVoice = voices.find(
    (voice) => voice.lang.toLowerCase() === 'en-us',
  );

  return {
    voice:
      americanVoice ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ??
      null,
    usedAmericanVoice: Boolean(americanVoice),
  };
}

export function playReference(text: string): ReferencePlayback {
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const { voice, usedAmericanVoice } = selectEnglishVoice(
    window.speechSynthesis.getVoices(),
  );
  utterance.lang = 'en-US';
  utterance.voice = voice;

  const finished = new Promise<void>((resolve, reject) => {
    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') {
        resolve();
        return;
      }
      reject(new Error('Reference playback could not be started.'));
    };
  });

  window.speechSynthesis.speak(utterance);
  return { usedAmericanVoice, finished };
}

export function stopReferencePlayback() {
  window.speechSynthesis.cancel();
}
