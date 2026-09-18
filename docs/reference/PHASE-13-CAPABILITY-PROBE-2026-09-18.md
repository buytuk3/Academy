# PHASE-13 CAPABILITY PROBE — 2026-09-18 (DEP-001 environment readiness)

Scope: bounded real commands only (no installs, no model downloads). Purpose: verify whether the
sandbox can host REAL Whisper/CUDA inference for PHASE-13 (AI-RUNTIME-PROOF). Verdict recorded
verbatim below; DEP-001 remains **NOT VERIFIED** in TRACEABILITY_MATRIX.md until real audio
evidence exists on a capable host.

```
=== CAPABILITY PROBE — 2026-09-18T05:05:34Z — bounded, real commands ===
--- [1] nvidia-smi ---
/bin/bash: line 6: nvidia-smi: command not found
--- [2] /dev/nvidia* ---
ls: cannot access '/dev/nvidia*': No such file or directory
--- [3] python torch/CUDA ---
ModuleNotFoundError: No module named 'torch'
--- [4] python whisper ---
ModuleNotFoundError: No module named 'whisper'
--- [5] pip ctc-alignment ---
--- [6] inference-gateway components in repo ---
Dockerfile
README.md
docker-compose.workers.yml
gateway.py
proto
requirements.txt
workers
alignment_worker.py
feedback_worker.py
g2p_worker.py
whisper_worker.py
--- [7] host capacity ---
2
Mem:               1           0           0           0           1           1
--- [8] outbound network (bounded 6s each) ---
HTTP/2 200
HTTP/2 200
--- [9] probe doc existence check ---
ls: cannot access 'docs/reference/PHASE-13-CAPABILITY-PROBE-2026-09-18.md': No such file or directory
```

## Verdict
| Requirement | Result |
|---|---|
| GPU/CUDA device | ABSENT — no `nvidia-smi`, no `/dev/nvidia*` |
| CUDA-capable torch | ABSENT — no `torch` installed |
| Whisper runtime | ABSENT — no `openai-whisper` |
| Alignment/G2P tooling | ABSENT — no `ctc-alignment` |
| inference-gateway code | PRESENT in repo (gateway.py + workers/{whisper,alignment,feedback,g2p}_worker.py + Dockerfile + compose + proto + requirements.txt) |
| Host capacity | 2 vCPU / ~1 GB RAM — insufficient for real model inference |
| Outbound network | PyPI + HuggingFace reachable (HTTP 200) — downloads possible, compute is not |

## Consequence (honest disclosure)
Gates GPU-1 / WER-1 / ALN-1 / E2E-1 CANNOT run here. No WER number, no alignment output and no
phase-closure claim will be produced from this environment. A cloud GPU environment (AWS/RunPod)
or an admin-run bundle on any GPU host is required — see the PHASE-13 charter gate list.
