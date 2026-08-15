import { WaveFile } from 'wavefile';

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
  utterance.rate = 0.65;

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

export async function toMonoPcmWav(recording: Blob) {
  const sampleRate = 16_000;
  const decoder = new OfflineAudioContext(1, 1, sampleRate);
  const decoded = await decoder.decodeAudioData(await recording.arrayBuffer());
  const offlineContext = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * sampleRate),
    sampleRate,
  );
  const source = offlineContext.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineContext.destination);
  source.start();

  const rendered = await offlineContext.startRendering();
  const samples = rendered.getChannelData(0);

  const wav = new WaveFile();
  wav.fromScratch(1, sampleRate, '32f', samples);
  wav.toBitDepth('16');
  const wavRecording = new Blob([Uint8Array.from(wav.toBuffer())], {
    type: 'audio/wav',
  });
  return wavRecording;
}

export function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the recording.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not encode the recording.'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}
