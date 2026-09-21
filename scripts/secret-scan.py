#!/usr/bin/env python3
"""PHASE-26 — pure-python secrets scanner (the SAME regex set the phase
finalizers use). Exit 1 on any hit — CI blocks the merge."""
import os
import re
import sys

SECRET_RE = re.compile(
    r'(api[_-]?key|apikey|secret|passwd|password|token|access[_-]?key)["\']?\s*[:=]\s*["\'][A-Za-z0-9/+_.-]{16,}["\']',
    re.I,
)
ALLOW_RE = re.compile(
    r"s3cretpass|dev-secret|change-me|unit-test|test-secret|core1[7-9]-test|core2[0-9]-test"
    r"|session-token|real-jwt|real-kek|process\.env|accountToken|\$\{\{",
    re.I,
)

hits = []
for root, dirs, files in os.walk("."):
    dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "dist", "coverage")]
    for fp in (os.path.join(root, f) for f in files):
        try:
            with open(fp, encoding="utf-8", errors="ignore") as f:
                for i, line in enumerate(f, 1):
                    if SECRET_RE.search(line) and not ALLOW_RE.search(line):
                        hits.append(f"{fp}:{i}")
except OSError:
    continue

for h in hits:
    print(f"SECRET_HIT {h}")
print(f"secret-scan: {len(hits)} hit(s)")
sys.exit(1 if hits else 0)
