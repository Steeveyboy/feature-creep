// feature-creep core logic.
//
// Shared by the extension's service worker (extension/background.js) and the
// CLI (scripts/try.mjs). It must stay environment-neutral: no chrome.*, no
// node:fs. Callers load prompt.md / config.js / demo-cache.json themselves and
// pass them in. Only global `fetch` is assumed (browsers and Node 18+).

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2026-10-21";

const REQUIRED_STRING_FIELDS = ["title", "user_story", "why_now", "kpi_impacted"];

// ── Small helpers ────────────────────────────────────────────────────────────

/** "owner/repo" (or a github.com URL) -> { owner, repo }. Throws if malformed. */
export function parseRepoSlug(input) {
  const cleaned = String(input)
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const match = cleaned.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match) throw new Error(`Expected "owner/repo", got "${input}"`);
  return { owner: match[1], repo: match[2] };
}

function truncate(text, maxChars, marker = "…") {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - marker.length)).trimEnd() + marker;
}

// ── 1. Fetch repo context ────────────────────────────────────────────────────

function githubHeaders(token) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchReadme(owner, repo, token, signal) {
  // main, then master; HEAD is a last resort for repos with another default branch.
  for (const branch of ["main", "master", "HEAD"]) {
    const res = await fetch(`${GITHUB_RAW}/${owner}/${repo}/${branch}/README.md`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    });
    if (res.ok) return await res.text();
  }
  return "";
}

async function githubJson(path, token, signal) {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders(token), signal });
  if (!res.ok) {
    const rateLimited = res.status === 403 || res.status === 429;
    const hint = rateLimited ? " (rate limited? add a GitHub token)" : "";
    throw new Error(`GitHub API ${res.status} for ${path}${hint}`);
  }
  return res.json();
}

/**
 * Gather everything the prompt needs about a repo.
 * Returns { repo_name, readme, file_tree, languages } as ready-to-insert strings.
 * A missing README is tolerated; a failing GitHub API call throws.
 */
export async function fetchRepoContext({ owner, repo, githubToken, config, signal }) {
  const [readme, tree, languages] = await Promise.all([
    fetchReadme(owner, repo, githubToken, signal),
    githubJson(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, githubToken, signal),
    githubJson(`/repos/${owner}/${repo}/languages`, githubToken, signal),
  ]);

  // Files only, shallowest first: top-level files say the most about a repo.
  const depth = (path) => path.split("/").length;
  const paths = (tree.tree || [])
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path)
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  const shown = paths.slice(0, config.maxFileTreeEntries);
  const hidden = paths.length - shown.length;

  const totalBytes = Object.values(languages).reduce((sum, n) => sum + n, 0);
  const languageList = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => `${name} ${Math.round((bytes / totalBytes) * 100)}%`)
    .join(", ");

  return {
    repo_name: `${owner}/${repo}`,
    readme: readme
      ? truncate(readme, config.maxReadmeChars, "\n[README truncated]")
      : "(no README found)",
    file_tree: shown.join("\n") + (hidden > 0 ? `\n… and ${hidden} more files` : ""),
    languages: languageList || "(none detected)",
  };
}

// ── 2. Fill the prompt template ──────────────────────────────────────────────

/** Strip the leading <!-- help comment --> and swap {{placeholders}} for values. */
export function buildPrompt(template, context) {
  const body = template.replace(/^\s*<!--[\s\S]*?-->\s*/, "");
  // One pass, so a README that happens to contain "{{...}}" is left alone.
  return body.replace(/\{\{(\w+)\}\}/g, (whole, name) =>
    name in context ? context[name] : whole
  );
}

// ── 3. Call the Anthropic Messages API ───────────────────────────────────────

/** Sends one user message, returns the model's text. Throws on any API error. */
export async function callAnthropic({ prompt, apiKey, config, signal }) {
  if (!apiKey) throw new Error("No Anthropic API key set");

  const body = {
    model: config.model,
    max_tokens: config.max_tokens,
    messages: [{ role: "user", content: prompt }],
  };
  // Current models reject sampling params, so only send temperature if asked to.
  if (typeof config.temperature === "number") body.temperature = config.temperature;
  if (config.effort) body.output_config = { effort: config.effort };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      // Required for calls made from a browser context (the service worker).
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
    signal,
  });

  const data = await res.json().catch(() => null);
  signal?.throwIfAborted();
  if (!res.ok) {
    const detail = data?.error?.message || res.statusText;
    throw new Error(`Anthropic API ${res.status}: ${detail}`);
  }
  if (data.stop_reason === "refusal") throw new Error("The model declined this request");

  // The response may contain thinking blocks; we only want the text.
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  return { text, truncated: data.stop_reason === "max_tokens" };
}

// ── 4. Parse and validate the model's JSON ───────────────────────────────────

/** Thrown when the model's answer is not the JSON we asked for (worth a retry). */
export class SuggestionFormatError extends Error {}

/** Check an already-parsed object and return a clean copy. Throws SuggestionFormatError. */
export function validateSuggestion(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SuggestionFormatError("Expected a JSON object");
  }
  const clean = {};
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof raw[field] !== "string" || !raw[field].trim()) {
      throw new SuggestionFormatError(`Missing or empty "${field}"`);
    }
    clean[field] = raw[field].trim();
  }

  // Accept 13 or "13"; anything else non-empty is kept as text ("XL").
  const points = raw.story_points;
  if (points === undefined || points === null || String(points).trim() === "") {
    throw new SuggestionFormatError('Missing "story_points"');
  }
  clean.story_points = Number.isFinite(Number(points)) ? Number(points) : String(points).trim();

  const criteria = Array.isArray(raw.acceptance_criteria)
    ? raw.acceptance_criteria.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim())
    : [];
  if (criteria.length === 0) {
    throw new SuggestionFormatError('"acceptance_criteria" must be a non-empty list of strings');
  }
  clean.acceptance_criteria = criteria;
  return clean;
}

/** Model text -> validated suggestion. Tolerates code fences and stray prose. */
export function parseSuggestion(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SuggestionFormatError("No JSON object in the reply");
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    throw new SuggestionFormatError(`Invalid JSON: ${err.message}`);
  }
  return validateSuggestion(parsed);
}

// ── 5. Format the issue ──────────────────────────────────────────────────────

export function formatIssueBody(suggestion, config) {
  const body = [
    "## User story",
    suggestion.user_story,
    "",
    "## Why now",
    suggestion.why_now,
    "",
    "| Story points | KPI impacted |",
    "| --- | --- |",
    `| ${suggestion.story_points} | ${suggestion.kpi_impacted.replace(/\|/g, "\\|")} |`,
    "",
    "## Acceptance criteria",
    ...suggestion.acceptance_criteria.map((c) => `- [ ] ${c}`),
  ].join("\n");
  return truncate(body, config.maxIssueBodyChars);
}

export function buildIssueUrl({ owner, repo, suggestion, config }) {
  const params = new URLSearchParams({
    title: suggestion.title,
    body: formatIssueBody(suggestion, config),
  });
  if (config.issueLabels?.length) params.set("labels", config.issueLabels.join(","));
  return `https://github.com/${owner}/${repo}/issues/new?${params}`;
}

// ── 6. Pipelines ─────────────────────────────────────────────────────────────

/**
 * The live pipeline: repo context -> prompt -> model -> validated suggestion.
 * Retries the model call once if the answer isn't valid JSON.
 * Pass `context` to reuse one already fetched (the CLI does this for --dry-run).
 */
export async function generateSuggestion({ owner, repo, template, config, apiKey, githubToken, context, signal }) {
  context ??= await fetchRepoContext({ owner, repo, githubToken, config, signal });
  const prompt = buildPrompt(template, context);

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text, truncated } = await callAnthropic({ prompt, apiKey, config, signal });
    try {
      return parseSuggestion(text);
    } catch (err) {
      if (!(err instanceof SuggestionFormatError)) throw err;
      if (truncated) err.message += " (reply was cut off: raise max_tokens in config.js)";
      lastError = err;
    }
  }
  throw lastError;
}

/** Case-insensitive lookup of "owner/repo" in the demo cache. */
export function findInCache(cache, owner, repo) {
  const wanted = `${owner}/${repo}`.toLowerCase();
  const key = Object.keys(cache || {}).find((k) => k.toLowerCase() === wanted);
  return key ? cache[key] : null;
}

/** A random valid cache entry, or null if the cache has none. */
export function pickFallback(cache) {
  const usable = Object.values(cache || {}).filter((entry) => {
    try {
      validateSuggestion(entry);
      return true;
    } catch {
      return false;
    }
  });
  return usable.length ? usable[Math.floor(Math.random() * usable.length)] : null;
}

/**
 * What the extension button does: cache first, then the live pipeline, then a
 * random cached entry if that fails.
 * Returns { suggestion, source: "cache" | "api" | "fallback", issueUrl, error? }.
 * Throws only if the live pipeline fails and no fallback is available/allowed.
 */
export async function suggestFeature({ owner, repo, template, config, cache, apiKey, githubToken, signal }) {
  const done = (suggestion, source, error) => ({
    suggestion,
    source,
    error,
    issueUrl: buildIssueUrl({ owner, repo, suggestion, config }),
  });

  if (config.cacheEnabled) {
    const cached = findInCache(cache, owner, repo);
    if (cached) {
      try {
        return done(validateSuggestion(cached), "cache");
      } catch {
        // A hand-edited cache entry is broken: ignore it and go live.
      }
    }
  }

  try {
    const suggestion = await generateSuggestion({ owner, repo, template, config, apiKey, githubToken, signal });
    return done(suggestion, "api");
  } catch (err) {
    const fallback = config.fallbackToCacheOnError ? pickFallback(cache) : null;
    if (!fallback) throw err;
    return done(validateSuggestion(fallback), "fallback", err.message);
  }
}
