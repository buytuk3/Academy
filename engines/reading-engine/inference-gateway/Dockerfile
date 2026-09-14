# ================================================================
# BuyTuk Inference Gateway - Multi-stage CUDA Build
# Base: NVIDIA CUDA 12.4 + Python 3.11
# ================================================================

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3-pip \
    python3.11-venv \
    ffmpeg \
    libsndfile1 \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/python3.11 /usr/bin/python && \
    python3 -m pip install --upgrade pip

# ================================================================
# Builder Stage - Install heavy deps
# ================================================================
FROM base AS builder

WORKDIR /build

COPY requirements.txt .

RUN pip install torch==2.3.0 torchaudio==2.3.0 --index-url https://download.pytorch.org/whl/cu124

RUN pip install --no-cache-dir -r requirements.txt

# ================================================================
# Proto Compilation Stage
# ================================================================
FROM builder AS proto-compiler

COPY proto/inference.proto .

RUN python3 -m grpc_tools.protoc \
    -I. \
    --python_out=. \
    --grpc_python_out=. \
    inference.proto

# ================================================================
# Runtime Stage
# ================================================================
FROM base AS runtime

WORKDIR /app

# Copy installed packages
COPY --from=builder /usr/local/lib/python3.11/dist-packages /usr/local/lib/python3.11/dist-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy compiled protos
COPY --from=proto-compiler /build/inference_pb2.py .
COPY --from=proto-compiler /build/inference_pb2_grpc.py .

# Copy gateway code
COPY gateway.py .
COPY workers/ workers/

# Non-root user
RUN groupadd -r gateway && useradd -r -g gateway gateway && \
    chown -R gateway:gateway /app

USER gateway

# Model cache volume
VOLUME ["/model-cache"]
ENV HF_HOME=/model-cache \
    TORCH_HOME=/model-cache \
    WHISPER_MODEL=large-v3-turbo \
    DEVICE=cuda \
    GATEWAY_PORT=50050

EXPOSE 50050

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python3 -c "import grpc; ch=grpc.insecure_channel('localhost:50050'); grpc.channel_ready_future(ch).result(timeout=5)" || exit 1

CMD ["python3", "gateway.py"]
