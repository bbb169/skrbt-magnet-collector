import { useState } from 'react';
import { collectMagnets, openFirstFiveDetailLinks } from './chromeApi';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '';
}

export default function App() {
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState('');

  async function handleOpenFirstFive() {
    setIsBusy(true);
    setStatus('Finding detail links on current tab...');
    setOutput('');

    try {
      const links = await openFirstFiveDetailLinks();
      setOutput(links.join('\n'));
      setStatus(
        links.length
          ? `Clicked ${links.length} detail link(s).`
          : 'No detail links found on current tab.',
      );
    } catch (error) {
      console.error(error);
      setStatus(
        getErrorMessage(error) === 'No active tab found.'
          ? getErrorMessage(error)
          : 'Could not open detail links from this tab.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCollectMagnets() {
    setIsBusy(true);
    setStatus('Scanning open tabs...');
    setOutput('');

    try {
      const result = await collectMagnets();
      let nextStatus;

      setOutput(result.collectedText);

      if (result.magnetCount) {
        nextStatus = `Copied ${result.magnetCount} magnet link(s).`;
      } else {
        nextStatus = result.detailTabCount
          ? 'No magnet links found in matching tabs.'
          : 'No matching detail tabs are open.';
      }

      if (result.detailTabCount) {
        nextStatus += ` Closed ${result.detailTabCount} detail tab(s).`;
      }

      setStatus(nextStatus);
    } catch (error) {
      console.error(error);
      setStatus('Scan failed. Check extension permissions.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main>
      <button
        className="secondary"
        disabled={isBusy}
        type="button"
        onClick={handleOpenFirstFive}
      >
        Open First 5 Detail Links
      </button>
      <button disabled={isBusy} type="button" onClick={handleCollectMagnets}>
        Collect and Copy
      </button>
      <div className="status" role="status">
        {status}
      </div>
      <textarea aria-label="Collected links" value={output} readOnly />
    </main>
  );
}
