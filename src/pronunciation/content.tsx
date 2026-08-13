import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntdApp, ConfigProvider } from 'antd';
import { createRoot, type Root } from 'react-dom/client';
import PracticePanel from './PracticePanel';
import contentStyles from './content.css?inline';
import { pronunciationTheme } from './theme';
import { isPracticeSelectionMessage } from './types';

const CONTENT_ROOT_ID = 'skrbt-pronunciation-root';
const CONTROLLER_KEY = '__skrbtPronunciationController__';

interface PronunciationController {
  show: (selectedText: string) => void;
}

type PronunciationGlobal = typeof globalThis & {
  [CONTROLLER_KEY]?: PronunciationController;
};

function createController(): PronunciationController {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  host.hidden = true;

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const styleElement = document.createElement('style');
  const mountNode = document.createElement('div');
  const root: Root = createRoot(mountNode);

  styleElement.textContent = contentStyles;
  shadowRoot.append(styleElement, mountNode);
  document.documentElement.append(host);

  return {
    show(selectedText) {
      host.hidden = false;
      root.render(
        <StyleProvider container={shadowRoot}>
          <ConfigProvider
            getPopupContainer={() => mountNode}
            theme={pronunciationTheme}
          >
            <AntdApp>
              <PracticePanel
                selectedText={selectedText}
                onClose={() => {
                  root.render(null);
                  host.hidden = true;
                }}
              />
            </AntdApp>
          </ConfigProvider>
        </StyleProvider>,
      );
    },
  };
}

const pronunciationGlobal = globalThis as PronunciationGlobal;

if (!pronunciationGlobal[CONTROLLER_KEY]) {
  pronunciationGlobal[CONTROLLER_KEY] = createController();

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isPracticeSelectionMessage(message)) {
      pronunciationGlobal[CONTROLLER_KEY]?.show(message.text);
    }
  });
}
