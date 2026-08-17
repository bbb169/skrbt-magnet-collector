export interface PracticeSelectionMessage {
  type: 'PRACTICE_SELECTION';
  text: string;
}

export interface PracticeFreeSpeechMessage {
  type: 'PRACTICE_FREE_SPEECH';
}

export type OpenPracticeMessage =
  | PracticeSelectionMessage
  | PracticeFreeSpeechMessage;

export interface AssessPronunciationMessage {
  type: 'ASSESS_PRONUNCIATION';
  wavBase64: string;
  referenceText?: string;
}

export type PronunciationAssessmentResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export function isOpenPracticeMessage(
  message: unknown,
): message is OpenPracticeMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as { type?: unknown; text?: unknown };
  return (
    candidate.type === 'PRACTICE_FREE_SPEECH' ||
    (candidate.type === 'PRACTICE_SELECTION' &&
      typeof candidate.text === 'string')
  );
}

export function isAssessPronunciationMessage(
  message: unknown,
): message is AssessPronunciationMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<AssessPronunciationMessage>;
  return (
    candidate.type === 'ASSESS_PRONUNCIATION' &&
    typeof candidate.wavBase64 === 'string' &&
    (candidate.referenceText === undefined ||
      typeof candidate.referenceText === 'string')
  );
}
