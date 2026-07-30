---
framework_version: 1.0.0
---

# Agent Guidelines: AI Job Search

This workspace is structured to manage job search activities, scraper tools, CVs, cover letters, and interview preparation.

## Thin-Pointer Design (Single Source of Truth)

To prevent duplication and configuration drift across different AI agent frameworks (Claude Code, Google Antigravity, Codex, Cursor, Gemini CLI, etc.), this workspace uses a unified thin-pointer design. All agent runtimes should load the canonical specifications and candidate profiles from the files and directories below:

1. **Personal Candidate Profile:**
   - The candidate profile, contact details, education, and target preferences are defined in [CLAUDE.md](CLAUDE.md) and the individual profile methodology files under [.claude/skills/job-application-assistant/](.claude/skills/job-application-assistant/) (specifically `01-*.md` etc.).
2. **Canonical Workflow Specifications:**
   - The step-by-step instructions and triggers for tasks (setup, scrape, rank, apply, upskill, interview) are defined in the [.claude/](.claude/) directory (specifically under `.claude/skills/` and `.claude/commands/`).
   - Do not duplicate these rules or specifications. Treat `.claude/` files as the single source of truth.
3. **Portal Search Skills:**
   - Job-portal search CLIs live under [.agents/skills/](.agents/skills/) in the portable Agent Skills format (with a `SKILL.md` per portal). Codex, Antigravity and GitHub Copilot CLI discover these automatically; the `/scrape` workflow in [.claude/skills/job-scraper/](.claude/skills/job-scraper/) orchestrates them.

## Runtime Portability Constraints

These rules keep the workspace loadable by every supported runtime. Treat them as hard requirements when editing skills or commands:

- **Skill `description` must stay under 1024 characters.** GitHub Copilot CLI rejects longer descriptions and the skill then silently fails to load. Run `python3 tools/lint_skills.py` after editing any `SKILL.md`; `copilot skill list` reports load failures directly.
- **Never hard-code MCP tool-name prefixes.** Tool namespaces differ per runtime (`mcp__notion__*` in Claude Code, `notion-*` in Copilot CLI). Detect MCP capability from the session's own tool list and degrade gracefully when it is absent.
- **Permissions live in [.claude/settings.json](.claude/settings.json) only.** It is the single source of truth and applies to Claude Code; other runtimes rely on interactive approval (or their own blanket flag, e.g. `copilot --allow-all-tools`). Do not add a second, parallel allowlist.
