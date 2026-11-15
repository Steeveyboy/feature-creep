// Daily tech buzzword aggregator.
//
// Pulls today's Hacker News front page (via the Algolia HN API: free, no key,
// CORS-friendly) and boils the headlines down to the most buzzy words. Used by
// the prompt (so the product manager can name-drop what's trending) and by the
// loading screen. Environment-neutral like core.js: only global `fetch`.

const HN_FRONT_PAGE = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40";

// Used when the network is down, so the feature always has something to say.
export const FALLBACK_BUZZWORDS = [
  "AI agents",
  "vibe coding",
  "zero trust",
  "platform engineering",
  "serverless",
  "observability",
  "microservices",
  "Web3",
];

// Everyday words that are trending in every headline but are not buzzwords.
const STOPWORDS = new Set(
  (
    "a about after again all also an and any are as at back be because been before being best but by can could " +
    "did do does doing done down first for from get got had has have how i if in into is it its just like make " +
    "made more most my new no not now of off on one only or other our out over own really see should show ask " +
    "so some still such than that the their them then there these they this those through to too under up us " +
    "use used using very want was way we were what when where which while who why will with without would you your " +
    "hn tell year years day days time today week people thing things why's it's don't isn't can't i'm " +
    "says said say pdf video audio blog post part guide intro introduction"
  ).split(/\s+/)
);

// Words that are buzzwords on their own merit; they get a big score boost.
const TECH = new Set(
  (
    "ai llm llms gpt agent agents agentic ml rag cloud serverless kubernetes docker rust go golang python " +
    "typescript javascript wasm webassembly api apis database sql postgres sqlite blockchain crypto web3 " +
    "quantum robotics gpu cuda linux open-source opensource startup saas devops security privacy encryption " +
    "chip chips model models neural inference opensource compiler framework microservices observability " +
    "automation vibe coding cybersecurity data analytics edge iot 5g 6g metaverse"
  ).split(/\s+/)
);

const TOKEN = /[A-Za-z][A-Za-z0-9+#.\-]*[A-Za-z0-9+#]|[A-Za-z]/g;

/**
 * Headlines -> the `count` buzziest terms, best first.
 * A term's score is how often it appears, plus a little for how popular the
 * stories that use it are. Display form is the first spelling seen ("LLM", "Rust").
 * `stories` is [{ title, points }].
 */
export function extractBuzzwords(stories, count = 8) {
  const seen = new Map(); // lowercase -> { display, score }
  for (const story of stories) {
    const title = String(story.title || "").replace(/^(show|ask|tell) hn:\s*/i, "");
    const points = Number(story.points) || 0;
    const inThisTitle = new Set();
    for (const token of title.match(TOKEN) || []) {
      const key = token.toLowerCase();
      if (key.length < 3 || STOPWORDS.has(key) || inThisTitle.has(key)) continue;
      inThisTitle.add(key);
      // Tech words and acronyms/CamelCase read as buzzwords; plain words rarely do.
      const looksTechy = /^[A-Z0-9+#.\-]{2,}$/.test(token) || /[a-z][A-Z]/.test(token) || /[0-9+#]/.test(token);
      const weight = TECH.has(key) ? 3 : looksTechy ? 2 : /^[A-Z]/.test(token) ? 1 : 0.4;
      const entry = seen.get(key) || { display: token, score: 0 };
      entry.score += weight * (1 + points / 500);
      seen.set(key, entry);
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.score - a.score || a.display.localeCompare(b.display))
    .slice(0, count)
    .map((entry) => entry.display);
}

/** Fetch today's buzzwords. Never throws: falls back to a built-in list. */
export async function fetchBuzzwords({ count = 8, timeoutMs = 4000 } = {}) {
  try {
    const res = await fetch(HN_FRONT_PAGE, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HN API ${res.status}`);
    const { hits } = await res.json();
    const words = extractBuzzwords(hits || [], count);
    if (words.length === 0) throw new Error("no buzzwords found");
    return { words, source: "live" };
  } catch (err) {
    return { words: FALLBACK_BUZZWORDS.slice(0, count), source: "fallback", error: err.message };
  }
}

/** ["AI", "Rust"] -> "AI, Rust" for the prompt. */
export function formatBuzzwords(words) {
  const list = words?.length ? words : FALLBACK_BUZZWORDS;
  return list.join(", ");
}
