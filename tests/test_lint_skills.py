import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
LINTER_SCRIPT = REPO_ROOT / "tools" / "lint_skills.py"


def run_linter(root: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(root / "tools" / "lint_skills.py")],
        capture_output=True,
        text=True,
    )


class LinterRepoFixture(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)

        tools = self.root / "tools"
        tools.mkdir()
        shutil.copy(LINTER_SCRIPT, tools / "lint_skills.py")
        # The Python-test CI job does not install PyYAML; the separate lint job
        # does. These settings-focused tests only need a valid frontmatter map.
        self.tools = tools
        self.write_yaml_stub("Example skill")

        command = self.root / ".claude" / "commands" / "setup.md"
        command.parent.mkdir(parents=True)
        command.write_text("# /setup - Test setup command\n", encoding="utf-8")

        skill = self.root / ".claude" / "skills" / "example" / "SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text(
            "---\nname: example\ndescription: Example skill\n---\n",
            encoding="utf-8",
        )

        self.settings = self.root / ".claude" / "settings.json"
        self.write_settings({"permissions": {"allow": []}})

    def write_yaml_stub(self, description):
        (self.tools / "yaml.py").write_text(
            "class YAMLError(Exception):\n"
            "    pass\n\n"
            "def safe_load(_text):\n"
            f"    return {{'name': 'example', 'description': {description!r}}}\n",
            encoding="utf-8",
        )

    def write_settings(self, data):
        self.settings.write_text(json.dumps(data), encoding="utf-8")


class DescriptionLengthTests(LinterRepoFixture):
    """GitHub Copilot CLI drops skills whose description exceeds 1024 chars."""

    def test_description_at_limit_passes(self):
        self.write_yaml_stub("x" * 1024)

        result = run_linter(self.root)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_description_over_limit_fails(self):
        self.write_yaml_stub("x" * 1025)

        result = run_linter(self.root)

        self.assertEqual(result.returncode, 1)
        self.assertIn("1025 characters", result.stdout)
        self.assertIn("1024-character limit", result.stdout)
        self.assertNotIn("Traceback", result.stderr)


class ShippedSkillDescriptionTests(unittest.TestCase):
    """Every skill in this repo must stay loadable by Copilot CLI.

    Parsed without PyYAML so this runs in the dependency-free test CI job.
    """

    def test_all_shipped_descriptions_within_limit(self):
        paths = sorted(REPO_ROOT.glob(".claude/skills/*/SKILL.md")) + sorted(
            REPO_ROOT.glob(".agents/skills/*/SKILL.md")
        )
        self.assertTrue(paths, "no SKILL.md files found")

        for path in paths:
            with self.subTest(skill=path.relative_to(REPO_ROOT).as_posix()):
                description = read_folded_description(path)
                self.assertIsNotNone(description, "no description in frontmatter")
                self.assertLessEqual(len(description), 1024)


def read_folded_description(path: Path) -> str | None:
    """Extract `description` from YAML frontmatter without a YAML library.

    Handles the two forms used in this repo: a single-line scalar and a folded
    block scalar (`description: >`), where continuation lines join with spaces.
    """
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    try:
        end = lines.index("---", 1)
    except ValueError:
        return None

    for index in range(1, end):
        stripped = lines[index]
        if not stripped.startswith("description:"):
            continue
        inline = stripped[len("description:"):].strip()
        if inline and inline not in (">", ">-", "|", "|-"):
            return inline
        parts = []
        for continuation in lines[index + 1:end]:
            if continuation.strip() and not continuation.startswith((" ", "\t")):
                break
            parts.append(continuation.strip())
        return " ".join(part for part in parts if part)
    return None


class SettingsShapeTests(LinterRepoFixture):
    def test_valid_settings_pass(self):
        result = run_linter(self.root)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("lint_skills: OK", result.stdout)

    def test_invalid_json_fails_cleanly(self):
        self.settings.write_text("{not json", encoding="utf-8")

        result = run_linter(self.root)

        self.assertEqual(result.returncode, 1)
        self.assertIn(".claude/settings.json", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_non_object_root_fails_cleanly(self):
        for data in ([], "settings", 1, None):
            with self.subTest(data=data):
                self.write_settings(data)

                result = run_linter(self.root)

                self.assertEqual(result.returncode, 1)
                self.assertIn("top-level JSON value to be an object", result.stdout)
                self.assertNotIn("Traceback", result.stderr)

    def test_non_object_permissions_fails_cleanly(self):
        for permissions in ([], "permissions", 1, None):
            with self.subTest(permissions=permissions):
                self.write_settings({"permissions": permissions})

                result = run_linter(self.root)

                self.assertEqual(result.returncode, 1)
                self.assertIn("expected permissions to be an object", result.stdout)
                self.assertNotIn("Traceback", result.stderr)

    def test_non_list_allow_fails_cleanly(self):
        for allow in ({}, "Bash(bun run:*)", 1, None):
            with self.subTest(allow=allow):
                self.write_settings({"permissions": {"allow": allow}})

                result = run_linter(self.root)

                self.assertEqual(result.returncode, 1)
                self.assertIn("expected permissions.allow to be a list", result.stdout)
                self.assertNotIn("Traceback", result.stderr)
if __name__ == "__main__":
    unittest.main()
