import { Flex, Tag, Tooltip } from 'antd';
import { useMemo } from 'react';
import {
  getWordDisplayStatus,
  type MappedWordAssessment,
  type WordDisplayStatus,
} from './scoring';

const statusPresentation: Record<
  WordDisplayStatus,
  { color?: 'success' | 'warning' | 'error'; label: string }
> = {
  correct: { color: 'success', label: 'Correct' },
  'needs-work': { color: 'warning', label: 'Needs work' },
  incorrect: { color: 'error', label: 'Incorrect' },
  uncertain: { label: 'Uncertain — please retry' },
};

interface WordResultProps {
  assessment: MappedWordAssessment;
  text: string;
}

export default function WordResult({ assessment, text }: WordResultProps) {
  const status = getWordDisplayStatus(assessment);
  const presentation = statusPresentation[status];
  const resultDetail = useMemo(() => {
    if (assessment.kind === 'omission') return 'Incorrect — omitted';
    if (assessment.kind === 'mispronunciation') {
      return `Incorrect — likely spoken ${assessment.alignment.hyp ?? 'another sound'}`;
    }
    if (assessment.kind === 'uncertain') {
      return assessment.alignment.note ?? presentation.label;
    }
    return presentation.label;
  }, [
    assessment.alignment.hyp,
    assessment.alignment.note,
    assessment.kind,
    presentation.label,
  ]);
  const details = assessment.phonemeIssues.length ? (
    <Flex vertical gap={4}>
      <span>{resultDetail}</span>
      {assessment.phonemeIssues.map((issue) => (
        <span key={issue.raw}>
          Expected {issue.expected}; likely spoken {issue.produced}; weak{' '}
          <u>{issue.weakPhoneme}</u>
        </span>
      ))}
    </Flex>
  ) : (
    resultDetail
  );

  return (
    <Tooltip title={details}>
      <Tag
        aria-label={`${text}: ${presentation.label}`}
        className="pronunciation-word-result"
        color={presentation.color}
      >
        {text}
      </Tag>
    </Tooltip>
  );
}
