import copy
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

    def test_case_owners_cover_requested_scope(self):
        tasks = CHECK.load_json(ROOT / "workflow/backlog.json")["tasks"]
        self.assertEqual(CHECK.validate_case_ownership(tasks), [])

    def test_missing_case_owner_rejected(self):
        tasks = copy.deepcopy(CHECK.load_json(ROOT / "workflow/backlog.json")["tasks"])
        for task in tasks:
            task["case_ids"] = [v for v in task.get("case_ids", []) if v != "U12"]
        self.assertTrue(any("missing case owners" in v for v in CHECK.validate_case_ownership(tasks)))

    def test_duplicate_case_owner_rejected(self):
        tasks = copy.deepcopy(CHECK.load_json(ROOT / "workflow/backlog.json")["tasks"])
        tasks[0]["case_ids"] = ["U12"]
        tasks[0]["scope"].append("cases/U12-planning.md")
        self.assertTrue(any("duplicate" in v for v in CHECK.validate_case_ownership(tasks)))

    def test_case_without_scope_rejected(self):
        tasks = copy.deepcopy(CHECK.load_json(ROOT / "workflow/backlog.json")["tasks"])
        for task in tasks:
            task["scope"] = [v for v in task["scope"] if not v.startswith("cases/U12-")]
        self.assertTrue(any("write scope" in v for v in CHECK.validate_case_ownership(tasks)))

    def test_invalid_case_metadata_rejected_without_crash(self):
        tasks = [
            {"id": "bad-list", "case_ids": None},
            {"id": "bad-scope", "case_ids": ["U01"], "scope": [None]},
            {"id": "bad-id", "case_ids": [42], "scope": []},
        ]
        errors = CHECK.validate_case_ownership(tasks)
        self.assertTrue(any("invalid case_ids list" in v for v in errors))
        self.assertTrue(any("write scope" in v for v in errors))
        self.assertTrue(any("invalid case id" in v for v in errors))


if __name__ == "__main__":
    unittest.main()
