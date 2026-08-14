# Cursor Shared Memory — Developer Runbook

## What is this?

Every repo uses **mnem** as shared Cursor memory.

| Layer | Shares |
|---|---|
| Git | code |
| mnem | what we know about the code |

mnem stores project knowledge as a searchable graph inside:

```text
.mnem/
```

It remembers:

- User stories / business rules
- Architecture
- Decisions + why
- Bugs + root causes
- API quirks
- Important discoveries
- Relevant relationships between code/services

Cursor retrieves only relevant graph context instead of repeatedly loading old chats/files, reducing unnecessary context/token usage.

Official CLI: [Uranid/mnem](https://github.com/Uranid/mnem). This runbook is the **company** workflow, including cases the happy-path docs skip.

---

## Mental model

| Thing | Meaning |
|---|---|
| Cursor chat | current task |
| Code | what exists |
| Git | what changed |
| mnem | what the team has learned |

There are **two** version-control systems in play:

1. **Git** versions the `.mnem/` directory (binary `repo.redb` + `config.toml`).
2. **mnem** versions the knowledge graph *inside* that store (its own commits, branches, merge).

Treat `.mnem/` like a committed artifact (similar to a generated lockfile that *must* be shared), not like `node_modules`.

## Golden rule

Developers should not have to remember to use the memory system.

The repository should configure the agent so that:

```text
clone repo
→ open Cursor
→ work normally
→ memory retrieved automatically
→ important knowledge stored
→ commit
→ next developer inherits it
```

---

## A. One-time setup on your laptop

Do this once per developer.

### 1. Install Rust (only if you will compile from source)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart Terminal. Confirm a **new enough** toolchain:

```bash
rustc --version   # mnem-cli 0.1.x needs recent stable (MSRV is listed on the GitHub README; 1.83 is too old)
```

If `rustup` is already installed but stuck on an old pin (common on CI images and cloud VMs):

```bash
rustup update stable
rustup default stable
```

### 2. Install mnem

**Preferred on a laptop** (Linux needs a C++ toolchain for source builds):

```bash
# Debian/Ubuntu/WSL
sudo apt-get install -y g++ libstdc++-dev

cargo install --locked mnem-cli --features bundled-embedder
```

`--features bundled-embedder` is **Cargo-only** and required. Without it, `mnem retrieve` fails with `embedder not configured`.

**Faster alternative** if a prebuilt binary exists for your OS:

```bash
cargo install cargo-binstall
cargo binstall mnem-cli
```

**Do not assume pip/npm just works.** `pip install mnem-cli` / `npm i -g mnem-cli` (v0.1.7) is a tiny downloader stub. First run tries to fetch `mnem-<triple>.tar.gz` from GitHub Releases. If that asset is missing (Linux/macOS have been unpublished), you get `HTTP 404`. Then compile with Cargo instead.

macOS pip/npm v0.1.7 is documented upstream as broken (runtime downloader). Use Cargo until wheels ship.

### 3. Check installation

```bash
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"   # if `mnem: command not found`
mnem --version
mnem doctor
```

`mnem doctor` prints a green/yellow/red checklist (binary, `.mnem/` store, embedder, host integrations).

### 4. Connect mnem to Cursor (laptops only)

This repo already commits `.cursor/mcp.json`, which starts `bash .cursor/bin/mnem-mcp`. That wrapper finds `mnem` on PATH (including `~/.cargo/bin` and `/usr/local/cargo/bin`) and points `--repo` at the git root. You still need the `mnem` binary installed on the machine that runs Cursor (step 2).

**Tried 14 Aug 2026 (mnem 0.1.7):** `mnem integrate cursor` *does* run in a Cloud Agent VM. It is not a no-op. It writes files. Restarting Cursor / the cloud session still does **not** add `mnem_*` tools to a Cloud Agent’s MCP catalog — that catalog is separate. Laptop Cursor is the host that actually loads `~/.cursor/mcp.json`.

Restarting Cursor does **nothing** until:

1. `mnem` is installed on **this laptop** (a Cloud Agent install does not count)
2. This branch/PR is checked out so `.cursor/mcp.json` and `.mnem/` exist
3. Cursor is fully quit and reopened as an **application**
4. You enable the **mnem** MCP server if Cursor shows a prompt

Then, on the laptop, from the repo root:

```bash
cd /path/to/this-repo
mnem integrate cursor --target-repo "$(pwd)"
mnem integrate --check
mnem doctor
```

Use **`"$(pwd)"` (absolute)**, not `.`

| Command | What MCP actually points at |
|---|---|
| `mnem integrate cursor` (no `--target-repo`) | `~/.mnemglobal/.mnem` — personal, **not** this repo |
| `mnem integrate cursor --target-repo .` | literal `"."` in `mcp.json`. Breaks if the MCP process cwd is not the repo (`error: no mnem repository at ./.mnem`). Confirmed from `/tmp`. |
| `mnem integrate cursor --target-repo "$(pwd)"` | absolute clone path. This is the one that works. |

What that command writes (v0.1.7):

- `~/.cursor/mcp.json` — `command` is the **absolute** mnem binary (e.g. `/usr/local/cargo/bin/mnem`), plus `--repo <path>`
- `~/.cursor/rules/mnem.mdc` — user-level `alwaysApply` prompt (mnem-managed). This is **in addition to** the repo rule `.cursor/rules/mnem.mdc`
- `~/.mnemglobal/integrations.toml` — bookkeeping
- **No Cursor hooks.** `integrations.toml` components are `mcp` + `system_prompt` only. The generated rule says *“This host has no automatic pre-prompt hook.”*

`mnem doctor` may print `fix: mnem integrate cursor --with-system-prompt`. **That flag does not exist.** System prompt is on by default; `--no-system-prompt` is the opt-out.

Fully quit Cursor **as an application** (not just the terminal) and reopen it.

**Cloud Agents:** after integrate, `mnem integrate --check` shows `ok Cursor wired` and `mnem doctor` shows `ok cursor` + `ok system-prompt`. The running Cloud Agent still has **zero** `mnem_*` MCP tools. Use the CLI (`mnem retrieve` / `mnem add`) there. Do not treat “wired” as “this chat can call mnem_retrieve”.

---

## B. When you clone an existing company repo

```bash
git clone <repo>
cd <repo>
git pull
```

Check:

```bash
ls -a
```

You should see:

```text
.mnem/
.cursor/
```

If `.mnem/` already exists:

**DO NOT run `mnem init` again.**

Open Cursor from this repo/project.

mnem searches **upward** from the current working directory for `.mnem/`, so Cursor needs to be working inside the correct repository.

Work normally.

---

## C. When creating a brand-new repo

After creating/cloning the repo:

```bash
cd my-new-repo
mnem init
```

Optional initial knowledge:

```bash
mnem ingest README.md
# or
mnem ingest docs/ --recursive
```

Then add the Cursor rule below.

Commit everything:

```bash
git add .mnem .cursor .gitattributes
git commit -m "Initialize shared agent memory"
git push
```

Now everyone who clones the repo receives the same memory baseline.

---

## D. If you clone a repo that does not have mnem

Check:

```bash
ls -a
```

If there is no `.mnem/`:

```bash
mnem init
```

Then:

```bash
git add .mnem
git commit -m "Initialize mnem memory"
git push
```

**Only the first developer should initialise it.** Everyone else pulls that version.

If two people init on parallel branches, you get two unrelated graphs and a binary Git conflict. See [K. Unusual cases](#k-unusual-cases-you-will-not-hit-on-a-happy-path-clone).

---

## E. Required Cursor rule

Every repo MUST contain:

```text
.cursor/rules/mnem.mdc
```

Create it if missing. Keep it short (`alwaysApply: true` is injected every turn). Point at this runbook for edge cases.

```markdown
---
description: Shared project memory rules
alwaysApply: true
---
# Shared Project Memory
Use mnem as the project's persistent shared engineering memory.
Before substantial work:
- Retrieve relevant mnem context automatically.
- Check existing decisions, business rules, bugs, constraints and architecture before making assumptions.
During work:
- Store important durable discoveries in mnem.
- Store architecture decisions and WHY they were made.
- Store user stories/business rules that affect implementation.
- Store important API quirks, bug root causes and rejected approaches worth remembering.
- Link knowledge to relevant files/services/entities where useful.
Do NOT store:
- terminal logs
- whole conversations
- temporary debugging
- routine code changes
- large tool outputs
- transient errors
- secrets, tokens, passwords, API keys, cookies, `.env` contents
Store the conclusion, not the journey.
After substantial work:
- Persist important new knowledge into mnem before finishing.
Treat `.mnem/` changes as part of the codebase and include relevant changes in the normal Git/PR workflow.
```

Commit this file.

```bash
git add .cursor/rules/mnem.mdc
git commit -m "Add shared memory Cursor rule"
git push
```

Developers do NOT manually create this every time. It is committed to the repo.

```text
git clone
   ↓
.cursor/rules/mnem.mdc arrives automatically
   ↓
Cursor reads the rule
```

Also commit `.gitattributes` so Git never treats `repo.redb` as text:

```gitattributes
.mnem/*.redb binary
.mnem/repo.redb binary
```

---

## F. Existing Cursor chats

Keep existing chats.

For each important old chat, do this once:

> Review this conversation and store the durable project knowledge in mnem: user stories, decisions, architecture, bugs/root causes, API quirks, constraints and important implementation discoveries. Ignore temporary debugging and conversational noise. Strip secrets before storing.

Then commit the resulting `.mnem/` changes.

Cloud Agent transcripts are **not** automatically in mnem. If a long agent run discovered durable facts, ingest the conclusions (not the tool logs).

---

## G. Normal daily workflow

Every day:

```bash
git pull
```

Then use Cursor normally.

You should NOT need to repeatedly say “check mnem” or “remember this”. The Cursor rule tells the agent to do that automatically.

When finished:

```bash
git add .
git commit
git push
```

Relevant `.mnem/` changes travel with the PR.

If the agent has no mnem MCP tools (Cloud Agent, broken integration), it should still shell out:

```bash
mnem retrieve "your question"
mnem add node --label Decision -s "We chose X because Y"
```

---

## H. How another dev gets your memory

```text
DEV A discovers important behaviour
        ↓
Cursor stores it in .mnem
        ↓
commit / PR
        ↓
merge
        ↓
DEV B git pull
        ↓
receives code + .mnem
        ↓
opens Cursor
        ↓
Cursor retrieves Dev A's knowledge
```

mnem is **Git-synchronised, not live-synchronised**.

Another developer sees new knowledge only after it is committed, merged, and pulled. Knowledge that exists only on a feature branch is invisible on `main`.

---

## I. New repo checklist

1. `cd repo`
2. `mnem init`
3. add `.cursor/rules/mnem.mdc`
4. add `.gitattributes` binary rules for `.mnem/*.redb`
5. optionally ingest README/docs (never `.env`)
6. `mnem doctor`
7. `git add .mnem .cursor .gitattributes`
8. commit
9. push

That’s the entire bootstrap process.

---

## J. Cloned repo checklist

1. `git clone`
2. `cd repo`
3. confirm `.mnem/` exists (and is not empty)
4. confirm `.cursor/rules/mnem.mdc` exists
5. `mnem doctor` (optional but useful)
6. open repo in Cursor
7. work normally

If either `.mnem/` or the rule is missing, fix it before substantial work.

---

## K. Unusual cases you will not hit on a happy-path clone

These are the cases that actually break teams. Read this when something feels “off”.

### K1. Repo looks set up but is not

| You see | What it means |
|---|---|
| `.cursor/rules/mnem.mdc` but no `.mnem/` | Rule will nag; retrieval is empty. Run `mnem init` **once**, ingest, commit. |
| `.mnem/` but no rule | Humans/CLI work; Cursor Cloud/agents will not auto-retrieve. Add the rule. |
| Empty `.mnem/` directory | Broken clone or someone committed a placeholder. Restore from git or re-init **only if** git history has no real graph. |
| `.mnem/` in `.gitignore` or ignored by `.*` | Memory never leaves the laptop. Remove the ignore, `git add -f .mnem`, commit. |
| Sparse checkout / partial clone skipped `.mnem/` | `git sparse-checkout disable` or explicitly include `.mnem`. |
| Git LFS pointer instead of `repo.redb` and LFS not installed | `git lfs install && git lfs pull`. We do **not** require LFS for mnem; if someone enabled it, document it. |

### K2. Install / PATH / compile failures

| Symptom | Fix |
|---|---|
| `mnem: command not found` after pip | `export PATH="$HOME/.local/bin:$PATH"` (Linux pip). New terminal after rustup. |
| pip/npm first run `HTTP 404` downloading `mnem-x86_64-unknown-linux-gnu.tar.gz` | GitHub Release has no Linux/macOS archive. Use `cargo install --locked mnem-cli --features bundled-embedder`. |
| `error: package rustc X is older than MSRV` | `rustup update stable && rustup default stable`. |
| `rust-lld: error: unable to find library -lstdc++` | Install `g++` / `libstdc++-dev`. If the `.so` exists under `/usr/lib/gcc/...` but lld still misses it: `export LIBRARY_PATH=/usr/lib/gcc/x86_64-linux-gnu/13` (adjust GCC version). |
| Cargo compile takes 5–15 minutes | Normal for first source install. Reuse `CARGO_BUILD_BUILD_DIR` if a previous attempt almost finished. |
| `embedder not configured` | You installed Cargo **without** `--features bundled-embedder`, or `config.toml` has no `[embed]`. Reinstall with the feature or set provider in `.mnem/config.toml`. |
| First `retrieve` wants to download ~90MB ONNX model | Expected. Cache lives in the user cache dir (e.g. `~/.cache/ort.pyke.io`), **not** in git. Do not commit model blobs. |
| Corporate proxy / no crates.io | Use an allowed mirror, or copy a prebuilt `mnem` binary onto `PATH`. Docker: `ghcr.io/uranid/mnem` is HTTP-server oriented, not a drop-in CLI for Cursor. |

### K3. Wrong graph / nested directories

mnem walks **up** from cwd looking for `.mnem/`.

| Situation | What to do |
|---|---|
| Monorepo, you `mnem init` inside `client/` | Agents in `client/` never see root memory, or you fork the graph. Init **only at the git root**. Delete the nested `.mnem/` if created by mistake. |
| Parent directory (home, company umbrella checkout) already has `.mnem/` | Nested repo may silently use the parent graph. Always init at **this** repo’s git root. Confirm with `mnem doctor` (`repo ok .mnem <path>`). |
| Git worktree / Cloud Agent worktree | Each worktree needs the `.mnem/` files from git. If the worktree was created without them, `git checkout HEAD -- .mnem`. |
| Submodule | Each submodule is its own repo. Init in the submodule you actually work in, not only the superproject. |
| `mnem integrate --target-repo ~/notes` | Pins MCP at a personal graph. Do **not** do this for company repos. Project memory must be the repo `.mnem/`. |

### K4. Local graph vs global graph

| Store | Path | Travels with git? | Use for |
|---|---|---|---|
| Project | `<repo>/.mnem/` | Yes | This product’s decisions, APIs, bugs |
| Global | `~/.mnemglobal/.mnem/` | **No** | Personal preferences across all repos |

Company facts go in the **project** graph. Putting them in global means teammates never see them.

### K5. Git merge vs mnem merge (binary `repo.redb`)

Two developers committing `.mnem/repo.redb` on diverging branches will produce a **Git binary conflict**. Git cannot three-way-merge redb.

Practical rules:

1. Rebase onto `main` often so `.mnem/` conflicts stay small.
2. Do not resolve `repo.redb` with a random “accept ours/theirs” unless you understand you are **dropping** the other side’s memory.
3. mnem’s own merge is for **mnem branches** (`mnem branch` / `mnem merge`), and writes `.mnem/MERGE_CONFLICTS.json`. That is not the same as a Git conflict.
4. If Git conflicts on `.mnem/`:
   - Keep the side that has the richer graph (usually `main` after rebase), then **re-add** the feature-branch conclusions with `mnem add` / `mnem ingest` from the PR description.
   - Or check out both blobs to temp dirs and inspect with `mnem -R /tmp/theirs stats` before choosing.
5. Never commit `.mnem/MERGE_CONFLICTS.json` or `*.lock` files. Abort leftover merges: `mnem merge --abort`.

### K6. Cloud Agents, CI, and “Cursor isn’t installed”

Tried in this Cloud Agent (mnem 0.1.7): `mnem integrate cursor --target-repo "$(pwd)"` **succeeds** and writes `~/.cursor/mcp.json` + `~/.cursor/rules/mnem.mdc`. `mnem doctor` then says `ok cursor`. That is **file wiring**, not tool access.

| Environment | What works | What does not |
|---|---|---|
| Laptop Cursor | User `mcp.json` + project `.cursor/mcp.json` after a full app restart | Relative `--repo .` if MCP cwd ≠ repo |
| Cursor Cloud Agent | CLI (`mnem retrieve` / `mnem add` / `mnem ingest`) + committed `.cursor/rules/mnem.mdc` | `mnem_*` MCP tools. Restarting the agent does not load `~/.cursor/mcp.json` into the cloud tool catalog. |
| CI | Retrieve-only if you install mnem; usually skip | Writing memory from flaky CI |

`mnem doctor` *before* any `mcp.json` exists says `cursor host not installed`. After integrate it says `ok`. Neither message means Cloud Agents gained MCP tools.

If you are an agent in a cloud VM: use the CLI. Do not fail the task because MCP tools are missing.

### K7. What not to ingest (easy to get wrong)

Do **not**:

- `mnem ingest src/ --recursive` for the whole codebase (that is what files are for).
- Ingest `.env`, `.env.example` with secrets filled in, `*.pem`, screenshots of dashboards with PII, chat exports that contain tokens.
- Store passwords, Vercel/GoDaddy/Supabase keys, session cookies, or “the login is user/pass …” facts. Store **where** credentials live (`DASHBOARD_USER` in env / Vercel project env) and **that** a gate exists.
- Store terminal logs, stack traces, or “I tried X then Y”.
- Store one-off agent workspace paths (`/workspace`, `/tmp/cursor/...`).

Do ingest: ADRs, runbooks, measurement specs, “we rejected X because Y”, API quirks, domain/DNS decisions that are public, invariants.

### K8. Re-init, corruption, doctor red

| Situation | Action |
|---|---|
| Tempted to `mnem init` “to be safe” | **Don’t.** Init is once per repo. |
| `mnem doctor` → `no mnem repo in cwd or parents` | You are in the wrong directory, or `.mnem/` was not checked out. |
| `redb` won’t open / file truncated | Restore `.mnem/repo.redb` from git (`git checkout -- .mnem`). Do not init on top. |
| Two inits on two branches, both pushed | Pick one graph as canonical (usually first merge to `main`), close the other PR’s `.mnem/` changes, re-apply facts. |
| Embedder cache missing offline | Retrieval fails until the ONNX model can download once. Bundled-embedder still needs that first cache in some builds — run `mnem doctor` on a networked machine. |

### K9. Forks, public copies, and leaking knowledge

`.mnem/` is **internal memory**. If the repo is ever made public or forked outside the company, review `.mnem/` the same way you review git history for secrets. Tombstone (`mnem tombstone`) hides from retrieval but does not erase git history.

### K10. “The agent didn’t use mnem”

1. Rule missing or `alwaysApply` false.
2. Opened Cursor in a parent/sibling folder (upward search missed or hit the wrong graph).
3. MCP not wired (`mnem integrate --check`) — Cloud Agents will need CLI.
4. Graph empty (`0 item(s)` is OK and means wiring works).
5. Knowledge is on another Git branch and was never merged.
6. You stored it in the **global** graph.

### K11. Large graphs / noisy PRs

- Prefer `mnem add node` for one decision over re-ingesting a 50-page dump.
- Re-ingesting an **unchanged** file is a no-op (content-addressed). Fine.
- If `repo.redb` jumps by tens of MB, you ingested the wrong tree. Tombstone / revert the mnem op, don’t leave it.
- Review `.mnem/` in PRs as “what did we learn?”, not as a line diff (there isn’t one). `mnem log --oneline` / `mnem diff` on the agent machine.

### K12. `mnem integrate` traps (confirmed by running it)

1. **Default target is the global graph.** Omit `--target-repo` and teammates never see your writes.
2. **`--target-repo .` is stored as the string `.`** — not resolved to an absolute path. MCP started from another cwd cannot find `.mnem/`.
3. **Hardcoded binary path** in `~/.cursor/mcp.json` (`/usr/local/cargo/bin/mnem` on this box). Another machine needs its own integrate, or the committed project `.cursor/mcp.json` which uses `command: "mnem"` on PATH.
4. **Two always-on rules.** Integrate writes `~/.cursor/rules/mnem.mdc` (retrieve/commit every turn, including via MCP). The repo also has `.cursor/rules/mnem.mdc` (company: durable facts only, no secrets). Both can apply on a laptop. Prefer company constraints when they conflict (never commit secrets; store conclusions not chat).
5. **`--with-system-prompt` is not a flag.** Ignore that doctor hint.
6. **Unintegrate** leaves `"mcpServers": {}` in `~/.cursor/mcp.json`; it does not delete the file.
7. **No Cursor hook** in 0.1.7. If MCP tools are missing, the generated user rule’s “call mnem_retrieve every turn” will fail; fall back to `mnem retrieve`.

---

## L. This-repo bootstrap (tj-dashboard)

When this playbook was first applied, the repo had **neither** `.mnem/` **nor** `.cursor/rules/mnem.mdc`. Rust 1.83 was present; mnem was not. pip 0.1.7 404’d on the Linux tarball; Cargo needed a newer rustc plus `LIBRARY_PATH` for libstdc++.

`mnem integrate cursor --target-repo "$(pwd)"` was run in the Cloud Agent: it wired `~/.cursor/mcp.json` and `~/.cursor/rules/mnem.mdc`, and `mnem doctor` went green for Cursor. The Cloud Agent still had **no** `mnem_*` MCP tools after that. Those are all K-section cases — not hypothetical.
