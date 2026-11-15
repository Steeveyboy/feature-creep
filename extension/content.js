// Content script: puts a floating button in the bottom corner of GitHub repo
// root pages and shows a centered loading overlay while the idea is generated. No network calls here; it just messages the service worker.
// (Content scripts can't be ES modules, so UI settings from config.js are
// fetched from the service worker instead of imported.)

(() => {
  const BUTTON_ID = "feature-creep-button";
  const OVERLAY_ID = "feature-creep-overlay";

  // Used until (or in case) the service worker doesn't answer.
  let ui = {
    buttonLabel: "✨ Suggest Feature",
    spinnerMessages: ["Consulting stakeholders..."],
    spinnerIntervalMs: 1100,
  };
  let busy = false;

  // github.com/<x>/<y> paths that are not repositories.
  const NOT_OWNERS = new Set([
    "settings", "orgs", "organizations", "marketplace", "sponsors", "topics",
    "collections", "features", "notifications", "explore", "login", "signup",
    "apps", "users", "search", "about", "enterprise", "account", "codespaces",
    "dashboard", "issues", "pulls", "stars", "trending", "new", "resources",
    "solutions", "customer-stories", "security", "pricing", "readme", "site",
  ]);

  /** { owner, repo } if this is a repo's root page, otherwise null. */
  function currentRepo() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || NOT_OWNERS.has(parts[0].toLowerCase())) return null;
    return { owner: parts[0], repo: parts[1] };
  }

  function toast(text) {
    const el = document.createElement("div");
    el.className = "feature-creep-toast";
    el.textContent = text;
    document.body.append(el);
    setTimeout(() => el.remove(), 6000);
  }

  /** Centered, dimmed loading overlay. Returns { message(text), close() }. */
  function showOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");

    const card = document.createElement("div");
    card.className = "feature-creep-card";
    const spinner = document.createElement("div");
    spinner.className = "feature-creep-spinner";
    const text = document.createElement("div");
    text.className = "feature-creep-message";
    card.append(spinner, text);
    overlay.append(card);
    document.body.append(overlay);

    return {
      message: (t) => { text.textContent = t; },
      close: () => overlay.remove(),
    };
  }

  async function onClick(button) {
    const repo = currentRepo();
    if (busy || !repo) return;
    if (issuesDisabled(repo)) {
      toast("feature-creep: this repo has issues turned off, so there is nowhere to file the idea. Try another repo.");
      return;
    }
    busy = true;
    button.disabled = true;

    const overlay = showOverlay();
    let i = Math.floor(Math.random() * ui.spinnerMessages.length);
    const spin = () => overlay.message(ui.spinnerMessages[i++ % ui.spinnerMessages.length]);
    spin();
    const timer = setInterval(spin, ui.spinnerIntervalMs);

    let reply;
    try {
      reply = await chrome.runtime.sendMessage({ type: "suggest-feature", ...repo });
    } catch (err) {
      // Typically "Extension context invalidated" after reloading the extension.
      reply = { ok: false, error: `${err.message} (try refreshing this page)` };
    }

    clearInterval(timer);
    overlay.close();
    button.disabled = false;
    busy = false;

    if (!reply?.ok) toast(`feature-creep: ${reply?.error || "something went wrong"}`);
    else if (reply.source === "fallback") toast(`feature-creep used a canned idea: ${reply.error}`);
  }

  /**
   * True when the repo's tab bar is on the page but has no Issues tab, which
   * means issues are turned off and the "new issue" link would be a 404.
   */
  function issuesDisabled({ owner, repo }) {
    const base = `/${owner}/${repo}`.toLowerCase();
    const hasTab = (name) =>
      [...document.querySelectorAll("a[href]")].some(
        (a) => a.getAttribute("href").toLowerCase() === `${base}/${name}`
      );
    // Only trust a missing Issues tab if we can see the tab bar at all.
    const tabBarVisible = ["pulls", "actions", "security", "pulse"].some(hasTab);
    return tabBarVisible && !hasTab("issues");
  }

  function makeButton() {
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = ui.buttonLabel;
    button.addEventListener("click", () => onClick(button));
    return button;
  }

  /** Idempotent: makes the page match what should be there. Safe to call often. */
  function ensureButton() {
    if (busy) return;
    const existing = document.getElementById(BUTTON_ID);
    if (!currentRepo()) {
      existing?.closest(".feature-creep-wrap")?.remove();
      return;
    }
    if (existing?.isConnected) return;

    const wrap = document.createElement("div");
    wrap.className = "feature-creep-wrap feature-creep-floating";
    wrap.append(makeButton());
    document.body.append(wrap);
  }

  chrome.runtime
    .sendMessage({ type: "get-ui-config" })
    .then((fromConfig) => {
      if (!fromConfig) return;
      ui = { ...ui, ...fromConfig };
      const button = document.getElementById(BUTTON_ID);
      if (button && !busy) button.textContent = ui.buttonLabel;
    })
    .catch(() => {}); // defaults are fine

  ensureButton();
  // GitHub swaps pages without a full reload, and re-renders its header.
  // Polling is crude but can't miss a navigation.
  setInterval(ensureButton, 1000);
})();
