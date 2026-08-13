const TARGET_PREFIX = 'https://skrbtso.top/detail';

function readMagnetHrefFromPage() {
  const magnetLink = document.querySelector('#detail-magnet-panel a#magnet');
  return magnetLink ? magnetLink.href : '';
}

async function clickFirstFiveDetailLinksFromPage() {
  const links = Array.from(
    document.querySelectorAll('ul.list-unstyled a.rrt.common-link'),
  ).slice(0, 5);
  const wait = (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });

  for (const link of links) {
    link.click();
    await wait(100);
  }

  return links.map((link) => link.href).filter(Boolean);
}

export async function openFirstFiveDetailLinks() {
  const [currentTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (typeof currentTab?.id !== 'number') {
    throw new Error('No active tab found.');
  }

  const injectionResult = await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    func: clickFirstFiveDetailLinksFromPage,
  });

  return injectionResult[0]?.result ?? [];
}

export async function collectMagnets() {
  const allTabs = await chrome.tabs.query({});
  const detailTabs = allTabs.filter((tab) => tab.url?.startsWith(TARGET_PREFIX));
  const detailTabIds = detailTabs
    .map((tab) => tab.id)
    .filter((tabId) => typeof tabId === 'number');
  const magnets = [];

  for (const tabId of detailTabIds) {
    try {
      const injectionResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: readMagnetHrefFromPage,
      });
      const href = injectionResult[0]?.result;

      if (href) {
        magnets.push(href);
      }
    } catch (error) {
      console.warn(`Could not scan tab ${tabId}:`, error);
    }
  }

  const collectedText = magnets.join('\n');

  if (collectedText) {
    await navigator.clipboard.writeText(collectedText);
  }

  if (detailTabIds.length) {
    await chrome.tabs.remove(detailTabIds);
  }

  return {
    collectedText,
    detailTabCount: detailTabIds.length,
    magnetCount: magnets.length,
  };
}
