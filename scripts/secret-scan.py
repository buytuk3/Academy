#!/usr/bin/env python3
"""PHASE-26 - pure-python secrets scanner (same regex set as the phase
finalizers). Exit 1 on any hit - CI blocks the merge."""
import os
import re
import sys

SECRET_RE = re.compile(r'(api[_-]?key|apikey|secret|passwd|password|token|access[_-]?key)["\']?\s*[:=]\s*["\'][A-Za-z0-9/+_.-]{16,}["\']', re.I)
ALLOW_RE = re.compile(r's3cretpass|dev-secret|change-me|unit-test|test-secret|core1[7-9]-test|core2[0-9]-test|session-token|real-jwt|real-kek|process\.env|accountToken', re.I)


def scan(path):
    try:
        fh = open(path, encoding="utf-8", errors="ignore")
    except OSError:
        return 0
    hits = 0
    with fh:
        for i, line in enumerate(fh, 1):
            if SECRET_RE.search(line) and not ALLOW_RE.search(line):
                print("SECRET_HIT %s:%d" % (path, i))
                hits += 1
    return hits


total = 0
for root, dirs, files in os.walk("."):
    dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "dist", "coverage")]
    for name in files:
        total += scan(os.path.join(root, name))
print("secret-scan: %d hit(s)" % total)
sys.exit(1 if total else 0)
