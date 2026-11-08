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

    def test_kernel_research_precedes_curriculum(self):
        tasks = {item["id"]: item for item in
                 CHECK.load_json(ROOT / "workflow/backlog.json")["tasks"]}
        self.assertEqual(tasks["K00"]["kind"], "expandable")
        self.assertTrue({"F01", "F02"}.issubset(tasks["K00"]["depends_on"]))
        self.assertIn("K00", tasks["F03"]["depends_on"])
        self.assertTrue({
            "docs/kernel-capabilities.md",
            "docs/kernel-proposals/",
            "docs/kernel-roadmap.md",
        }.issubset(tasks["K00"]["scope"]))

    def assert_kernel_release_dependencies(self, tasks):
        """Check graph/evidence shape, not authenticity of owner approval."""
        seen, pending = set(), list(tasks["Q01"]["depends_on"])
        while pending:
            task_id = pending.pop()
            if task_id in seen:
                continue
            seen.add(task_id)
            pending.extend(tasks[task_id]["depends_on"])
        self.assertIn("K00", seen)
        gates = {"F04", "F04-FIXTURE"}.intersection(tasks["Q01"]["depends_on"])
        self.assertEqual(len(gates), 1)
        if "F04-FIXTURE" in gates:
            fixture = tasks["F04-FIXTURE"]
            self.assertTrue({"F01", "P00"}.issubset(fixture["depends_on"]))
            self.assertNotEqual(fixture.get("parent_id"), "F04")
            self.assertNotIn("F04", seen)
            self.assertEqual(tasks["F04"]["status"], "blocked")
            # An evidence reference is mandatory; content approval is reviewed separately.
            self.assertTrue(fixture.get("evidence"))

    def fixture_edition_tasks(self):
        """In-memory test data only; does not approve or change the real backlog."""
        tasks = {item["id"]: item for item in
                 copy.deepcopy(CHECK.load_json(ROOT / "workflow/backlog.json")["tasks"])}
        tasks["F04"]["status"] = "blocked"
        tasks["Q01"]["depends_on"] = [
            "F04-FIXTURE" if dep == "F04" else dep
            for dep in tasks["Q01"]["depends_on"]
        ]
        tasks["F04-FIXTURE"] = {
            "id": "F04-FIXTURE",
            "depends_on": ["F01", "P00"],
            "status": "planned",
            "evidence": ["test-only/owner-approval.md"],
        }
        return tasks

    def test_final_integration_depends_on_kernel_research_and_release_gate(self):
        tasks = {item["id"]: item for item in
                 CHECK.load_json(ROOT / "workflow/backlog.json")["tasks"]}
        self.assert_kernel_release_dependencies(tasks)

    def test_fixture_edition_preserves_kernel_research_without_export_dependency(self):
        tasks = self.fixture_edition_tasks()
        self.assertEqual(CHECK.validate_dag(list(tasks.values()), "depends_on"), [])
        self.assert_kernel_release_dependencies(tasks)

    def test_missing_release_gate_rejected(self):
        tasks = self.fixture_edition_tasks()
        tasks["Q01"]["depends_on"].remove("F04-FIXTURE")
        with self.assertRaises(AssertionError):
            self.assert_kernel_release_dependencies(tasks)

    def test_fixture_without_evidence_or_with_false_export_done_rejected(self):
        for mutation in ("missing_evidence", "false_export_done", "wrong_parent"):
            with self.subTest(mutation=mutation):
                tasks = self.fixture_edition_tasks()
                if mutation == "missing_evidence":
                    tasks["F04-FIXTURE"]["evidence"] = []
                elif mutation == "false_export_done":
                    tasks["F04"]["status"] = "done"
                else:
                    tasks["F04-FIXTURE"]["parent_id"] = "F04"
                with self.assertRaises(AssertionError):
                    self.assert_kernel_release_dependencies(tasks)

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
