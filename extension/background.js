// Service worker: does every network call so the content script stays tiny.
// All real logic lives in src/core.js (shared with scripts/try.mjs).

import config from "../config.js";
import { suggestFeature } from "../src/core.js";

// prompt.md and demo-cache.json are re-read on every click, so edits only
// need an extension reload (config.js is an import, so it needs one too).
async function loadText(path) {
  const res = await fetch(chrome.runtime.getURL(path));
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.text();
}

async function loadCache() {
  try {
    return JSON.parse(await loadText("demo-cache.json"));
  } catch (err) {
    console.warn("[feature-creep] demo-cache.json unreadable, continuing without it:", err);
    return {};
  }
}

async function handleSuggest({ owner, repo }, sender) {
  const startedAt = Date.now();
  const [template, cache, keys] = await Promise.all([
    loadText("prompt.md"),
    loadCache(),
    chrome.storage.local.get(["anthropicApiKey", "githubToken"]),
  ]);

  const result = await suggestFeature({
    owner,
    repo,
    template,
    config,
    cache,
    apiKey: keys.anthropicApiKey,
    githubToken: keys.githubToken,
  });
  if (result.error) console.warn("[feature-creep] used fallback because:", result.error);

  // Opening the tab steals focus, so wait here until the spinner has been seen.
  const remaining = (config.minSpinnerMs || 0) - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

  // Open right next to the repo tab.
  await chrome.tabs.create({ url: result.issueUrl, index: (sender.tab?.index ?? 0) + 1 });
  return { ok: true, source: result.source, error: result.error };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "get-ui-config") {
    sendResponse({
      buttonLabel: config.buttonLabel,
      spinnerMessages: config.spinnerMessages,
      spinnerIntervalMs: config.spinnerIntervalMs,
      minSpinnerMs: config.minSpinnerMs,
    });
    return false;
  }
  if (message?.type === "suggest-feature") {
    handleSuggest(message, sender)
      .then(sendResponse)
      .catch((err) => {
        console.error("[feature-creep]", err);
        sendResponse({ ok: false, error: err.message });
      });
    return true; // keep the channel open for the async reply
  }
  return false;
});

// Clicking the toolbar icon opens the options page (where the keys go).
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
