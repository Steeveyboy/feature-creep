#!/usr/bin/env node
// Prompt-tuning CLI. Runs the same pipeline as the extension (src/core.js).
//
//   node scripts/try.mjs owner/repo [owner/repo ...]
//     --dry-run   print the fully assembled prompt, don't call the AI
//     --save      write each result into demo-cache.json
//
// Env: ANTHROPIC_API_KEY (required unless --dry-run), GITHUB_TOKEN (optional).
// The demo cache is deliberately ignored here: this always asks the AI.

import { readFile, writeFile } from "node:fs/promises";
import config from "../config.js";
import {
  parseRepoSlug,
  fetchRepoContext,
  buildPrompt,
  generateSuggestion,
  formatIssueBody,
  buildIssueUrl,
} from "../src/core.js";

const root = new URL("../", import.meta.url);
const cacheFile = new URL("demo-cache.json", root);

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const slugs = args.filter((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");
const save = flags.has("--save");

const unknown = [...flags].filter((f) => !["--dry-run", "--save"].includes(f));
if (slugs.length === 0 || unknown.length > 0) {
  if (unknown.length) console.error(`Unknown flag: ${unknown.join(", ")}`);
  console.error("Usage: node scripts/try.mjs owner/repo [owner/repo ...] [--dry-run] [--save]");
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
const githubToken = process.env.GITHUB_TOKEN;
if (!dryRun && !apiKey) {
  console.error("Set ANTHROPIC_API_KEY first (or use --dry-run to just see the prompt).");
  process.exit(1);
}

const template = await readFile(new URL("prompt.md", root), "utf8");
let failures = 0;

for (const slug of slugs) {
  console.log(`\n━━━ ${slug} ━━━`);
  try {
    const { owner, repo } = parseRepoSlug(slug);
    const context = await fetchRepoContext({ owner, repo, githubToken, config });

    if (dryRun) {
      console.log(buildPrompt(template, context));
      continue;
    }

    const suggestion = await generateSuggestion({ owner, repo, template, config, apiKey, context });
    console.log(`\n# ${suggestion.title}\n`);
    console.log(formatIssueBody(suggestion, config));
    console.log(`\n${buildIssueUrl({ owner, repo, suggestion, config })}`);

    if (save) {
      // Re-read each time so saving several repos in one run never loses an entry.
      const cache = JSON.parse(await readFile(cacheFile, "utf8"));
      cache[`${owner}/${repo}`] = suggestion;
      await writeFile(cacheFile, JSON.stringify(cache, null, 2) + "\n");
      console.log(`\nSaved to demo-cache.json as "${owner}/${repo}"`);
    }
  } catch (err) {
    failures++;
    console.error(`Failed: ${err.message}`);
  }
}

process.exit(failures ? 1 : 0);
