document.addEventListener("DOMContentLoaded", async () => {
  const listEl = document.getElementById("list");
  const metaEl = document.getElementById("meta");
  const titleEl = document.getElementById("pageTitle");
  const refreshBtn = document.getElementById("refreshBtn");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;

  titleEl.textContent = tab?.title || "Email Finder";
  metaEl.textContent = tab?.url || "No tab";

  function priorityScore(emailLower) {
    if (!emailLower) return 3;
    if (emailLower.startsWith("info@")) return 0;
    if (emailLower.startsWith("support@")) return 1;
    return 2;
  }

  function sortAndUnique(arr) {
    const uniq = Array.from(new Set((arr || []).map(e => (typeof e === "string" ? e.toLowerCase().trim() : e))));
    uniq.sort((a, b) => {
      const pa = priorityScore(a);
      const pb = priorityScore(b);
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });
    return uniq;
  }

  function showSearching() {
    listEl.innerHTML = "";
    const info = document.createElement("div");
    info.style.padding = "8px";
    info.style.color = "#374151";
    info.textContent = "Search emails";
    listEl.appendChild(info);
  }

  function showNoFound() {
    listEl.innerHTML = "";
    const info = document.createElement("div");
    info.style.padding = "8px";
    info.style.color = "#6b7280";
    info.textContent = "No emails found on this page.";
    listEl.appendChild(info);
  }

  function renderList(emails) {
    listEl.innerHTML = "";
    if (!emails || emails.length === 0) {
      showNoFound();
      return;
    }

    emails.forEach(email => {
      const row = document.createElement("div");
      row.className = "email-row";

      const txt = document.createElement("div");
      txt.className = "email-text";
      txt.textContent = email;

      const btns = document.createElement("div");
      btns.style.display = "flex";
      btns.style.gap = "6px";

      const copy = document.createElement("button");
      copy.className = "btn";
      copy.textContent = "Copy";
      copy.onclick = () => copyText(email);

      const mailto = document.createElement("button");
      mailto.className = "btn";
      mailto.textContent = "Mail";
      mailto.onclick = () => {
        window.open(`mailto:${email}`);
      };

      btns.appendChild(copy);
      btns.appendChild(mailto);

      row.appendChild(txt);
      row.appendChild(btns);
      listEl.appendChild(row);
    });
  }

  function copyText(s) {
    if (!navigator.clipboard) {
      const ta = document.createElement("textarea");
      ta.value = s;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (e) {}
      ta.remove();
      return;
    }
    navigator.clipboard.writeText(s).catch(() => {});
  }

  async function injectScanner() {
    if (!tabId) return;
    showSearching();
    try {
      try {
        await chrome.tabs.sendMessage(tabId, { action: "stopScanning" }).catch(() => {});
      } catch (e) {}
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });

      setTimeout(() => {
        if (listEl.textContent && listEl.textContent.trim() === "Search emails") {
          showNoFound();
        }
      }, 8000);
    } catch (err) {
      console.error("Failed to execute content script:", err);
      setTimeout(() => {
        if (listEl.textContent && listEl.textContent.trim() === "Search emails") {
          showNoFound();
        }
      }, 700);
    }
  }

  injectScanner();

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.action === "saveEmailsForTab") {
      if (sender.tab && sender.tab.id !== tabId) return;
      const emails = sortAndUnique(msg.emails || []);
      if (msg.done) {
        if (!emails || emails.length === 0) showNoFound();
        else renderList(emails);
      } else {
        if (!emails || emails.length === 0) {
          showSearching();
        } else {
          renderList(emails);
        }
      }
    }
  });

  refreshBtn.onclick = async () => {
    await injectScanner();
  };
  window.addEventListener("unload", () => {
    try {
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { action: "stopScanning" }, () => {});
      }
    } catch (e) {}
  });
});