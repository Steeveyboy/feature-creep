// Content script: shows the illustrated button, approval pop-ups and loading
// overlay on GitHub repo pages. The service worker generates suggestions.
// (Content scripts can't be ES modules, so UI settings from config.js are
// fetched from the service worker instead of imported.)

(() => {
  const BUTTON_ID = "feature-creep-button";
  const OVERLAY_ID = "feature-creep-overlay";
  const ART_FRAMES = ["extension/aardvark_button1.png", "extension/aardvark_button2.png"];
  const APPROVALS = [
    {
      title: "Simplicity detected",
      message: "This request takes one click. Approve an approval process to bring it up to spec.",
      action: "Approve the approval process",
    },
    {
      title: "Stakeholder alignment required",
      message: "Your only stakeholder is you. Please confirm that you agree with yourself.",
      action: "Click here if you agree with yourself",
    },
    {
      title: "Draft release approval",
      message: "Your feature suggestion has been approved for drafting. Approve the decision to open the draft.",
      action: "Open issue draft",
    },
  ];

  // Used until (or in case) the service worker doesn't answer.
  let ui = {
    buttonLabel: "✨ Suggest Feature",
    spinnerMessages: ["Consulting stakeholders..."],
    spinnerIntervalMs: 1100,
  };
  let busy = false;
  let cancelStaleApproval;

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

  function makeArtwork(className, frames = ART_FRAMES.slice(0, 1)) {
    const art = document.createElement("span");
    art.className = `feature-creep-art ${className}`;
    art.setAttribute("aria-hidden", "true");

    for (const [index, path] of frames.entries()) {
      const image = document.createElement("img");
      image.alt = "";
      image.draggable = false;
      image.addEventListener("load", () => art.classList.add(`frame-${index + 1}-ready`), { once: true });
      image.src = chrome.runtime.getURL(path);
      art.append(image);
    }
    return art;
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
    const desk = document.createElement("span");
    desk.className = "feature-creep-desk";
    desk.setAttribute("aria-hidden", "true");
    const sprite = document.createElement("img");
    sprite.alt = "";
    sprite.draggable = false;
    sprite.src = chrome.runtime.getURL("extension/aardvark-desk.png");
    desk.append(sprite);
    const text = document.createElement("div");
    text.className = "feature-creep-message";
    card.append(desk, text);
    overlay.append(card);
    document.body.append(overlay);

    return {
      message: (t) => { text.textContent = t; },
      close: () => overlay.remove(),
    };
  }

  function requestApproval(repoPath) {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "feature-creep-popup-stack";
      dialog.setAttribute("aria-label", "Feature Creep approvals");

      for (const [index, approval] of APPROVALS.entries()) {
        const pane = document.createElement("section");
        pane.className = "feature-creep-popup-window";
        pane.style.setProperty("--feature-creep-offset", APPROVALS.length - 1 - index);
        pane.inert = index !== 0;

        const titleBar = document.createElement("header");
        titleBar.className = "feature-creep-popup-title";
        const title = document.createElement("strong");
        title.textContent = approval.title;
        const close = document.createElement("button");
        close.type = "button";
        close.className = "feature-creep-popup-close";
        close.setAttribute("aria-label", "Cancel feature suggestion");
        close.textContent = "×";
        close.addEventListener("click", () => dialog.close());
        titleBar.append(title, close);

        const message = document.createElement("p");
        message.id = `feature-creep-approval-${index}`;
        message.textContent = approval.message;
        const advance = document.createElement("button");
        advance.type = "button";
        advance.className = "feature-creep-popup-advance";
        advance.setAttribute("aria-describedby", message.id);
        advance.textContent = approval.action;
        advance.addEventListener("click", () => {
          const next = pane.previousElementSibling;
          if (!next) {
            dialog.close("approved");
            return;
          }
          pane.remove();
          next.inert = false;
          next.querySelector(".feature-creep-popup-advance").focus();
        });

        const body = document.createElement("div");
        body.className = "feature-creep-popup-body";
        body.append(message, makeArtwork("feature-creep-character"));
        pane.append(titleBar, body, advance);
        // The first approval sits on top, with later ones peeking out behind it.
        dialog.prepend(pane);
      }

      function finish(approved) {
        dialog.removeEventListener("close", onClose);
        cancelStaleApproval = undefined;
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve(approved);
      }

      function onClose() {
        finish(dialog.returnValue === "approved");
      }

      dialog.addEventListener("close", onClose);

      document.body.append(dialog);
      dialog.showModal();
      dialog.lastElementChild.querySelector(".feature-creep-popup-advance").focus();
      cancelStaleApproval = () => {
        if (!dialog.isConnected || location.pathname !== repoPath) finish(false);
      };
    });
  }

  async function onClick(button) {
    const repo = currentRepo();
    if (busy || !repo) return;
    if (issuesDisabled(repo)) {
      toast("feature-creep: this repo has issues turned off, so there is nowhere to file the idea. Try another repo.");
      return;
    }
    busy = true;
    const repoPath = location.pathname;
    let overlay;
    let timer;
    let reply;
    try {
      if (!(await requestApproval(repoPath)) || location.pathname !== repoPath) return;

      button.disabled = true;
      overlay = showOverlay();
      let i = Math.floor(Math.random() * ui.spinnerMessages.length);
      const spin = () => overlay.message(ui.spinnerMessages[i++ % ui.spinnerMessages.length]);
      spin();
      timer = setInterval(spin, ui.spinnerIntervalMs);

      reply = await chrome.runtime.sendMessage({ type: "suggest-feature", ...repo });
    } catch (err) {
      // Typically "Extension context invalidated" after reloading the extension.
      reply = { ok: false, error: `${err.message} (try refreshing this page)` };
    } finally {
      clearInterval(timer);
      overlay?.close();
      button.disabled = false;
      busy = false;
    }

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
    const label = document.createElement("span");
    label.className = "feature-creep-button-label";
    label.textContent = ui.buttonLabel;
    button.append(
      makeArtwork("feature-creep-sign", ART_FRAMES),
      makeArtwork("feature-creep-launcher-mascot", ["extension/aardvark-launcher.png"]),
      label,
    );
    button.addEventListener("click", () => onClick(button));
    return button;
  }

  function makeArrows() {
    const arrows = document.createElement("span");
    arrows.className = "feature-creep-arrows";
    arrows.setAttribute("aria-hidden", "true");
    const imageUrl = chrome.runtime.getURL("extension/mascot-arrow.png");
    arrows.style.setProperty("--feature-creep-arrow-image", `url("${imageUrl}")`);

    for (let index = 0; index < 5; index++) {
      const arrow = document.createElement("span");
      arrow.className = "feature-creep-arrow";
      arrows.append(arrow);
    }
    return arrows;
  }

  /** Idempotent: makes the page match what should be there. Safe to call often. */
  function ensureButton() {
    cancelStaleApproval?.();
    if (busy) return;
    const existing = document.getElementById(BUTTON_ID);
    if (!currentRepo()) {
      existing?.closest(".feature-creep-wrap")?.remove();
      return;
    }
    if (existing?.isConnected) return;

    const wrap = document.createElement("div");
    wrap.className = "feature-creep-wrap feature-creep-floating";
    wrap.append(makeButton(), makeArrows());
    document.body.append(wrap);
  }

  chrome.runtime
    .sendMessage({ type: "get-ui-config" })
    .then((fromConfig) => {
      if (!fromConfig) return;
      ui = { ...ui, ...fromConfig };
      const label = document.querySelector(`#${BUTTON_ID} .feature-creep-button-label`);
      if (label) label.textContent = ui.buttonLabel;
    })
    .catch(() => {}); // defaults are fine

  ensureButton();
  // GitHub swaps pages without a full reload, and re-renders its header.
  // Polling is crude but can't miss a navigation.
  setInterval(ensureButton, 1000);
})();
