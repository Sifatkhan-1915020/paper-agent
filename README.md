# paper-agent-cli

An AI agent that reads a research PDF and pulls out exactly four things:

1. **Field** — what area of research this is
2. **Method** — what approach/technique the authors used
3. **Result** — what they found
4. **Impact** — why it matters

It also supports four extra commands: **compare** papers within a thread, find **benchmark** work for a paper's field, locate and explain the **methodology figure**, and **generate starter code** when a paper's method is implementable.

Built with:
- [`mupdf`](https://www.npmjs.com/package/mupdf) — official Artifex WebAssembly bindings for the MuPDF engine (the same engine behind PyMuPDF), used here for pure-Node PDF text extraction and page rendering. **No Python required.**
- [`@opencode-ai/sdk`](https://www.npmjs.com/package/@opencode-ai/sdk) — used for all model calls so the CLI follows the model configured in OpenCode.
- [`commander`](https://www.npmjs.com/package/commander) — the CLI framework.

## Requirements

- Node.js **20+**
- An OpenCode configuration/model for all LLM-powered commands

## Install & run locally (development)

```bash
git clone https://github.com/<your-username>/paper-agent-cli.git
cd paper-agent-cli
npm install
npm run build
node dist/cli.js analyze path/to/paper.pdf
```

OpenCode reads the active model from its own configuration, so there is no API key setup step for this CLI.

If you want to create a `.env` file in `cmd`, use:

```cmd
copy .env.example .env
```

Or use `npm run dev` to build and run in one step while you're iterating.

## Commands

Every command accepts a global `-t, --thread <name>` option (default: `"default"`). A **thread** is just a research session: papers analyzed under the same thread name are the ones `compare` will compare. State is stored locally in `.paper-agent/<thread>/` inside whatever folder you run the CLI from — so each project folder is naturally its own workspace, and `--thread` lets you keep multiple sessions in one folder.

### Analyze a single paper
```bash
paper-agent analyze paper1.pdf
paper-agent --thread my-lit-review analyze paper2.pdf
```
Prints the field/method/result/impact and saves it to `.paper-agent/<thread>/papers/`.

### Compare every paper in this thread
```bash
paper-agent compare
paper-agent --thread my-lit-review compare
```
Needs at least 2 papers already analyzed in that thread. Prints a Markdown comparison table + key differences, and saves it to `.paper-agent/<thread>/comparison-<timestamp>.md`.

### Find benchmark work for a paper's field
```bash
paper-agent benchmark paper1.pdf
```
Analyzes the paper if it hasn't been already, then uses OpenCode's web-search tool to find the standard benchmarks/datasets/leaderboards for that field.

### Extract & explain the methodology figure
```bash
paper-agent figures paper1.pdf
```
Renders each page (up to 20) to a PNG, shows them to OpenCode's vision model, and asks it to identify and explain the methodology/architecture diagram. Saves the matched page image to `.paper-agent/<thread>/figures/`.

### Generate a starter implementation
```bash
paper-agent code paper1.pdf
```
Asks OpenCode whether the paper's core method needs code at all (a survey or theory paper won't). If it does, generates a runnable starter file and saves it to `.paper-agent/<thread>/implementations/`.

## Publishing so anyone can run it with `npx`

Once this is pushed to GitHub and published to npm (see the guide below), anyone can run it without installing anything permanently:

```bash
npx paper-agent-cli analyze paper.pdf
```

`npx` downloads the package from the npm registry, runs the `paper-agent` binary named in `package.json`'s `bin` field, and cleans up afterward.

## A note on licensing

This project's own code is MIT-licensed (see `LICENSE`). Its PDF engine, `mupdf`, is **AGPL-3.0** — free to use in open-source projects like this one, but if you ever fold this into closed-source or SaaS software, AGPL requires you to release your source too (or buy a commercial license from Artifex). Keeping this repo public and open-source, as planned, keeps you compliant by default.

## Architecture

```
PDF file
  │
  ▼
mupdf.js  ──── text ────────────►  OpenCode model (analyze)  ──►  field / method / result / impact
  │                                       │
  └──── rendered page PNGs ──►  OpenCode vision (figures)  saved to .paper-agent/<thread>/
                                          │
                                 OpenCode + websearch (benchmark)
                                          │
                                 OpenCode (code) ──► starter implementation file
```

All state is local JSON/PNG files under `.paper-agent/` — no database needed for an MVP like this.
