# ✨ feature-creep

A Chrome extension that adds a **✨ Suggest Feature** button to every GitHub repo. Click it and it reads the repo, then opens a pre-filled GitHub issue proposing the most asinine but plausible feature for that repo, written by a very earnest product manager.

Built for Stupid Ideas Hackathon Ottawa. No build step: edit a file, reload the extension.

## Teammates: start here

You need Google Chrome. Steps 1 to 4 take about five minutes, and you only do them once.

### 1. Get the code

Either download it: on the GitHub page for this repo, click the green **Code** button, then **Download ZIP**, and unzip it somewhere you'll find again. Or clone it:

```bash
git clone https://github.com/Steeveyboy/feature-creep.git
```

### 2. Load it into Chrome

1. Type `chrome://extensions` into the address bar and press Enter.
2. Turn on **Developer mode** (switch in the top-right corner).
3. Click **Load unpacked** and choose the `feature-creep` folder. Pick the folder that contains `manifest.json`, not a folder inside it.
4. A **feature-creep** card appears. Click the puzzle-piece icon in Chrome's toolbar and pin feature-creep so its icon is always visible.

### 3. Add the API key

1. Click the feature-creep icon in the toolbar. A settings page opens.
2. Paste the Anthropic API key into the first box (ask the team for it if you don't have one; it starts with `sk-ant-`).
3. Optional: paste a GitHub token into the second box. Without one, GitHub allows about 30 clicks an hour from your network.
4. Click **Save**.

The key stays in your own browser. Never paste it into a file in this repo or into chat.

### 4. Check it works

1. Open <https://github.com/EnterpriseQualityCoding/FizzBuzzEnterpriseEdition>.
2. Find Carolyn's illustrated **Suggest Feature** button in the bottom-right corner.
3. Click it to open three overlapping approval pop-ups. Approve the approval process, agree with yourself, and choose **Open issue draft**. The aardvark sips coffee at its desk while the status jokes cycle for about four to five seconds.
4. A new tab opens with a GitHub issue already filled in. Read it, laugh, then **close the tab without clicking Create**.

If a dark note pops up saying "used a canned idea", the live AI call failed and you got a backup idea. The note says why (usually a missing or mistyped key). Fix it in the settings page and try again.

### Whenever someone changes the code

Get the latest files (download again, or `git pull`), then on `chrome://extensions` click the circular reload arrow on the feature-creep card, then refresh the GitHub tab.

## Demo day

### The two demo repos

| Repo | Why it lands |
| --- | --- |
| [EnterpriseQualityCoding/FizzBuzzEnterpriseEdition](https://github.com/EnterpriseQualityCoding/FizzBuzzEnterpriseEdition) | FizzBuzz written as a parody of enterprise Java. A product manager asking for even more process is the joke. |
| [auchenberg/volkswagen](https://github.com/auchenberg/volkswagen) | Makes failing tests pass whenever it detects a CI server. Its README is full of claims to riff on. |

Both have GitHub Issues turned on and no issue templates, so the pre-filled issue shows up as is.

### The 60-second script

1. Have both repos open in tabs before you start, with the extension loaded and the key saved.
2. On FizzBuzzEnterpriseEdition: say what the repo is in one sentence, then click **✨ Suggest Feature**.
3. Work through the three pop-ups. Read "Your only stakeholder is you" aloud, then give the audience a moment to read the spinner.
4. When the issue tab opens, read the title out loud, then the user story. Scroll to show the story points and acceptance criteria.
5. Switch to the volkswagen tab and do it again.
6. **Close the issue tabs without clicking Create.** These are real people's projects.

### The night before

- [ ] Lock in the best ideas so the demo doesn't depend on the AI or the venue wifi. Run this a few times with your key set (see the next section for setup) until you like what it prints, then reload the extension:

  ```bash
  node scripts/try.mjs EnterpriseQualityCoding/FizzBuzzEnterpriseEdition auchenberg/volkswagen --save
  ```

  After that, those two repos open the saved issue instantly, with no AI call and no key needed.
- [ ] Do a full run-through on the laptop you'll present from, signed in to GitHub, on the venue's wifi if you can.
- [ ] Zoom the browser to 125% or more so the issue text is readable from the back of the room.

### If something goes wrong on stage

- **Nothing happens when you click**: refresh the page and click again.
- **The "canned idea" note appears**: the backup idea still opens. Keep going.
- **The page says you have to sign in**: sign in to GitHub. The pre-filled issue only shows up when you're logged in.

## Making it funnier

You don't need to code. Three files at the top of the repo control the comedy:

| File | What it is | Change it when |
| --- | --- | --- |
| `prompt.md` | The instructions the AI gets | The ideas aren't funny, specific or pointless enough |
| `config.js` | Settings: spinner messages, button label, issue labels, length limits, which AI model | You want new spinner jokes or longer/shorter issues |
| `demo-cache.json` | Ready-made issues for specific repos | You want a guaranteed-good result for the repos in the demo |

### Pop-ups and mascot

Carolyn's hand-drawn **Suggest Feature** sign is the button. It starts a stack of three fake approvals with the aardvark in each window. **Esc** or **×** cancels the stack. The last approval starts the loading screen, where the aardvark sips coffee beside its laptop until the prefilled GitHub form opens.

The original drawings are `extension/aardvark_button1.png` and `extension/aardvark_button2.png`. The loading animation uses the two desk poses in `extension/aardvark-desk.png`, adapted from Carolyn's drawing. Reduced-motion mode keeps the scene still.

The approval mockups load `sprint.png`, `conference.png`, and `stamp.png` from `extension/popup-art/`. Replace those transparent PNGs with the team's final illustrations to keep the existing copy and controls. Replace `frame.png` in the same folder with a transparent rectangular border to update the outside frame.

For a manual check, use the cached suggestion on [this repo](https://github.com/Steeveyboy/feature-creep). Cancel once and verify the button is ready again. Then complete all three approvals and verify that exactly one prefilled issue form opens. Close the form to leave it unpublished.

### Test a prompt change without touching Chrome

You need [Node.js](https://nodejs.org) 18 or newer. In a terminal, in this folder:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

```bash
node scripts/try.mjs react/react sindresorhus/got
```

That prints the issue the button would create for each repo. Edit `prompt.md`, save, run it again, repeat.

To see exactly what the AI is being told (free, no key needed):

```bash
node scripts/try.mjs react/react --dry-run
```

If GitHub says you're rate limited, also set `export GITHUB_TOKEN=...`.

### Refresh the demo cache

When a run makes you laugh, lock it in:

```bash
node scripts/try.mjs react/react --save
```

That writes the result into `demo-cache.json` under `"react/react"`. From then on the button uses that exact issue for that repo, instantly, with no AI call. Don't like what got saved? Run it again, or edit the text in `demo-cache.json` by hand.

The cache is also the safety net: if the wifi dies or the AI returns garbage twice, the button opens a random cached issue rather than an error. Both behaviours can be switched off in `config.js` (`cacheEnabled`, `fallbackToCacheOnError`).

Then reload the extension so Chrome picks up the new files.

### Tips

- Cache keys must match the address bar. GitHub redirects renamed repos (`facebook/react` is now `react/react`), so use the name you land on.
- The placeholders in `prompt.md` (`{{repo_name}}`, `{{readme}}`, `{{file_tree}}`, `{{languages}}`) are explained at the top of that file. Keep them, and keep the six JSON field names.
- The two entries currently in `demo-cache.json` were written by hand as placeholders. Replace them with real `--save` output for your demo repos.
- Issue labels only apply if they already exist in the target repo and you're allowed to set them.

## How it fits together

```
prompt.md, config.js, demo-cache.json   <- the parts you tune
src/core.js                             <- all the logic, shared by both of:
  extension/background.js               <- service worker: network calls, opens the issue tab
  scripts/try.mjs                       <- command-line version for tuning
extension/content.js, content.css       <- the button, pop-ups, mascot prompt and spinner on github.com
extension/options.html, options.js      <- the keys page
manifest.json                           <- Chrome extension manifest (MV3)
```

After the final approval, use a cached suggestion if one is available. Otherwise fetch the README (main, then master), file tree and languages, fill `prompt.md`, call the Anthropic Messages API, and validate the JSON (one retry). Live requests share a five-second deadline. On failure or timeout, the extension uses the existing saved fallback when available, then opens the prefilled GitHub issue form.

## Troubleshooting

- **404 after clicking, or a toast about issues being turned off**: that repo has GitHub Issues disabled (for example `torvalds/linux`). Pick another repo.
- **A template chooser instead of the pre-filled issue**: some big repos force issue templates and drop the pre-filled text. Demo on repos with plain issues (your own is safest).
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
- [x] Button placement checked against live github.com, signed out (selector: `ACTIONS_SELECTOR` in `extension/content.js`)
- [ ] Same check signed in, in real Chrome

Next:

- [ ] Save cache entries for the demo repos (FizzBuzzEnterpriseEdition, volkswagen) with `--save`; replace the hand-written placeholder entries
- [ ] Tune `prompt.md` against 5 to 10 varied repos
- [ ] Optional: extension icon; try `README.rst` / lowercase `readme.md` when `README.md` is missing
