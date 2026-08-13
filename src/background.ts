const PRACTICE_SELECTION_MENU_ID = 'practice-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: PRACTICE_SELECTION_MENU_ID,
    title: 'Practice selected text',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (
    info.menuItemId !== PRACTICE_SELECTION_MENU_ID ||
    !info.selectionText ||
    typeof tab?.id !== 'number'
  ) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  });

  await chrome.tabs.sendMessage(tab.id, {
    type: 'PRACTICE_SELECTION',
    text: info.selectionText,
  });
});
