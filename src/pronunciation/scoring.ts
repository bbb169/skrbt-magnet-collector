import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { toString } from 'mdast-util-to-string';
import { gfmTable } from 'micromark-extension-gfm-table';
import type { Root, RootContent } from 'mdast';
import { z } from 'zod';

export interface SentenceToken {
  index: number;
  kind: 'word' | 'separator';
  text: string;
  normalized?: string;
}

export type AlignmentOperation = 'match' | 'sub' | 'ins' | 'del';

export interface EngineAlignmentEntry {
  ref: string | null;
  hyp: string | null;
  op: AlignmentOperation;
  forcedConfidenceText?: string;
  note?: string;
  rawCells: string[];
}

export interface EnginePhonemeIssue {
  word: string;
  expected: string;
  produced: string;
  weakPhoneme: string;
  confidenceText: string;
  raw: string;
}

export type WordAssessmentKind =
  | 'normal'
  | 'omission'
  | 'mispronunciation'
  | 'uncertain';

export interface MappedWordAssessment {
  kind: WordAssessmentKind;
  alignment: EngineAlignmentEntry;
  phonemeIssues: EnginePhonemeIssue[];
}

export interface MappedSentenceToken extends SentenceToken {
  assessment?: MappedWordAssessment;
}

export interface MappedPronunciationAssessment {
  spokenText?: string;
  tokens: MappedSentenceToken[];
  extraWords: EngineAlignmentEntry[];
  unmatchedResults: EngineAlignmentEntry[];
  summary: EngineAssessmentSummary;
  incomplete: boolean;
  retryRecommended: boolean;
  rawMarkdown: string;
}

export interface EngineAssessmentSummary {
  clarityText?: string;
  clarityPercent?: number;
  speakingRateText?: string;
  scoreNotes: string[];
  prosodyFeedback: string[];
}

export type WordDisplayStatus =
  | 'correct'
  | 'needs-work'
  | 'incorrect'
  | 'uncertain';

const textContentBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const assessmentMarkdownSchema = z
  .object({
    result: z.object({
      content: z.array(z.unknown()),
    }),
  })
  .transform(({ result }, context) => {
    for (const contentBlock of result.content) {
      const parsedBlock = textContentBlockSchema.safeParse(contentBlock);
      if (parsedBlock.success) return parsedBlock.data.text;
    }

    context.addIssue({
      code: 'custom',
      message: 'Assessment result has no text content block.',
    });
    return z.NEVER;
  });

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function normalizeWord(word: string) {
  return word
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replaceAll('’', "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function tokenizeSentence(text: string): SentenceToken[] {
  const tokens: SentenceToken[] = [];
  let offset = 0;

  for (const match of text.matchAll(WORD_PATTERN)) {
    const start = match.index;
    if (start > offset) {
      tokens.push({ index: tokens.length, kind: 'separator', text: text.slice(offset, start) });
    }
    tokens.push({
      index: tokens.length,
      kind: 'word',
      text: match[0],
      normalized: normalizeWord(match[0]),
    });
    offset = start + match[0].length;
  }

  if (offset < text.length) {
    tokens.push({ index: tokens.length, kind: 'separator', text: text.slice(offset) });
  }

  return tokens;
}

function parseMarkdown(markdown: string) {
  return fromMarkdown(markdown, {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
  });
}

function sectionNodes(root: Root, title: string) {
  const normalizedTitle = title.toLocaleLowerCase('en-US');
  const headingIndex = root.children.findIndex(
    (node) =>
      node.type === 'heading' &&
      toString(node).trim().toLocaleLowerCase('en-US') === normalizedTitle,
  );
  if (headingIndex < 0) return [];

  const heading = root.children[headingIndex];
  if (heading.type !== 'heading') return [];
  const nodes: RootContent[] = [];
  for (const node of root.children.slice(headingIndex + 1)) {
    if (node.type === 'heading' && node.depth <= heading.depth) break;
    nodes.push(node);
  }
  return nodes;
}

function nullableCell(value: string) {
  const trimmed = value.trim();
  return trimmed === '' || trimmed === '—' ? null : trimmed;
}

function parseAlignment(root: Root): EngineAlignmentEntry[] {
  const table = sectionNodes(root, 'Alignment').find(
    (node) => node.type === 'table',
  );
  if (!table || table.type !== 'table') return [];

  const results: EngineAlignmentEntry[] = [];
  for (const row of table.children.slice(1)) {
    const cells = row.children.map((cell) => toString(cell).trim());
    const operation = cells[2]?.match(/\b(match|sub|ins|del)\b/u)?.[1] as
      | AlignmentOperation
      | undefined;

    if (!operation) {
      const note = cells[2];
      if (note && results.length > 0) results.at(-1)!.note = note;
      continue;
    }

    results.push({
      ref: nullableCell(cells[0] ?? ''),
      hyp: nullableCell(cells[1] ?? ''),
      op: operation,
      forcedConfidenceText: cells[3] || undefined,
      rawCells: cells,
    });
  }
  return results;
}

function parsePhonemeIssues(root: Root): EnginePhonemeIssue[] {
  const list = sectionNodes(root, 'Phoneme issues').find(
    (node) => node.type === 'list',
  );
  if (!list || list.type !== 'list') return [];

  return list.children.flatMap((item) => {
    const raw = toString(item).trim();
    const match = raw.match(
      /^(.+?)\s+—\s+expected\s+(.+?),\s+produced\s+(.+?)\s+—\s+weak:\s+(.+?)\s+\((.+?)\s+phoneme match\)$/u,
    );
    if (!match) return [];
    return [
      {
        word: match[1],
        expected: match[2],
        produced: match[3],
        weakPhoneme: match[4],
        confidenceText: match[5],
        raw,
      },
    ];
  });
}

function paragraphLines(root: Root) {
  return root.children.flatMap((node) =>
    node.type === 'paragraph'
      ? toString(node)
          .split('\n')
          .map((line) => line.trim())
      : [],
  );
}

function parseSpokenText(root: Root) {
  return paragraphLines(root)
    .find((line) => line.startsWith('You said:'))
    ?.slice('You said:'.length)
    .trim();
}

function parseAssessmentSummary(root: Root): EngineAssessmentSummary {
  const lines = paragraphLines(root);
  const summary = lines
    .find((line) => line.startsWith('Clarity:'))
    ?.match(/^Clarity:\s*(.+?)\s*\|\s*Speed:\s*(.+)$/u);
  const clarityText = summary?.[1].trim();
  const speakingRateText = summary?.[2].trim();
  const clarityPercent = clarityText?.match(/^(\d+(?:\.\d+)?)%$/u)?.[1];

  const prosodyFeedback = sectionNodes(root, 'Prosody').flatMap((node) =>
    node.type === 'list'
      ? node.children.map((item) => toString(item).trim()).filter(Boolean)
      : [],
  );

  return {
    clarityText,
    clarityPercent: clarityPercent ? Number(clarityPercent) : undefined,
    speakingRateText,
    scoreNotes: lines.filter((line) => line.startsWith('Note:')),
    prosodyFeedback,
  };
}

function wordTokens(text: string) {
  return tokenizeSentence(text).filter(
    (token): token is SentenceToken & { normalized: string } =>
      token.kind === 'word' && token.normalized !== undefined,
  );
}

function matchingTranscriptAlignment(
  root: Root,
  referenceTokens: Array<SentenceToken & { normalized: string }>,
): EngineAlignmentEntry[] {
  const spoken = parseSpokenText(root);
  if (!spoken || spoken === '(nothing detected)') return [];
  const spokenTokens = wordTokens(spoken);
  const matches: EngineAlignmentEntry[] = [];
  let referenceCursor = 0;

  for (const spokenToken of spokenTokens) {
    const matchingIndex = referenceTokens.findIndex(
      (token, index) =>
        index >= referenceCursor && token.normalized === spokenToken.normalized,
    );
    if (matchingIndex < 0) continue;
    matches.push({
      ref: referenceTokens[matchingIndex].text,
      hyp: spokenToken.text,
      op: 'match',
      rawCells: [],
    });
    referenceCursor = matchingIndex + 1;
  }

  return matches;
}

function assessmentKind(entry: EngineAlignmentEntry): WordAssessmentKind {
  if (entry.op === 'del') return 'omission';
  if (entry.op === 'sub') return 'mispronunciation';
  if (entry.note?.toLocaleLowerCase('en-US').includes('low acoustic confidence')) {
    return 'uncertain';
  }
  return 'normal';
}

export function mapPronunciationMarkdown(
  referenceText: string | undefined,
  markdown: string,
): MappedPronunciationAssessment {
  const root = parseMarkdown(markdown);
  const tokens: MappedSentenceToken[] = tokenizeSentence(referenceText ?? '');
  const referenceTokens = tokens.filter(
    (token): token is MappedSentenceToken & { normalized: string } =>
      token.kind === 'word' && token.normalized !== undefined,
  );
  const parsedAlignment = parseAlignment(root);
  const alignment =
    parsedAlignment.length > 0
      ? parsedAlignment
      : matchingTranscriptAlignment(root, referenceTokens);
  const extraWords: EngineAlignmentEntry[] = [];
  const unmatchedResults: EngineAlignmentEntry[] = [];
  let wordCursor = 0;

  for (const entry of alignment) {
    if (entry.op === 'ins') {
      extraWords.push(entry);
      continue;
    }
    if (!entry.ref) {
      unmatchedResults.push(entry);
      continue;
    }

    const normalizedReference = normalizeWord(entry.ref);
    const matchingIndex = referenceTokens.findIndex(
      (token, index) =>
        index >= wordCursor && token.normalized === normalizedReference,
    );
    if (matchingIndex < 0) {
      unmatchedResults.push(entry);
      continue;
    }

    referenceTokens[matchingIndex].assessment = {
      kind: assessmentKind(entry),
      alignment: entry,
      phonemeIssues: [],
    };
    wordCursor = matchingIndex + 1;
  }

  let phonemeCursor = 0;
  for (const issue of parsePhonemeIssues(root)) {
    const normalizedIssue = normalizeWord(issue.word);
    const matchingIndex = referenceTokens.findIndex(
      (token, index) =>
        index >= phonemeCursor &&
        token.normalized === normalizedIssue &&
        token.assessment?.kind === 'mispronunciation',
    );
    if (matchingIndex < 0) continue;
    referenceTokens[matchingIndex].assessment!.phonemeIssues.push(issue);
    phonemeCursor = matchingIndex + 1;
  }

  const incomplete =
    unmatchedResults.length > 0 ||
    referenceTokens.some((token) => token.assessment === undefined);
  const retryRecommended =
    incomplete ||
    referenceTokens.some((token) => token.assessment?.kind === 'uncertain');

  return {
    spokenText: parseSpokenText(root),
    tokens,
    extraWords,
    unmatchedResults,
    summary: parseAssessmentSummary(root),
    incomplete,
    retryRecommended,
    rawMarkdown: markdown,
  };
}

export function getWordDisplayStatus(
  assessment: MappedWordAssessment,
): WordDisplayStatus {
  if (assessment.kind === 'uncertain') return 'uncertain';
  if (assessment.kind === 'normal') return 'correct';
  return 'incorrect';
}

export function getAssessmentMarkdown(data: unknown) {
  const parsed = assessmentMarkdownSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}
