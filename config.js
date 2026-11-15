// ─────────────────────────────────────────────────────────────────────────────
// feature-creep settings. Safe to edit: change a value, save, then reload the
// extension at chrome://extensions (or just re-run scripts/try.mjs).
// Keep the commas and quotes as they are.
// ─────────────────────────────────────────────────────────────────────────────

export default {
  // ── The AI ────────────────────────────────────────────────────────────────
  model: "claude-haiku-5-5",

  // Upper limit on the length of the AI's answer. Too low and the answer gets
  // cut off mid-sentence (which counts as a failure and triggers a retry).
  max_tokens: 2000,

  // Leave as null. Current Claude models reject requests that set a
  // temperature, so it is only sent if you put a number here (for older models).
  temperature: null,

  // How hard the model "thinks": "low" is fastest (good for a live demo),
  // "medium" / "high" are slower. null = let the model decide.
  effort: "low",

  // ── How much of the repo the AI gets to read ──────────────────────────────
  maxReadmeChars: 6000,
  maxFileTreeEntries: 150,

  // ── The GitHub issue ──────────────────────────────────────────────────────
  maxIssueBodyChars: 1500,
  // Labels only stick if they already exist in the repo and you have
  // permission to apply them. Otherwise GitHub quietly ignores them.
  issueLabels: ["enhancement"],

  // ── The button ────────────────────────────────────────────────────────────
  buttonLabel: "✨ Suggest Feature",
  spinnerMessages: [
    "Consulting stakeholders...",
    "Aligning on synergies...",
    "Circling back...",
    "Estimating story points...",
    "Socializing the roadmap...",
    "Moving the needle...",
  ],
  spinnerIntervalMs: 1100,

  // ── Demo safety net ───────────────────────────────────────────────────────
  // true: if the repo is in demo-cache.json, use that instantly (no AI call).
  cacheEnabled: true,
  // true: if anything goes wrong (no key, no wifi, bad AI answer), open a
  // random issue from demo-cache.json instead of showing an error.
  fallbackToCacheOnError: true,
};
