---
name: paper-agent-cli
description: Instructions for working on the paper-agent-cli repo, which analyzes PDFs with OpenCode-configured models and stores local paper summaries.
---

# paper-agent-cli

Use this skill when editing, debugging, publishing, or documenting the `paper-agent-cli` repository.

## When to use

- When working on PDF analysis commands, thread storage, comparison output, benchmark search, figure analysis, or code generation in this repo.
- When updating the package for npm publishing or repository instructions for OpenCode.
- When you need to keep the CLI aligned with the configured OpenCode model and tools.

## Instructions

1. Use OpenCode for all model calls; do not reintroduce Anthropic or Claude-specific APIs, prompts, or keys.
2. Preserve the existing CLI behavior and keep edits minimal and focused on the repo's current design.
3. Keep PDF analysis, compare, benchmark, figures, and code commands aligned with the configured OpenCode model and tools.
4. Update documentation when command usage or setup steps change.
5. Run `npm run build` after code edits before considering the change complete.
