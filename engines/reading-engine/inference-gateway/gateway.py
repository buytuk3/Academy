"""
BuyTuk Inference Gateway
Unified gRPC server with circuit breaker for all ML workers
"""

import os
import asyncio
import logging
import json
import time
from concurrent import futures
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import grpc
from grpc import aio as grpc_aio

import inference_pb2
import inference_pb2_grpc
from workers.whisper_worker import WhisperWorker
from workers.alignment_worker import AlignmentWorker
from workers.g2p_worker import G2PWorker
from workers.feedback_worker import FeedbackWorker

# ===== Logging =====
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


# ===== Circuit Breaker =====
class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreaker:
    name: str
    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    half_open_max_calls: int = 2

    state: CircuitState = field(default=CircuitState.CLOSED, init=False)
    failure_count: int = field(default=0, init=False)
    last_failure_time: float = field(default=0.0, init=False)
    half_open_calls: int = field(default=0, init=False)

    def can_call(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0
                logger.info(f"[{self.name}] Circuit → HALF_OPEN")
                return True
            return False
        if self.state == CircuitState.HALF_OPEN:
            return self.half_open_calls < self.half_open_max_calls
        return False

    def record_success(self):
        if self.state == CircuitState.HALF_OPEN:
            logger.info(f"[{self.name}] Circuit → CLOSED (recovered)")
        self.state = CircuitState.CLOSED
        self.failure_count = 0

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            logger.warning(f"[{self.name}] Circuit → OPEN (half-open failure)")
        elif self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.error(f"[{self.name}] Circuit → OPEN ({self.failure_count} failures)")


# ===== Auth Interceptor =====
class AuthInterceptor(grpc.ServerInterceptor):
    def __init__(self, api_key: str):
        self.api_key = api_key

    def intercept_service(self, continuation, handler_call_details):
        metadata = dict(handler_call_details.invocation_metadata)
        auth = metadata.get("authorization", "")

        if not auth.startswith("Bearer "):
            return grpc.unary_unary_rpc_method_handler(
                lambda req, ctx: ctx.abort(grpc.StatusCode.UNAUTHENTICATED, "Missing API key")
            )

        if auth[7:] != self.api_key:
            return grpc.unary_unary_rpc_method_handler(
                lambda req, ctx: ctx.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid API key")
            )

        return continuation(handler_call_details)


# ===== gRPC Service =====
class InferenceServicer(inference_pb2_grpc.InferenceServiceServicer):
    def __init__(self):
        self.whisper = WhisperWorker()
        self.alignment = AlignmentWorker()
        self.g2p = G2PWorker()
        self.feedback = FeedbackWorker()

        self.breakers = {
            "whisper": CircuitBreaker("whisper"),
            "alignment": CircuitBreaker("alignment"),
            "g2p": CircuitBreaker("g2p"),
            "feedback": CircuitBreaker("feedback"),
        }

    async def Health(self, request, context):
        workers = {}
        for name, breaker in self.breakers.items():
            workers[name] = breaker.state.value
        return inference_pb2.HealthResponse(ok=True, workers=workers)

    async def Transcribe(self, request, context):
        breaker = self.breakers["whisper"]
        if not breaker.can_call():
            await context.abort(grpc.StatusCode.UNAVAILABLE, "Whisper circuit open")
            return

        try:
            result = await self.whisper.transcribe(request)
            breaker.record_success()
            return result
        except Exception as e:
            breaker.record_failure()
            logger.error(f"Transcribe failed: {e}", exc_info=True)
            await context.abort(grpc.StatusCode.INTERNAL, str(e))

    async def AlignWord(self, request, context):
        breaker = self.breakers["alignment"]
        if not breaker.can_call():
            await context.abort(grpc.StatusCode.UNAVAILABLE, "Alignment circuit open")
            return

        try:
            result = await self.alignment.align_words(request)
            breaker.record_success()
            return result
        except Exception as e:
            breaker.record_failure()
            logger.error(f"AlignWord failed: {e}", exc_info=True)
            await context.abort(grpc.StatusCode.INTERNAL, str(e))

    async def AlignPhoneme(self, request, context):
        breaker = self.breakers["alignment"]
        if not breaker.can_call():
            await context.abort(grpc.StatusCode.UNAVAILABLE, "Alignment circuit open")
            return

        try:
            result = await self.alignment.align_phonemes(request)
            breaker.record_success()
            return result
        except Exception as e:
            breaker.record_failure()
            logger.error(f"AlignPhoneme failed: {e}", exc_info=True)
            await context.abort(grpc.StatusCode.INTERNAL, str(e))

    async def G2P(self, request, context):
        breaker = self.breakers["g2p"]
        if not breaker.can_call():
            await context.abort(grpc.StatusCode.UNAVAILABLE, "G2P circuit open")
            return

        try:
            result = await self.g2p.process(request)
            breaker.record_success()
            return result
        except Exception as e:
            breaker.record_failure()
            logger.error(f"G2P failed: {e}", exc_info=True)
            await context.abort(grpc.StatusCode.INTERNAL, str(e))

    async def Feedback(self, request, context):
        breaker = self.breakers["feedback"]
        if not breaker.can_call():
            await context.abort(grpc.StatusCode.UNAVAILABLE, "Feedback circuit open")
            return

        try:
            result = await self.feedback.generate(request)
            breaker.record_success()
            return result
        except Exception as e:
            breaker.record_failure()
            logger.error(f"Feedback failed: {e}", exc_info=True)
            await context.abort(grpc.StatusCode.INTERNAL, str(e))


# ===== Server =====
async def serve():
    port = int(os.getenv("GATEWAY_PORT", "50050"))
    api_key = os.getenv("INFERENCE_API_KEY", "")

    server = grpc_aio.server(
        options=[
            ("grpc.max_receive_message_length", 100 * 1024 * 1024),
            ("grpc.max_send_message_length", 100 * 1024 * 1024),
            ("grpc.keepalive_time_ms", 30000),
            ("grpc.keepalive_timeout_ms", 10000),
        ],
    )

    servicer = InferenceServicer()
    inference_pb2_grpc.add_InferenceServiceServicer_to_server(servicer, server)

    server.add_insecure_port(f"0.0.0.0:{port}")

    logger.info(f"Inference Gateway starting on port {port}")
    await server.start()
    logger.info("Inference Gateway ready")

    try:
        await server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Shutting down gateway")
        await server.stop(grace=5)


if __name__ == "__main__":
    asyncio.run(serve())
