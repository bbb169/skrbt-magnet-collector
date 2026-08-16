import { describe, expect, it } from 'vitest';
import {
  getAssessmentMarkdown,
  getWordDisplayStatus,
  mapPronunciationMarkdown,
  tokenizeSentence,
} from './scoring';

describe('getAssessmentMarkdown', () => {
  it('uses the first valid MCP text content block', () => {
    expect(
      getAssessmentMarkdown({
        provider: 'mcp-server-pronunciation',
        result: {
          content: [
            { type: 'image', data: 'ignored' },
            { type: 'text', text: 'assessment markdown' },
          ],
          isError: false,
        },
      }),
    ).toBe('assessment markdown');
  });

  it('rejects malformed assessment responses', () => {
    expect(getAssessmentMarkdown({ result: { content: 'invalid' } })).toBeUndefined();
    expect(
      getAssessmentMarkdown({ result: { content: [{ type: 'text' }] } }),
    ).toBeUndefined();
  });
});

const REPORT = `## Pronunciation Assessment

**You said:** The whether is really beautiful extra
**Target:** The weather is really beautiful.

**Clarity:** 64% | **Speed:** 118 WPM (normal)
*Note: WPM computed over 6.4s of speech.*

### Alignment
| Reference | You said |  | Conf |
|---|---|---|---|
| the | the | ✓ match | 98% |
| weather | whether | ≠ sub | 31% |
| is | is | ✓ match | 20% |
|  |  | *Low acoustic confidence (20%)* | |
| really | — | − del | 4% |
| beautiful | beautiful | ✓ match | 92% |
| — | extra | + ins | — |

### Phoneme issues
- **weather** — expected /ˈwɛðər/, produced /ˈwɛsər/ — weak: **/ð/** (75% phoneme match)

### Prosody
- Sentence ended with rising intonation. Declaratives should fall.
- Misplaced word stress: beautiful (syl 1 instead of 2)
- Hesitation mid-clause: 1.24s between 'is' and 'really'
`;

describe('tokenizeSentence', () => {
  it('retains punctuation, contractions, whitespace, and repeated words', () => {
    const tokens = tokenizeSentence("Don't stop, stop!");

    expect(tokens.map((token) => token.text).join('')).toBe("Don't stop, stop!");
    expect(tokens.filter((token) => token.kind === 'word')).toMatchObject([
      { index: 0, text: "Don't", normalized: "don't" },
      { index: 2, text: 'stop', normalized: 'stop' },
      { index: 4, text: 'stop', normalized: 'stop' },
    ]);
  });
});

describe('mapPronunciationMarkdown', () => {
  it('maps substitutions, omissions, insertions, uncertainty, and phonemes', () => {
    const mapped = mapPronunciationMarkdown(
      'The weather is really beautiful.',
      REPORT,
    );
    const words = mapped.tokens.filter((token) => token.kind === 'word');

    expect(words.map((token) => token.assessment?.kind)).toEqual([
      'normal',
      'mispronunciation',
      'uncertain',
      'omission',
      'normal',
    ]);
    expect(words[2].assessment?.alignment.note).toBe(
      'Low acoustic confidence (20%)',
    );
    expect(words[1].assessment?.phonemeIssues[0]).toMatchObject({
      expected: '/ˈwɛðər/',
      produced: '/ˈwɛsər/',
      weakPhoneme: '/ð/',
      confidenceText: '75%',
    });
    expect(mapped.extraWords[0]).toMatchObject({ hyp: 'extra', op: 'ins' });
    expect(mapped.summary).toEqual({
      clarityText: '64%',
      clarityPercent: 64,
      speakingRateText: '118 WPM (normal)',
      scoreNotes: ['Note: WPM computed over 6.4s of speech.'],
      prosodyFeedback: [
        'Sentence ended with rising intonation. Declaratives should fall.',
        'Misplaced word stress: beautiful (syl 1 instead of 2)',
        "Hesitation mid-clause: 1.24s between 'is' and 'really'",
      ],
    });
    expect(mapped.incomplete).toBe(false);
  });

  it('maps only engine result categories to display statuses', () => {
    const mapped = mapPronunciationMarkdown(
      'The weather is really beautiful.',
      REPORT,
    );
    const assessments = mapped.tokens.flatMap((token) =>
      token.kind === 'word' && token.assessment ? [token.assessment] : [],
    );

    expect(assessments.map(getWordDisplayStatus)).toEqual([
      'correct',
      'incorrect',
      'uncertain',
      'incorrect',
      'correct',
    ]);
  });

  it('aligns repeated words in order', () => {
    const report = `## Pronunciation Assessment

**You said:** go no go
**Target:** Go, go, go.

### Alignment
| Reference | You said |  |
|---|---|---|
| go | go | ✓ match |
| go | no | ≠ sub |
| go | go | ✓ match |
`;
    const words = mapPronunciationMarkdown('Go, go, go.', report).tokens.filter(
      (token) => token.kind === 'word',
    );

    expect(words.map((token) => token.assessment?.kind)).toEqual([
      'normal',
      'mispronunciation',
      'normal',
    ]);
  });

  it('uses an identical spoken sentence when the engine omits a clean table', () => {
    const mapped = mapPronunciationMarkdown(
      'Hello, world!',
      `## Pronunciation Assessment

**You said:** hello world
**Target:** Hello, world!

### Great job! No major issues detected.`,
    );

    expect(
      mapped.tokens
        .filter((token) => token.kind === 'word')
        .map((token) => token.assessment?.kind),
    ).toEqual(['normal', 'normal']);
    expect(mapped.incomplete).toBe(false);
  });

  it('leaves unmatched reference words unscored and incomplete', () => {
    const mapped = mapPronunciationMarkdown(
      'Hello world',
      '## Pronunciation Assessment\n\n**You said:** hello',
    );

    expect(mapped.incomplete).toBe(true);
    expect(mapped.retryRecommended).toBe(true);
    expect(
      mapped.tokens
        .filter((token) => token.kind === 'word')
        .map((token) => token.assessment?.kind),
    ).toEqual(['normal', undefined]);
  });
});
