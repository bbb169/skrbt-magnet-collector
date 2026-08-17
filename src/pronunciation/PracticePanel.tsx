import { CloseOutlined, SoundOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Flex,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { playReference, stopReferencePlayback } from './audio';
import {
  tokenizeSentence,
  type MappedPronunciationAssessment,
  type MappedSentenceToken,
} from './scoring';
import AssessmentResults from './AssessmentResults';
import PronunciationRecorder from './PronunciationRecorder';
import WordResult from './WordResult';

const { Text, Title } = Typography;

interface PracticePanelProps {
  selectedText?: string;
  onClose: () => void;
}

export default function PracticePanel({
  selectedText,
  onClose,
}: PracticePanelProps) {
  const { message } = App.useApp();
  const [isPlaying, setIsPlaying] = useState(false);
  const [mappedAssessment, setMappedAssessment] =
    useState<MappedPronunciationAssessment>();
  const isFreeSpeech = !selectedText;
  const tokens: MappedSentenceToken[] =
    mappedAssessment?.tokens ?? tokenizeSentence(selectedText ?? '');

  const stopPlayback = () => {
    stopReferencePlayback();
    setIsPlaying(false);
  };

  useEffect(() => {
    stopPlayback();
    setMappedAssessment(undefined);
  }, [selectedText]);

  const handleHear = () => {
    if (!selectedText) return;
    try {
      const playback = playReference(selectedText);
      setIsPlaying(true);
      if (!playback.usedAmericanVoice) {
        void message.warning(
          'No en-US voice is installed. Using the available English or browser voice.',
        );
      }
      void playback.finished
        .catch((error: unknown) => {
          void message.error(
            error instanceof Error
              ? error.message
              : 'Reference playback failed.',
          );
        })
        .finally(() => setIsPlaying(false));
    } catch {
      setIsPlaying(false);
      void message.error('Reference playback is unavailable.');
    }
  };

  const handleClose = () => {
    stopPlayback();
    onClose();
  };

  return (
    <Card
      title="Pronunciation practice"
      extra={
        <Tooltip title="Close">
          <Button
            aria-label="Close pronunciation practice"
            icon={<CloseOutlined />}
            type="text"
            onClick={handleClose}
          />
        </Tooltip>
      }
    >
      <Flex vertical gap="middle">
        {!isFreeSpeech ? (
          <section aria-labelledby="pronunciation-sentence-heading">
            <Title id="pronunciation-sentence-heading" level={5}>
              Selected sentence
            </Title>
            <div className="pronunciation-word-flow">
              {tokens.map((token) =>
                token.kind === 'word' ? (
                  token.assessment ? (
                    <WordResult
                      key={token.index}
                      assessment={token.assessment}
                      text={token.text}
                    />
                  ) : (
                    <Text key={token.index}>{token.text}</Text>
                  )
                ) : (
                  <span key={token.index}>{token.text}</span>
                ),
              )}
            </div>
          </section>
        ) : null}

        <AssessmentResults
          assessment={mappedAssessment}
          showTranscript={isFreeSpeech}
        />

        {!isFreeSpeech ? (
          <Tooltip title="Play an American English reference">
            <Button
              icon={<SoundOutlined />}
              loading={isPlaying}
              onClick={handleHear}
            >
              {isPlaying ? 'Playing' : 'Hear'}
            </Button>
          </Tooltip>
        ) : null}

        <PronunciationRecorder
          referenceText={selectedText}
          onAssessmentChange={setMappedAssessment}
          onStopReferencePlayback={stopPlayback}
        />
      </Flex>
    </Card>
  );
}
