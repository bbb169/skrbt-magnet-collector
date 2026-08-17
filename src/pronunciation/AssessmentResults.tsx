import { Flex, List, Progress, Typography } from 'antd';
import type { MappedPronunciationAssessment } from './scoring';

const { Text } = Typography;

interface AssessmentResultsProps {
  assessment?: MappedPronunciationAssessment;
  showTranscript?: boolean;
}

export default function AssessmentResults({
  assessment,
  showTranscript = false,
}: AssessmentResultsProps) {
  if (!assessment) return null;

  const extraWords = assessment.extraWords
    .map((entry) => entry.hyp)
    .filter(Boolean)
    .join(', ');

  return (
    <>
      {showTranscript && assessment.spokenText ? (
        <Flex vertical gap="small">
          <Text strong>You said</Text>
          <Text>{assessment.spokenText}</Text>
        </Flex>
      ) : null}

      {extraWords ? (
        <Text type="warning">Extra words: {extraWords}</Text>
      ) : null}

      {assessment.incomplete ? (
        <Text type="danger">
          Assessment was incomplete. Unscored words were left unchanged; please
          retry.
        </Text>
      ) : null}

      {assessment.retryRecommended && !assessment.incomplete ? (
        <Text type="secondary">
          The engine marked part of this attempt as uncertain. Please retry.
        </Text>
      ) : null}

      {assessment.summary.clarityText ? (
        <Flex vertical gap="small">
          <Text strong>Engine scoring</Text>
          {assessment.summary.clarityPercent === undefined ? (
            <Text>Clarity: {assessment.summary.clarityText}</Text>
          ) : (
            <Progress
              percent={assessment.summary.clarityPercent}
              format={() => assessment.summary.clarityText}
            />
          )}
          {assessment.summary.speakingRateText ? (
            <Text>Speaking rate: {assessment.summary.speakingRateText}</Text>
          ) : null}
          {assessment.summary.scoreNotes.map((note) => (
            <Text key={note} type="secondary">
              {note}
            </Text>
          ))}
        </Flex>
      ) : null}

      {assessment.summary.prosodyFeedback.length ? (
        <Flex vertical gap="small">
          <Text strong type="secondary">
            Prosody coaching estimates
          </Text>
          <List
            size="small"
            dataSource={assessment.summary.prosodyFeedback}
            renderItem={(feedback) => (
              <List.Item>
                <Text type="secondary">{feedback}</Text>
              </List.Item>
            )}
          />
        </Flex>
      ) : null}
    </>
  );
}
