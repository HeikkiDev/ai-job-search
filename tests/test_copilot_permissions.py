import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools"))

import copilot_permissions  # noqa: E402


SCRIPT = REPO_ROOT / "tools" / "copilot_permissions.py"


def run_script(*args, settings=None):
    argv = [sys.executable, str(SCRIPT), *args]
    if settings is not None:
        argv += ["--settings", str(settings)]
    return subprocess.run(argv, capture_output=True, text=True)


class TranslateTests(unittest.TestCase):
    def test_single_token_command_is_not_widened(self):
        rule, note = copilot_permissions.translate("Bash(pdftotext:*)")

        self.assertEqual(rule, "shell(pdftotext:*)")
        self.assertIsNone(note)

    def test_multi_token_command_widens_to_command_name(self):
        rule, note = copilot_permissions.translate("Bash(python3 salary_lookup.py:*)")

        self.assertEqual(rule, "shell(python3:*)")
        self.assertIsNotNone(note)
        self.assertIn("command name only", note)

    def test_skill_permissions_produce_no_flag(self):
        rule, note = copilot_permissions.translate("Skill(job-application-assistant)")

        self.assertIsNone(rule)
        self.assertIsNone(note)

    def test_unknown_kind_is_an_error(self):
        with self.assertRaises(copilot_permissions.TranslationError):
            copilot_permissions.translate("WebFetch(domain:example.com)")

    def test_unparseable_entry_is_an_error(self):
        with self.assertRaises(copilot_permissions.TranslationError):
            copilot_permissions.translate("Bash")


class CollectTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.settings = self.dir / "settings.json"

    def write(self, data):
        self.settings.write_text(json.dumps(data), encoding="utf-8")

    def test_duplicate_rules_are_collapsed(self):
        self.write(
            {
                "permissions": {
                    "allow": [
                        "Bash(python3 salary_lookup.py:*)",
                        "Bash(python3 other.py:*)",
                    ]
                }
            }
        )

        rules, notes = copilot_permissions.collect(self.settings)

        self.assertEqual(rules, ["shell(python3:*)"])
        self.assertEqual(len(notes), 2)

    def test_missing_permissions_fails_cleanly(self):
        self.write({})

        result = run_script(settings=self.settings)

        self.assertEqual(result.returncode, 1)
        self.assertIn("expected a permissions object", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_absent_allow_is_an_empty_allowlist(self):
        # lint_skills.py and security_guards.py both treat a missing `allow`
        # as empty; diverging here would break the documented eval snippet.
        self.write({"permissions": {}})

        result = run_script("--flags", settings=self.settings)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "")

    def test_non_list_allow_fails_cleanly(self):
        self.write({"permissions": {"allow": "Bash(bun run:*)"}})

        result = run_script(settings=self.settings)

        self.assertEqual(result.returncode, 1)
        self.assertIn("expected permissions.allow to be a list", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_unbalanced_quote_fails_cleanly(self):
        self.write({"permissions": {"allow": ['Bash(grep "foo:*)']}})

        result = run_script(settings=self.settings)

        self.assertEqual(result.returncode, 1)
        self.assertIn("cannot tokenize", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_invalid_json_fails_cleanly(self):
        self.settings.write_text("{not json", encoding="utf-8")

        result = run_script(settings=self.settings)

        self.assertEqual(result.returncode, 1)
        self.assertIn("not valid JSON", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


class ShippedSettingsTests(unittest.TestCase):
    """The flags must cover every executable the shipped workflows rely on."""

    def test_flags_output_is_a_single_shell_ready_line(self):
        result = run_script("--flags", "--quiet")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        line = result.stdout.strip()
        self.assertEqual(len(line.splitlines()), 1)
        for expected in (
            "--allow-tool 'shell(bun:*)'",
            "--allow-tool 'shell(python3:*)'",
            "--allow-tool 'shell(pdftotext:*)'",
        ):
            self.assertIn(expected, line)

    def test_default_output_is_a_runnable_copilot_invocation(self):
        result = run_script("--quiet")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.startswith("copilot --allow-tool "))

    def test_widening_is_reported_unless_quiet(self):
        result = run_script()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("were widened", result.stderr)


if __name__ == "__main__":
    unittest.main()
