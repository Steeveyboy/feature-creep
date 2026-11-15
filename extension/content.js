// Content script: puts the button on GitHub repo root pages and shows the
// spinner. No network calls here; it just messages the service worker.
// (Content scripts can't be ES modules, so UI settings from config.js are
// fetched from the service worker instead of imported.)

(() => {
  const BUTTON_ID = "feature-creep-button";
  const ACTIONS_SELECTOR = 'ul[data-testid="repo-header-actions"], ul.pagehead-actions';

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

  async function onClick(button) {
    const repo = currentRepo();
    if (busy || !repo) return;
    if (issuesDisabled(repo)) {
      toast("feature-creep: this repo has issues turned off, so there is nowhere to file the idea. Try another repo.");
      return;
    }
    busy = true;
    button.disabled = true;

    let i = Math.floor(Math.random() * ui.spinnerMessages.length);
    const spin = () => {
      button.textContent = `⏳ ${ui.spinnerMessages[i++ % ui.spinnerMessages.length]}`;
    };
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
    button.textContent = ui.buttonLabel;
    button.disabled = false;
    busy = false;

    if (!reply?.ok) toast(`feature-creep: ${reply?.error || "something went wrong"}`);
    else if (reply.source === "fallback") toast(`feature-creep used a canned idea: ${reply.error}`);
  }

  /** Make our button look like its neighbours by borrowing their styling hooks. */
  function copyGithubButtonStyle(actions, button) {
    const neighbour = actions.querySelector("a[data-component=Button], button[data-component=Button]");
    if (!neighbour) {
      button.className = "btn btn-sm"; // older GitHub layout
      return;
    }
    button.className = neighbour.className;
    for (const attr of ["data-component", "data-size", "data-variant"]) {
      if (neighbour.hasAttribute(attr)) button.setAttribute(attr, neighbour.getAttribute(attr));
    }
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

    // The list holding Watch / Fork / Star (current GitHub, then the older
    // layout). If GitHub renames it again, we float.
    const actions = document.querySelector(ACTIONS_SELECTOR);
    const wanted = actions ? "inline" : "floating";
    if (existing?.isConnected && existing.dataset.placement === wanted) return;
    existing?.closest(".feature-creep-wrap")?.remove();

    const button = makeButton();
    button.dataset.placement = wanted;
    if (actions) {
      const li = document.createElement("li");
      li.className = "feature-creep-wrap";
      copyGithubButtonStyle(actions, button);
      li.append(button);
      actions.append(li);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "feature-creep-wrap feature-creep-floating";
      wrap.append(button);
      document.body.append(wrap);
    }
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
