import { AudioOutlined, CloseOutlined, SoundOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Flex,
  Progress,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import { VoiceRecorder } from 'react-voice-recorder-kit';
import { playReference, stopReferencePlayback } from './audio';

const { Paragraph, Text, Title } = Typography;

interface PracticePanelProps {
  selectedText: string;
  onClose: () => void;
}

function getWordTokens(text: string) {
  return text.match(/\S+/g) ?? [];
}

export default function PracticePanel({
  selectedText,
  onClose,
}: PracticePanelProps) {
  const tokens = getWordTokens(selectedText);
  const { message } = App.useApp();
  const [isPlaying, setIsPlaying] = useState(false);
  const [recorderStarted, setRecorderStarted] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string>();
  const recordingPlayerRef = useRef<HTMLAudioElement>(null);

  const stopPlayback = () => {
    stopReferencePlayback();
    setIsPlaying(false);
  };

  useEffect(() => {
    stopPlayback();
    setRecorderStarted(false);
  }, [selectedText]);

  useEffect(
    () => () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    },
    [recordingUrl],
  );

  const handleHear = () => {
    try {
      recordingPlayerRef.current?.pause();
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
        <section aria-labelledby="pronunciation-sentence-heading">
          <Title id="pronunciation-sentence-heading" level={5}>
            Selected sentence
          </Title>
          <div className="pronunciation-word-flow">
            {tokens.map((token, index) => (
              <Text key={`${index}-${token}`}>{token}</Text>
            ))}
          </div>
        </section>

        <Tooltip title="Play an American English reference">
          <Button
            icon={<SoundOutlined />}
            loading={isPlaying}
            onClick={handleHear}
          >
            {isPlaying ? 'Playing' : 'Hear'}
          </Button>
        </Tooltip>

        {recorderStarted ? (
          <div
            className="pronunciation-recorder-shell"
            onPointerDownCapture={stopPlayback}
          >
            <VoiceRecorder
              key={selectedText}
              autoStart
              width="100%"
              onDelete={() => setRecorderStarted(false)}
              onStop={(recording) => {
                setRecordingUrl(URL.createObjectURL(recording));
                setRecorderStarted(false);
                void message.success('Recording complete.');
              }}
            />
          </div>
        ) : (
          <Button
            icon={<AudioOutlined />}
            type="primary"
            onClick={() => {
              stopPlayback();
              recordingPlayerRef.current?.pause();
              setRecorderStarted(true);
            }}
          >
            Record
          </Button>
        )}

        {recordingUrl && (
          <audio
            ref={recordingPlayerRef}
            className="pronunciation-recording-player"
            controls
            src={recordingUrl}
            onPlay={stopPlayback}
          >
            Your browser does not support audio playback.
          </audio>
        )}

        <Flex vertical gap="small">
          <Text strong>Assessment</Text>
          <Progress percent={0} status="normal" format={() => 'Not assessed'} />
          <Paragraph type="secondary">
            Record the sentence to receive clarity and pronunciation feedback.
          </Paragraph>
        </Flex>
      </Flex>
    </Card>
  );
}
