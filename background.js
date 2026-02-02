self.addEventListener('install', () => {
});
self.addEventListener('activate', () => {
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  sendResponse && sendResponse({ ok: true });
  return true;
});