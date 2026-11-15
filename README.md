# ✨ feature-creep

A Chrome extension that adds a **✨ Suggest Feature** button to every GitHub repo. Click it and it reads the repo, then opens a pre-filled GitHub issue proposing the most asinine but plausible feature for that repo, written by a very earnest product manager.

Built for Stupid Ideas Hackathon Ottawa. No build step: edit a file, reload the extension.

## Install (load unpacked)

1. Download or clone this repo.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick this folder (the one containing `manifest.json`).
5. Open any GitHub repo, for example <https://github.com/torvalds/linux>. The button sits next to Star/Fork. If GitHub has moved that row, it floats in the bottom-right corner instead.

After changing any file, click the reload arrow on the feature-creep card at `chrome://extensions`, then refresh the GitHub tab.

## Set your keys

Click the feature-creep icon in the Chrome toolbar (or **Details → Extension options**) and paste:

- **Anthropic API key** (required for live suggestions): from <https://console.anthropic.com/>.
- **GitHub token** (optional): without one, GitHub allows 60 requests an hour, which is about 30 clicks. Any token works for public repos; it needs no scopes.

Keys are stored in `chrome.storage.local` in your browser profile. They are never written to this repo.

Repos listed in `demo-cache.json` work with no keys at all.

## Making it funnier

You don't need to code. Three files at the top of the repo control the comedy:

| File | What it is | Change it when |
| --- | --- | --- |
| `prompt.md` | The instructions the AI gets | The ideas aren't funny, specific or pointless enough |
| `config.js` | Settings: spinner messages, button label, issue labels, length limits, which AI model | You want new spinner jokes or longer/shorter issues |
| `demo-cache.json` | Ready-made issues for specific repos | You want a guaranteed-good result for the repos in the demo |

### Test a prompt change without touching Chrome

You need [Node.js](https://nodejs.org) 18 or newer. In a terminal, in this folder:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

```bash
node scripts/try.mjs torvalds/linux facebook/react
```

That prints the issue the button would create for each repo. Edit `prompt.md`, save, run it again, repeat.

To see exactly what the AI is being told (free, no key needed):

```bash
node scripts/try.mjs torvalds/linux --dry-run
```

If GitHub says you're rate limited, also set `export GITHUB_TOKEN=...`.

### Refresh the demo cache

When a run makes you laugh, lock it in:

```bash
node scripts/try.mjs torvalds/linux --save
```

That writes the result into `demo-cache.json` under `"torvalds/linux"`. From then on the button uses that exact issue for that repo, instantly, with no AI call. Don't like what got saved? Run it again, or edit the text in `demo-cache.json` by hand.

The cache is also the safety net: if the wifi dies or the AI returns garbage twice, the button opens a random cached issue rather than an error. Both behaviours can be switched off in `config.js` (`cacheEnabled`, `fallbackToCacheOnError`).

Then reload the extension so Chrome picks up the new files.

### Tips

- The placeholders in `prompt.md` (`{{repo_name}}`, `{{readme}}`, `{{file_tree}}`, `{{languages}}`) are explained at the top of that file. Keep them, and keep the six JSON field names.
- The three entries currently in `demo-cache.json` were written by hand as placeholders. Replace them with real `--save` output for your demo repos.
- Issue labels only apply if they already exist in the target repo and you're allowed to set them.

## How it fits together

```
prompt.md, config.js, demo-cache.json   <- the parts you tune
src/core.js                             <- all the logic, shared by both of:
  extension/background.js               <- service worker: network calls, opens the issue tab
  scripts/try.mjs                       <- command-line version for tuning
extension/content.js, content.css       <- the button and spinner on github.com
extension/options.html, options.js      <- the keys page
manifest.json                           <- Chrome extension manifest (MV3)
```

On click: cache hit → use it. Otherwise fetch README (main, then master), file tree and languages → fill `prompt.md` → Anthropic Messages API → validate the JSON (one retry) → open `issues/new?title=…&body=…&labels=…`. On any failure, a random cache entry is used and a small note says why.

## Troubleshooting

- **No button**: it only appears on a repo's main page (`github.com/owner/repo`). Refresh the tab after reloading the extension.
- **"used a canned idea: …" note**: the live run failed and the cache stepped in. The note gives the reason (no API key, rate limit, and so on). More detail: `chrome://extensions` → feature-creep → **service worker** → Console.
- **Anthropic API 400 mentioning temperature**: leave `temperature: null` in `config.js`; current Claude models don't accept it.

## Status / Next

Done:

- [x] Milestone 1: `src/core.js`, `scripts/try.mjs`, `prompt.md`, `config.js`
- [x] Milestone 2: extension (button next to Star/Fork, floating fallback, spinner, service worker)
- [x] Milestone 3: options page, demo cache + fallback, README
- [x] Tested offline: CLI against a mocked network; extension in headless Chromium against stand-in GitHub pages (inline and floating button, cache hit, fallback, options page)

Not yet verified (the build sandbox had no API key and no GitHub access):

- [ ] One real `node scripts/try.mjs owner/repo` run with a real key. Confirms `claude-haiku-5-5` accepts the request as sent (`effort: "low"`, no temperature).
- [ ] Load unpacked in real Chrome and check the button lands next to Star/Fork on live github.com (selector: `ul.pagehead-actions` in `extension/content.js`)

Next:

- [ ] Replace the hand-written `demo-cache.json` entries with `--save` output for the actual demo repos
- [ ] Tune `prompt.md` against 5 to 10 varied repos
- [ ] Optional: extension icon; try `README.rst` / lowercase `readme.md` when `README.md` is missing
