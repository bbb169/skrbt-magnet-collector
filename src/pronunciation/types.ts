export interface PracticeSelectionMessage {
  type: 'PRACTICE_SELECTION';
  text: string;
}

export interface AssessPronunciationMessage {
  type: 'ASSESS_PRONUNCIATION';
  wavBase64: string;
  referenceText: string;
}

export type PronunciationAssessmentResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export function isPracticeSelectionMessage(
  message: unknown,
): message is PracticeSelectionMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<PracticeSelectionMessage>;
  return candidate.type === 'PRACTICE_SELECTION' && typeof candidate.text === 'string';
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
    typeof candidate.referenceText === 'string'
  );
}
