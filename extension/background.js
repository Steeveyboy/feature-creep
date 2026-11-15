// Service worker: does every network call so the content script stays tiny.
// All real logic lives in src/core.js (shared with scripts/try.mjs).

import config from "../config.js";
import { suggestFeature } from "../src/core.js";
import { fetchBuzzwords } from "../src/buzzwords.js";

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

/** Today's buzzwords: fetched once per day, then served from storage. */
async function getBuzzwords() {
  if (!config.buzzwordsEnabled) return [];
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { buzzwordCache } = await chrome.storage.local.get("buzzwordCache");
    if (buzzwordCache?.date === today && buzzwordCache.words?.length) return buzzwordCache.words;
  } catch {
    // storage unavailable: just fetch
  }
  const { words, source } = await fetchBuzzwords({ count: config.buzzwordCount });
  // Only remember real results, so a failed fetch is retried on the next click.
  if (source === "live") await chrome.storage.local.set({ buzzwordCache: { date: today, words } }).catch(() => {});
  return words;
}

async function handleSuggest({ owner, repo }, sender) {
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(config.maxSuggestionMs);
  const [template, cache, keys, buzzwords] = await Promise.all([
    loadText("prompt.md"),
    loadCache(),
    chrome.storage.local.get(["anthropicApiKey", "githubToken"]),
    getBuzzwords(),
  ]);

  const result = await suggestFeature({
    owner,
    repo,
    template,
    config,
    cache,
    apiKey: keys.anthropicApiKey,
    githubToken: keys.githubToken,
    signal,
    buzzwords,
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
    // Today's buzzwords become extra loading steps.
    getBuzzwords()
      .catch(() => [])
      .then((words) =>
        sendResponse({
          buttonLabel: config.buttonLabel,
          spinnerMessages: [...config.spinnerMessages, ...words.slice(0, 2).map((w) => `Pivoting to ${w}...`)],
          spinnerIntervalMs: config.spinnerIntervalMs,
          minSpinnerMs: config.minSpinnerMs,
        })
      );
    return true;
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
