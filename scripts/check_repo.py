#!/usr/bin/env python3
"""Offline structural checks. Not a substitute for content/privacy review."""

import argparse
import datetime
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


TASK_STATES = {"planned", "ready", "running", "review", "rework", "blocked", "done"}
MODULE_STATES = {"planned", "draft", "reviewed", "mock_verified", "live_verified"}
ACCESS_STATES = {"public-page", "free-course", "paid-benchmark", "unverified"}
SKIP_PARTS = {".git", ".local", "__pycache__", ".venv", "node_modules"}


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def safe_path(root, value):
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        return False
    try:
        (root / value).resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def validate_dag(items, dependency_key):
    errors = []
    ids = [item.get("id") for item in items]
    if len(set(ids)) != len(ids):
        errors.append("duplicate ids")
    if any(not isinstance(value, str) or not value for value in ids):
        errors.append("missing/invalid id")
        return errors
    graph = {item["id"]: item.get(dependency_key, []) for item in items}
    for item_id, deps in graph.items():
        if not isinstance(deps, list) or any(not isinstance(d, str) for d in deps):
            errors.append(f"{item_id}: invalid dependency list")
            return errors
        for dep in deps:
            if dep not in graph:
                errors.append(f"{item_id}: unknown dependency {dep}")
    active, visited = set(), set()

    def visit(node):
        if node in active:
            errors.append(f"cycle at {node}")
            return
        if node in visited or node not in graph:
            return
        active.add(node)
        for dependency in graph[node]:
            visit(dependency)
        active.remove(node)
        visited.add(node)

    for item_id in graph:
        visit(item_id)
    return errors


def local_link_errors(root, path, text):
    # Ignore fenced examples, not real Markdown navigation.
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    errors = []
    for target in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", text):
        target = target.strip().split(" ", 1)[0].strip("<>")
        parsed = urlsplit(target)
        if parsed.scheme or target.startswith("#"):
            continue
        value = unquote(parsed.path)
        if not value:
            continue
        resolved = (path.parent / value).resolve()
        try:
            resolved.relative_to(root.resolve())
        except ValueError:
            errors.append(f"{path.relative_to(root)}: link escapes repo: {value}")
            continue
        if not resolved.exists():
            errors.append(f"{path.relative_to(root)}: missing local link {value}")
    return errors


def validate_case_ownership(tasks):
    """Check task contracts, not whether unwritten cases are ready."""
    errors, owners = [], {}
    for task in tasks:
        case_ids = task.get("case_ids", [])
        if not isinstance(case_ids, list):
            errors.append(f"{task.get('id')}: invalid case_ids list")
            continue
        for case_id in case_ids:
            if not isinstance(case_id, str) or not re.fullmatch(r"U\d{2}", case_id):
                errors.append(f"{task.get('id')}: invalid case id")
                continue
            if case_id in owners:
                errors.append(f"{case_id}: duplicate case owner")
            owners[case_id] = task.get("id")
            scope = task.get("scope", [])
            if not isinstance(scope, list):
                scope = []
            if not any(isinstance(value, str) and value.startswith(f"cases/{case_id}-")
                       and value.endswith(".md") for value in scope):
                errors.append(f"{case_id}: missing case write scope")
    missing = {f"U{i:02}" for i in range(1, 13)} - set(owners)
    if missing:
        errors.append(f"missing case owners: {', '.join(sorted(missing))}")
    return errors


def validate(root):
    errors = []
    required = [
        "README.md", "AGENTS.md", "docs/course-build-plan.md",
        "docs/curriculum.md", "docs/publication-policy.md",
        "prompts/start-course-build.md", "sources/registry.json",
        "modules/manifest.json", "workflow/backlog.json",
        "docs/learner-profile.md", "docs/problem-patterns.md",
        "docs/course-website.md",
        "docs/execution/model-routing.md", "docs/execution/research-workflow.md",
        "prompts/subagent-roles.md", "templates/research-packet.md", "templates/use-case.md",
    ]
    for name in required:
        if not (root / name).is_file():
            errors.append(f"missing required file: {name}")
    if errors:
        return errors
    try:
        sources = load_json(root / "sources/registry.json")["sources"]
        modules = load_json(root / "modules/manifest.json")["modules"]
        tasks = load_json(root / "workflow/backlog.json")["tasks"]
    except (ValueError, KeyError, TypeError) as exc:
        return [f"invalid registry: {exc}"]
    source_ids = [s.get("id") for s in sources]
    module_ids = {m.get("id") for m in modules}
    if len(set(source_ids)) != len(source_ids):
        errors.append("duplicate source ids")
    if module_ids != {f"M{i:02}" for i in range(10)}:
        errors.append("curriculum must contain exactly M00–M09")
    for source in sources:
        sid = source.get("id", "?")
        for field in ("title", "url", "publisher", "language", "type",
                      "access", "verified_at", "modules", "caveat", "reuse"):
            if not source.get(field):
                errors.append(f"{sid}: missing {field}")
        url = urlsplit(source.get("url", ""))
        if url.scheme not in {"https", "http"} or not url.netloc:
            errors.append(f"{sid}: invalid URL")
        if source.get("access") not in ACCESS_STATES:
            errors.append(f"{sid}: invalid access status")
        try:
            datetime.date.fromisoformat(source.get("verified_at", ""))
        except ValueError:
            errors.append(f"{sid}: invalid verified_at date")
        for mid in source.get("modules", []):
            if mid not in module_ids:
                errors.append(f"{sid}: unknown module {mid}")
    errors += validate_dag(modules, "prerequisites")
    for module in modules:
        mid, value = module["id"], module.get("path", "")
        if not safe_path(root, value):
            errors.append(f"{mid}: unsafe module path")
            continue
        if not (root / value / "brief.md").is_file():
            errors.append(f"{mid}: missing brief.md")
        if module.get("status") not in MODULE_STATES:
            errors.append(f"{mid}: invalid material status")
        for sid in module.get("source_ids", []):
            if sid not in source_ids:
                errors.append(f"{mid}: unknown source {sid}")
        if module.get("status") != "planned":
            for name in ("README.md", "lesson-01.md", "lesson-02.md",
                         "lab.md", "assessment.md", "quiz.json", "solutions.md", "evidence.json"):
                if not (root / value / name).is_file():
                    errors.append(f"{mid}: status requires {name}")
    errors += validate_dag(tasks, "depends_on")
    errors += validate_case_ownership(tasks)
    tasks_by_id = {t["id"]: t for t in tasks}
    for task in tasks:
        tid = task["id"]
        if task.get("status") not in TASK_STATES:
            errors.append(f"{tid}: invalid task status")
        for field in ("scope", "deliverables", "acceptance"):
            if not isinstance(task.get(field), list) or not task[field]:
                errors.append(f"{tid}: missing {field}")
        for value in task.get("scope", []):
            if not safe_path(root, value):
                errors.append(f"{tid}: unsafe scope")
        if task.get("status") == "done":
            if not task.get("evidence"):
                errors.append(f"{tid}: done without evidence")
            for value in task.get("evidence", []):
                if not safe_path(root, value) or not (root / value).is_file():
                    errors.append(f"{tid}: missing/unsafe evidence")
            for dep in task.get("depends_on", []):
                if tasks_by_id.get(dep, {}).get("status") != "done":
                    errors.append(f"{tid}: done before dependency {dep}")
            for child in tasks:
                if child.get("parent_id") == tid and child.get("status") != "done":
                    errors.append(f"{tid}: done before child {child['id']}")
        if task.get("parent_id") and task["parent_id"] not in tasks_by_id:
            errors.append(f"{tid}: unknown parent")
    secret_patterns = [
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
        re.compile(r"\bgithub_pat_[A-Za-z0-9_]{40,}\b"),
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    ]
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if set(relative.parts) & SKIP_PARTS:
            continue
        if path.is_symlink():
            errors.append(f"symlink requires manual publication review: {relative}")
            continue
        if not path.is_file():
            continue
        if path.name == ".env" or (path.name.startswith(".env.") and path.name != ".env.example"):
            errors.append(f"credential environment file present: {relative}")
        if path.suffix.lower() not in {".md", ".json", ".py", ".yml", ".yaml", ".txt", ".csv"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeError:
            errors.append(f"non-UTF8 text: {relative}")
            continue
        if any(pattern.search(text) for pattern in secret_patterns):
            errors.append(f"potential secret: {relative}; inspect without printing value")
        if path.suffix == ".md":
            errors += local_link_errors(root, path, text)
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors = validate(args.root.resolve())
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print("PASS: structure, DAG, registry, local paths and limited secret-pattern checks")
    print("NOT CHECKED: semantic accuracy, external-link freshness, all PII, lab execution")
    return 0


if __name__ == "__main__":
    sys.exit(main())
