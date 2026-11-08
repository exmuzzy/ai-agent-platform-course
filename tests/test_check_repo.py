import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("check_repo", ROOT / "scripts/check_repo.py")
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class RepositoryChecks(unittest.TestCase):
    def test_current_repository(self):
        self.assertEqual(CHECK.validate(ROOT), [])

    def test_cycle_rejected(self):
        result = CHECK.validate_dag(
            [{"id": "A", "deps": ["B"]}, {"id": "B", "deps": ["A"]}], "deps")
        self.assertTrue(any("cycle" in item for item in result))

    def test_unknown_dependency_rejected(self):
        result = CHECK.validate_dag([{"id": "A", "deps": ["B"]}], "deps")
        self.assertTrue(any("unknown" in item for item in result))

    def test_duplicate_id_rejected(self):
        result = CHECK.validate_dag([{"id": "A"}, {"id": "A"}], "deps")
        self.assertIn("duplicate ids", result)

    def test_valid_dag(self):
        self.assertEqual(CHECK.validate_dag(
            [{"id": "A", "deps": []}, {"id": "B", "deps": ["A"]}], "deps"), [])

    def test_path_escape_rejected(self):
        self.assertFalse(CHECK.safe_path(ROOT, "../../outside"))
        self.assertFalse(CHECK.safe_path(ROOT, "/absolute/path"))
        self.assertTrue(CHECK.safe_path(ROOT, "modules/example"))

    def test_missing_local_link(self):
        result = CHECK.local_link_errors(ROOT, ROOT / "README.md", "[x](missing.md)")
        self.assertTrue(result)

    def test_external_and_fenced_links_ignored(self):
        result = CHECK.local_link_errors(
            ROOT, ROOT / "README.md",
            "[x](https://example.org/a)\n```text\n[x](missing.md)\n```")
        self.assertEqual(result, [])

    def test_link_escape_rejected(self):
        result = CHECK.local_link_errors(ROOT, ROOT / "README.md", "[x](../../outside.md)")
        self.assertTrue(any("escapes" in item for item in result))

    def test_empty_checkout_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertTrue(CHECK.validate(Path(tmp)))


if __name__ == "__main__":
    unittest.main()
