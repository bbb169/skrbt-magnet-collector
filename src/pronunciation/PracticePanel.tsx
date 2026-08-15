import {
  AudioOutlined,
  CloseOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import {
  App,
  Alert,
  Button,
  Card,
  Flex,
  Progress,
  Tooltip,
  Typography,
} from 'antd';
import { useRequest } from 'ahooks';
import { useEffect, useRef, useState } from 'react';
import { ReactMediaRecorder } from 'react-media-recorder';
import {
  blobToBase64,
  playReference,
  stopReferencePlayback,
  toMonoPcmWav,
} from './audio';
import {
  getAssessmentMarkdown,
  mapPronunciationMarkdown,
  tokenizeSentence,
  type MappedPronunciationAssessment,
} from './scoring';
import type { PronunciationAssessmentResponse } from './types';

const { Paragraph, Text, Title } = Typography;

interface PracticePanelProps {
  selectedText: string;
  onClose: () => void;
}

export default function PracticePanel({
  selectedText,
  onClose,
}: PracticePanelProps) {
  const { message } = App.useApp();
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string>();
  const [assessmentState, setAssessmentState] = useState<
    'idle' | 'loading' | 'complete'
  >('idle');
  const [mappedAssessment, setMappedAssessment] =
    useState<MappedPronunciationAssessment>();
  const recordingPlayerRef = useRef<HTMLAudioElement>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const tokens = mappedAssessment?.tokens ?? tokenizeSentence(selectedText);

  const releaseRecorderStream = () => {
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    recorderStreamRef.current = null;
  };

  const stopPlayback = () => {
    stopReferencePlayback();
    setIsPlaying(false);
  };

  useEffect(() => {
    stopPlayback();
    releaseRecorderStream();
    setAssessmentState('idle');
    setMappedAssessment(undefined);
  }, [selectedText]);

  useEffect(
    () => () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    },
    [recordingUrl],
  );

  useEffect(() => () => releaseRecorderStream(), []);

  const handleHear = () => {
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
    releaseRecorderStream();
    onClose();
  };

  const assessRecording = async (recording: Blob) => {
    setAssessmentState('loading');
    try {
      const wavBase64 = await blobToBase64(recording);
      const response =
        await chrome.runtime.sendMessage<
          unknown,
          PronunciationAssessmentResponse
        >({
          type: 'ASSESS_PRONUNCIATION',
          wavBase64,
          referenceText: selectedText,
        });
      if (!response.ok) {
        throw new Error(response.error);
      }
      const markdown = getAssessmentMarkdown(response.data);
      if (!markdown) {
        throw new Error('The pronunciation result did not contain an assessment report.');
      }
      const nextAssessment = mapPronunciationMarkdown(selectedText, markdown);
      setMappedAssessment(nextAssessment);
      setAssessmentState('complete');
      void message.success('Assessment complete.');
    } catch (error) {
      setAssessmentState('idle');
      void message.error(
        error instanceof Error
          ? error.message
          : 'Pronunciation assessment failed.',
      );
    }
  };

  const {
    loading: isPreparingRecording,
    run: handleRecordingStop,
  } = useRequest(
    async (recording: Blob) => {
      const wavRecording = await toMonoPcmWav(recording);
      setRecordingUrl(URL.createObjectURL(wavRecording));
      return wavRecording;
    },
    {
      manual: true,
      onSuccess: (wavRecording) => {
        void assessRecording(wavRecording);
      },
      onError: (error) => {
        releaseRecorderStream();
        setAssessmentState('idle');
        void message.error(error.message || 'Audio conversion failed.');
      },
    },
  );

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
            {tokens.map((token) =>
              token.kind === 'word' ? (
                <Text key={token.index}>{token.text}</Text>
              ) : (
                <span key={token.index}>{token.text}</span>
              ),
            )}
          </div>
        </section>

        {mappedAssessment?.extraWords.length ? (
          <Alert
            showIcon
            type="warning"
            message={`Extra words: ${mappedAssessment.extraWords
              .map((entry) => entry.hyp)
              .filter(Boolean)
              .join(', ')}`}
          />
        ) : null}

        {mappedAssessment?.incomplete ? (
          <Alert
            showIcon
            type="warning"
            message="Assessment was incomplete. Unscored words were left unchanged; please retry."
          />
        ) : null}

        <Tooltip title="Play an American English reference">
          <Button
            icon={<SoundOutlined />}
            loading={isPlaying}
            onClick={handleHear}
          >
            {isPlaying ? 'Playing' : 'Hear'}
          </Button>
        </Tooltip>

        <ReactMediaRecorder
          audio
          blobPropertyBag={{ type: 'audio/webm' }}
          mediaRecorderOptions={{ mimeType: 'audio/webm' }}
          onStop={(_blobUrl, recording) => handleRecordingStop(recording)}
          stopStreamsOnStop={false}
          render={({
            error,
            previewAudioStream,
            startRecording,
            status,
            stopRecording,
          }) => {
            if (previewAudioStream) {
              recorderStreamRef.current = previewAudioStream;
            }
            return (
              <Flex vertical gap="small">
                {error ? <Alert showIcon type="error" message={error} /> : null}
                {status === 'recording' || status === 'stopping' ? (
                  <Button
                    danger
                    loading={status === 'stopping'}
                    onClick={() => {
                      stopPlayback();
                      stopRecording();
                    }}
                  >
                    Stop &amp; Review
                  </Button>
                ) : (
                  <Button
                    disabled={isPreparingRecording}
                    icon={<AudioOutlined />}
                    loading={
                      status === 'acquiring_media' || isPreparingRecording
                    }
                    type="primary"
                    onClick={() => {
                      stopPlayback();
                      recordingPlayerRef.current?.pause();
                      setAssessmentState('idle');
                      setMappedAssessment(undefined);
                      startRecording();
                    }}
                  >
                    Record
                  </Button>
                )}
                {isPreparingRecording && <Text>Preparing recording…</Text>}
              </Flex>
            );
          }}
        />

        {recordingUrl && (
          <Flex vertical gap="small">
            <audio
              ref={recordingPlayerRef}
              className="pronunciation-recording-player"
              controls
              preload="metadata"
              src={recordingUrl}
              onEnded={releaseRecorderStream}
              onError={releaseRecorderStream}
            >
              Your browser does not support audio playback.
            </audio>
          </Flex>
        )}

        <Flex vertical gap="small">
          <Text strong>Assessment</Text>
          <Progress
            percent={assessmentState === 'complete' ? 100 : 0}
            status="normal"
            format={() =>
              assessmentState === 'loading'
                ? 'Assessing'
                : assessmentState === 'complete'
                  ? 'Complete'
                  : 'Not assessed'
            }
          />
          <Paragraph type="secondary">
            Record the sentence to receive clarity and pronunciation feedback.
          </Paragraph>
        </Flex>
      </Flex>
    </Card>
  );
}
