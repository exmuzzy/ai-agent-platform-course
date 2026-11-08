#!/usr/bin/env python3
"""Compute or verify content_hash of a browser_self_check fixture (docs/fixture-contract.md, section 9)."""
import hashlib, json, sys
from pathlib import Path


def canonical_hash(data: dict) -> str:
    d = dict(data)
    d["content_hash"] = None
    s = json.dumps(d, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    write = "--write" in sys.argv
    rc = 0
    for name in args:
        path = Path(name)
        data = json.loads(path.read_text(encoding="utf-8"))
        h = canonical_hash(data)
        if write:
            data["content_hash"] = h
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"{name}: written {h}")
        elif data.get("content_hash") == h:
            print(f"{name}: OK {h}")
        else:
            print(f"{name}: MISMATCH expected {h}, got {data.get('content_hash')}")
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
