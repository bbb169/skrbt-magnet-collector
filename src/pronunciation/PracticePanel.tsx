import {
  AudioOutlined,
  CloseOutlined,
  RedoOutlined,
  SoundOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Flex,
  Progress,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';

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

  return (
    <Card
      title="Pronunciation practice"
      extra={
        <Tooltip title="Close">
          <Button
            aria-label="Close pronunciation practice"
            icon={<CloseOutlined />}
            type="text"
            onClick={onClose}
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

        <Space wrap>
          <Tooltip title="Reference playback is added in Step 3">
            <Button disabled icon={<SoundOutlined />}>
              Hear
            </Button>
          </Tooltip>
          <Tooltip title="Microphone recording is added in Step 4">
            <Button disabled icon={<AudioOutlined />} type="primary">
              Record
            </Button>
          </Tooltip>
          <Button disabled icon={<StopOutlined />}>
            Stop
          </Button>
          <Button disabled icon={<RedoOutlined />}>
            Retry
          </Button>
        </Space>

        <Spin spinning={false}>
          <Flex vertical gap="small">
            <Text strong>Assessment</Text>
            <Progress percent={0} status="normal" format={() => 'Not assessed'} />
            <Paragraph type="secondary">
              Record the sentence to receive clarity and pronunciation feedback.
            </Paragraph>
          </Flex>
        </Spin>
      </Flex>
    </Card>
  );
}
