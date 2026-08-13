const TARGET_PREFIX = "https://skrbtso.top/detail";

const openFirstFiveButton = document.getElementById("open-first-five");
const collectButton = document.getElementById("collect");
const statusText = document.getElementById("status");
const output = document.getElementById("output");

function readMagnetHrefFromPage() {
  const magnetLink = document.querySelector("#detail-magnet-panel a#magnet");
  return magnetLink ? magnetLink.href : "";
}

async function clickFirstFiveDetailLinksFromPage() {
  const links = Array.from(document.querySelectorAll("ul.list-unstyled a.rrt.common-link"))
    .slice(0, 5);
  const wait = (milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

  // Click the real page elements so the site can run its own navigation logic.
  // Force a new tab target first; otherwise the first click would navigate this
  // page away and the remaining links would never receive their clicks.
  for (const link of links) {
    link.click();
    await wait(100);
  }

  return links
    .map((link) => link.href)
    .filter(Boolean);
}

function setButtonsDisabled(isDisabled) {
  openFirstFiveButton.disabled = isDisabled;
  collectButton.disabled = isDisabled;
}

async function openFirstFiveDetailLinks() {
  setButtonsDisabled(true);
  statusText.textContent = "Finding detail links on current tab...";
  output.value = "";

  try {
    const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = currentTabs[0];

    if (!currentTab || !currentTab.id) {
      statusText.textContent = "No active tab found.";
      return;
    }

    const injectionResult = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: clickFirstFiveDetailLinksFromPage
    });
    const links = (injectionResult[0] && injectionResult[0].result) || [];

    output.value = links.join("\n");
    statusText.textContent = links.length
      ? `Clicked ${links} detail link(s).`
      : "No detail links found on current tab.";
  } catch (error) {
    console.error(error);
    statusText.textContent = "Could not open detail links from this tab.";
  } finally {
    setButtonsDisabled(false);
  }
}

async function collectMagnets() {
  setButtonsDisabled(true);
  statusText.textContent = "Scanning open tabs...";
  output.value = "";

  try {
    const allTabs = await chrome.tabs.query({});
    const detailTabs = allTabs.filter((tab) => tab.url && tab.url.startsWith(TARGET_PREFIX));
    const detailTabIds = detailTabs.map((tab) => tab.id).filter(Boolean);
    const magnets = [];

    // Execute inside each matching tab because the popup cannot directly read
    // page DOM. Each tab is isolated so one failed page should not stop the
    // rest of the collection run.
    for (const tab of detailTabs) {
      try {
        const injectionResult = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: readMagnetHrefFromPage
        });

        const href = injectionResult[0] && injectionResult[0].result;
        if (href) {
          magnets.push(href);
        }
      } catch (error) {
        console.warn(`Could not scan tab ${tab.id}:`, error);
      }
    }

    const collectedText = magnets.join("\n");
    output.value = collectedText;

    if (collectedText) {
      await navigator.clipboard.writeText(collectedText);
      statusText.textContent = `Copied ${magnets.length} magnet link(s).`;
    } else {
      statusText.textContent = detailTabs.length
        ? "No magnet links found in matching tabs."
        : "No matching detail tabs are open.";
    }

    // Close the detail tabs only after the scan and clipboard write have
    // finished. That preserves the collected output if a page is slow or the
    // clipboard operation fails, while still cleaning up every tab we scanned.
    if (detailTabIds.length) {
      await chrome.tabs.remove(detailTabIds);
      statusText.textContent += ` Closed ${detailTabIds.length} detail tab(s).`;
    }
  } catch (error) {
    console.error(error);
    statusText.textContent = "Scan failed. Check extension permissions.";
  } finally {
    setButtonsDisabled(false);
  }
}

openFirstFiveButton.addEventListener("click", openFirstFiveDetailLinks);
collectButton.addEventListener("click", collectMagnets);
