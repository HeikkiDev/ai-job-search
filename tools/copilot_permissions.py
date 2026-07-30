#!/usr/bin/env python3
"""Translate .claude/settings.json permissions into GitHub Copilot CLI flags.

Run from anywhere:
    python tools/copilot_permissions.py            # show the launch command
    python tools/copilot_permissions.py --flags    # flags only, for eval/$(...)

Why this exists
---------------
Copilot CLI does not read `.claude/settings.json`, and (as of CLI v1.0.76) a
`permissions.allow` list in `~/.copilot/settings.json` or
`.github/copilot/settings.json` is not honoured by its permission service
either - the only mechanism that actually pre-approves a tool is the
`--allow-tool` flag at launch. So instead of committing a second, drifting copy
of the allowlist, this script derives the flags from `.claude/settings.json`,
keeping that file the single source of truth for both runtimes (and keeping
`tools/security_guards.py`, which audits it, the single audit point).

Granularity warning
-------------------
Claude Code matches a command *prefix* (`Bash(python3 salary_lookup.py:*)`
approves only that script). Copilot CLI matches the *command name* only:
`shell(python3 salary_lookup.py:*)` never matches, so the entry has to widen to
`shell(python3:*)`, which approves **any** python3 invocation for the session.
Widened entries are reported on stderr so the trade-off is visible rather than
silent. Skip this script and approve interactively if you would rather not
pre-approve at that granularity - the workflows all work either way.

Stdlib only. Exit 0 on success, 1 on failure.
"""

import argparse
import json
import shlex
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETTINGS = ROOT / ".claude" / "settings.json"

# Claude permission kinds that have no Copilot CLI equivalent and need no flag.
# `Skill(...)` is one: Copilot discovers .claude/skills and .agents/skills
# natively and does not gate skill invocation behind a permission prompt.
IGNORED_KINDS = {"Skill"}


class TranslationError(Exception):
    pass


def parse_entry(entry: str) -> tuple[str, str]:
    """Split `Bash(bun run:*)` into ("Bash", "bun run:*")."""
    if not entry.endswith(")") or "(" not in entry:
        raise TranslationError(f"cannot parse permission entry: {entry!r}")
    kind, _, argument = entry[:-1].partition("(")
    return kind, argument


def translate(entry: str) -> tuple[str | None, str | None]:
    """Return (copilot_rule, widening_note) for one Claude permission entry."""
    kind, argument = parse_entry(entry)
    if kind in IGNORED_KINDS:
        return None, None
    if kind != "Bash":
        raise TranslationError(f"no Copilot CLI equivalent for permission kind {kind!r} ({entry})")

    command = argument[:-2] if argument.endswith(":*") else argument
    try:
        tokens = shlex.split(command)
    except ValueError as exc:
        raise TranslationError(f"cannot tokenize permission entry {entry!r}: {exc}") from exc
    if not tokens:
        raise TranslationError(f"permission entry has no command: {entry!r}")

    rule = f"shell({tokens[0]}:*)"
    note = None
    if len(tokens) > 1:
        note = (
            f"{entry} -> {rule}: Copilot CLI matches the command name only, so this "
            f"approves every `{tokens[0]}` invocation, not just `{command}`"
        )
    return rule, note


def collect(settings_path: Path) -> tuple[list[str], list[str]]:
    try:
        data = json.loads(settings_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise TranslationError(f"cannot read {settings_path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise TranslationError(f"{settings_path} is not valid JSON: {exc}") from exc

    permissions = data.get("permissions")
    if not isinstance(permissions, dict):
        raise TranslationError(f"{settings_path}: expected a permissions object")
    allow = permissions.get("allow", [])
    if not isinstance(allow, list):
        raise TranslationError(f"{settings_path}: expected permissions.allow to be a list")

    rules: list[str] = []
    notes: list[str] = []
    for entry in allow:
        if not isinstance(entry, str):
            raise TranslationError(f"permission entry is not a string: {entry!r}")
        rule, note = translate(entry)
        if rule and rule not in rules:
            rules.append(rule)
        if note:
            notes.append(note)
    return rules, notes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--flags",
        action="store_true",
        help="print only the --allow-tool flags (suitable for command substitution)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="suppress the granularity warnings on stderr",
    )
    parser.add_argument(
        "--settings",
        type=Path,
        default=SETTINGS,
        help="path to the Claude settings file (default: .claude/settings.json)",
    )
    args = parser.parse_args(argv)

    try:
        rules, notes = collect(args.settings)
    except TranslationError as exc:
        print(f"copilot_permissions: {exc}", file=sys.stderr)
        return 1

    if notes and not args.quiet:
        print(
            "copilot_permissions: Copilot CLI permission rules are coarser than "
            "Claude Code's; the following entries were widened:",
            file=sys.stderr,
        )
        for note in notes:
            print(f"  - {note}", file=sys.stderr)

    flags = " ".join(f"--allow-tool {shlex.quote(rule)}" for rule in rules)
    print(flags if args.flags else f"copilot {flags}".rstrip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
