---
name: getting-started
description: Use when a new contributor has just cloned this repo and needs to get the Next.js + Convex feature-heatmap app running locally. Covers macOS and Windows from a clean machine. Invoke when the user says "set up", "get started", "first run", "I just cloned this", or asks why nothing works after cloning.
---

# Getting started — feature-heatmap

This repo contains a Next.js 16 + Convex app under `web/`. Three things must be true for it to run:

1. Node.js 20+ is installed
2. Dependencies are installed under `web/node_modules`
3. A local Convex backend is running on `:3210`

Then `npm run dev` in `web/` serves the app on `:3000`.

Below are step-by-step instructions, written so they work whether you're on **macOS** or **Windows**, and whether you have nothing installed or already have most of it.

---

## Step 1 — Install Node.js 20 or newer

Check what you have:

```sh
node --version
```

If the version is `v20.x` or higher, skip to step 2.

### macOS

The recommended route is `nvm` (lets you switch versions per-project):

```sh
# install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# restart your terminal, then
nvm install 22
nvm use 22
```

Alternatively, with Homebrew:

```sh
brew install node@22
```

If you don't have Homebrew, install it from <https://brew.sh>.

### Windows

Use **nvm-windows** (separate project from Unix nvm):

1. Download the latest installer from <https://github.com/coreybutler/nvm-windows/releases> (`nvm-setup.exe`)
2. Run it, accept defaults, restart your terminal
3. In **PowerShell** (not Git Bash):

   ```powershell
   nvm install 22
   nvm use 22
   ```

If you'd rather not use nvm, download Node.js 22 LTS directly from <https://nodejs.org/>.

Verify both `node` and `npm` work:

```sh
node --version
npm --version
```

---

## Step 2 — Install Git (skip if you already cloned the repo)

If you got the source as a zip, you'll still want git for committing.

- **macOS**: `git --version` will prompt you to install Apple's developer tools. Or `brew install git`.
- **Windows**: install **Git for Windows** from <https://git-scm.com/download/win>. This also gives you Git Bash, which you can use as a shell if you prefer Unix-style commands.

---

## Step 3 — Install dependencies

From the repo root:

```sh
cd web
npm install
```

This installs Next.js, React, Tailwind, shadcn/ui, dnd-kit, Convex, etc. into `web/node_modules`. Takes a minute or two.

> **Windows note:** if `npm install` complains about scripts being blocked, run **PowerShell as Administrator** once and execute:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

---

## Step 4 — Start the Convex backend

Convex is the database layer. It runs locally on `http://127.0.0.1:3210`. Open a terminal and from `web/`:

```sh
npx convex dev
```

**On first run only**, Convex will prompt:

> Welcome to Convex! Would you like to login to your account? Start without an account (run Convex locally)

Type `Yes` (or just press Enter) to run **without** an account — that's what this project is set up for. Convex will:

- download the local backend binary
- spin it up on `:3210`
- write `web/.env.local` with `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210`
- generate `web/convex/_generated/` (TypeScript types + API for the React hooks)
- push the schema and watch for changes

**Leave this terminal running.** It's a long-lived process. If you close it, the database stops and the app will hang on "Loading…".

You should see:

```
✔ Convex functions ready! (~200ms)
```

---

## Step 5 — Start the Next.js dev server

In a **second terminal**, from `web/`:

```sh
npm run dev
```

Open <http://localhost:3000> in your browser.

You should see the **Projects** page with an empty state. Click **+ New project**, give it a name, and you'll land on a fully seeded heatmap with all five phases (Qualification → Underwriting → Decisioning → Fulfilment → Post-Fulfilment).

---

## You should now have

- **Terminal 1:** `npx convex dev` — long-lived, leave running
- **Terminal 2:** `npm run dev` — long-lived, leave running
- **Browser:** <http://localhost:3000>

That's it. Editing files under `web/src/` triggers Next.js fast refresh; editing files under `web/convex/` triggers a Convex push.

---

## What if something's wrong?

### "Cannot find module 'convex/_generated/api'"

`npx convex dev` hasn't run yet (or hasn't finished its first push). Start it. The `_generated/` folder appears once Convex provisions the deployment.

### Pages stuck on "Loading heatmap…" or "Loading…"

Convex is no longer running. Look at terminal 1 — has `npx convex dev` died, or did you close that terminal? Restart it from `web/`.

### Port already in use

- `:3000` (Next.js) — set a different port: `npm run dev -- -p 3001`
- `:3210` (Convex) — find and kill the stale process. macOS/Linux: `lsof -nP -i :3210`. Windows: `Get-NetTCPConnection -LocalPort 3210` in PowerShell.

### "node: command not found"

Step 1 didn't complete. After installing Node, you usually need to **open a new terminal** so it picks up `node` on `PATH`.

### EBADENGINE warnings during `npm install`

Safe to ignore. They're warnings, not errors. The app builds and runs.

### Windows: `npm install` fails with permissions errors

Make sure you're running it from a normal user terminal (not via WSL into a Windows-mounted folder, and not from inside `Program Files`). Cloning into `C:\Users\<you>\Projects\feature-heatmap` works reliably.

### I want a fresh database

```sh
# from web/
rm -rf .convex   # macOS/Linux
# Windows PowerShell:
Remove-Item -Recurse -Force .convex
```

Then restart `npx convex dev`. This wipes local Convex state.

---

## Repo layout

```
.                                       (you are here)
├── web/                                Next.js + Convex app — work happens here
│   ├── convex/                         backend functions + schema
│   ├── src/app/                        routes
│   ├── src/components/                 UI components
│   └── package.json
├── Heatmap/                            legacy static prototype — DO NOT EDIT
├── Covenants/                          legacy static prototype — DO NOT EDIT
├── smart-checklist-builder/            legacy static prototype — DO NOT EDIT
├── ClaudeReferenceMaterial/            design screenshots (source of truth)
└── CLAUDE.md                           architecture overview — read this next
```

The legacy folders are kept as the visual / behavioural spec for the live `web/` app. You can open them directly in a browser (`open Heatmap/index.html` on macOS) — they need no setup since they're plain HTML/CSS/JS.

---

## Suggested next read

`CLAUDE.md` at the repo root has the architecture overview: how phases / subphases / cards relate, how the configurator registry routes click handlers, and the conventions specific to this project (shadcn-on-base-ui composition, Convex cascade deletes, palette tokens).
