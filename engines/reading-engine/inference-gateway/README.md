# BuyTuk Inference Gateway

Unified gRPC gateway for all ML inference workers:

| Worker | Model | Role |
|---|---|---|
| Whisper | `openai/whisper-large-v3-turbo` | Arabic STT |
| Alignment | `whisperx` + `wav2vec2-large-xlsr-53-arabic` | Word-level timestamps |
| Phoneme | `facebook/mms-1b-all` | Phoneme recognition |
| G2P | `camel-tools` v1.6.2 | Diacritization + morphology |
| Feedback | Gemini 2.0 Flash / GPT-4o-mini | Instruction reformulation |

---

## Quick Start

```bash
# 1. Copy env
cp .env.example .env
# Fill INFERENCE_API_KEY, GEMINI_API_KEY, etc.

# 2. Build & run
docker-compose -f docker-compose.workers.yml up --build

# 3. Scale Whisper (optional)
docker-compose -f docker-compose.workers.yml --profile scale up
```

---

## Architecture

```
TypeScript App
    │ gRPC (port 50050)
    ▼
Inference Gateway (gateway.py)
    │  Circuit Breaker per worker
    ├─ WhisperWorker     → faster-whisper (CUDA)
    ├─ AlignmentWorker  → WhisperX + MMS-fa (CUDA)
    ├─ G2PWorker        → CAMeL Tools (CPU)
    └─ FeedbackWorker   → Gemini / OpenAI (API)
```

---

## Circuit Breaker

Each worker has an independent circuit breaker:
- **CLOSED** → normal operation
- **OPEN** → failures ≥ threshold; returns `UNAVAILABLE`
- **HALF_OPEN** → recovery probe after timeout

Defaults: `failure_threshold=5`, `recovery_timeout=30s`

---

## Proto Compilation

```bash
python3 -m grpc_tools.protoc \
  -I./proto \
  --python_out=. \
  --grpc_python_out=. \
  ./proto/inference.proto
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GATEWAY_PORT` | `50050` | gRPC port |
| `INFERENCE_API_KEY` | — | Bearer token for auth |
| `WHISPER_MODEL` | `large-v3-turbo` | Whisper model name |
| `ALIGN_MODEL` | `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` | WhisperX model |
| `MMS_MODEL` | `facebook/mms-1b-all` | MMS-fa model |
| `LLM_PROVIDER` | `gemini` | `gemini` or `openai` |
| `GEMINI_API_KEY` | — | Gemini API key |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `DEVICE` | `cuda` | `cuda` or `cpu` |
| `LOG_LEVEL` | `INFO` | Python logging level |

---

## GPU Requirements

- CUDA 12.4+
- VRAM: ≥ 12 GB for `large-v3-turbo` + alignment model simultaneously
- Recommended: NVIDIA A10G (24 GB) or RTX 3090/4090

---

## Notes

1. Models are downloaded to `/model-cache` on first run (persisted as Docker volume).
2. CAMeL Tools requires the CALIMA-MSA morphological database (included in `camel-tools` pip package).
3. MMS-fa phoneme recognition requires the `facebook/mms-1b-all` checkpoint from HuggingFace.
