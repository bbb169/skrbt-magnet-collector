import { AudioOutlined } from '@ant-design/icons';
import { App, Alert, Button, Flex, Progress, Typography } from 'antd';
import { useRequest } from 'ahooks';
import { useEffect, useRef, useState } from 'react';
import { ReactMediaRecorder } from 'react-media-recorder';
import { blobToBase64, toMonoPcmWav } from './audio';
import {
  getAssessmentMarkdown,
  mapPronunciationMarkdown,
  type MappedPronunciationAssessment,
} from './scoring';
import type { PronunciationAssessmentResponse } from './types';

const { Paragraph, Text } = Typography;

interface PronunciationRecorderProps {
  referenceText?: string;
  onAssessmentChange: (
    assessment: MappedPronunciationAssessment | undefined,
  ) => void;
  onStopReferencePlayback: () => void;
}

export default function PronunciationRecorder({
  referenceText,
  onAssessmentChange,
  onStopReferencePlayback,
}: PronunciationRecorderProps) {
  const { message } = App.useApp();
  const [recordingUrl, setRecordingUrl] = useState<string>();
  const [assessmentState, setAssessmentState] = useState<
    'idle' | 'loading' | 'complete'
  >('idle');
  const recordingPlayerRef = useRef<HTMLAudioElement>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);

  const releaseRecorderStream = () => {
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    recorderStreamRef.current = null;
  };

  useEffect(() => {
    releaseRecorderStream();
    setAssessmentState('idle');
  }, [referenceText]);

  useEffect(
    () => () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    },
    [recordingUrl],
  );

  useEffect(() => () => releaseRecorderStream(), []);

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
          referenceText,
        });
      if (!response.ok) throw new Error(response.error);

      const markdown = getAssessmentMarkdown(response.data);
      if (!markdown) {
        throw new Error(
          'The pronunciation result did not contain an assessment report.',
        );
      }

      onAssessmentChange(mapPronunciationMarkdown(referenceText, markdown));
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

  const { loading: isPreparingRecording, run: handleRecordingStop } =
    useRequest(
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
    <Flex vertical gap="middle">
      <ReactMediaRecorder
        audio
        blobPropertyBag={{ type: 'audio/webm' }}
        mediaRecorderOptions={{ mimeType: 'audio/webm' }}
        onStop={(_blobUrl, recording) => handleRecordingStop(recording)}
        stopStreamsOnStop={false}
        render={(statusController) => {
          const {
            error,
            previewAudioStream,
            startRecording,
            status,
            stopRecording,
          } = statusController;

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
                    onStopReferencePlayback();
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
                    onStopReferencePlayback();
                    recordingPlayerRef.current?.pause();
                    setAssessmentState('idle');
                    onAssessmentChange(undefined);
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

      {recordingUrl ? (
        <audio
          ref={recordingPlayerRef}
          autoPlay
          className="pronunciation-recording-player"
          controls
          preload="metadata"
          src={recordingUrl}
          onEnded={releaseRecorderStream}
          onError={releaseRecorderStream}
        >
          Your browser does not support audio playback.
        </audio>
      ) : null}

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
          {referenceText
            ? 'Record the sentence to receive clarity and pronunciation feedback.'
            : 'Record your voice to receive a transcript, clarity, speed, and prosody feedback.'}
        </Paragraph>
      </Flex>
    </Flex>
  );
}
