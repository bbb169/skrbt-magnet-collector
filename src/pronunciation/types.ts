export interface PracticeSelectionMessage {
  type: 'PRACTICE_SELECTION';
  text: string;
}

export function isPracticeSelectionMessage(
  message: unknown,
): message is PracticeSelectionMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<PracticeSelectionMessage>;
  return candidate.type === 'PRACTICE_SELECTION' && typeof candidate.text === 'string';
}
