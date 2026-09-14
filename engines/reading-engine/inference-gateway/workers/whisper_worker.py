"""
Whisper V3 Worker
Uses faster-whisper (CTranslate2) for production-speed inference
"""

import os
import logging
import numpy as np
from typing import List

import inference_pb2

logger = logging.getLogger(__name__)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3-turbo")
DEVICE = os.getenv("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")


class WhisperWorker:
    def __init__(self):
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            from faster_whisper import WhisperModel
            self.model = WhisperModel(
                WHISPER_MODEL,
                device=DEVICE,
                compute_type=COMPUTE_TYPE,
                num_workers=2,
                cpu_threads=4,
            )
            logger.info(f"Whisper model loaded: {WHISPER_MODEL} on {DEVICE}")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            self.model = None

    async def transcribe(self, request: inference_pb2.TranscribeRequest) -> inference_pb2.TranscribeResponse:
        if self.model is None:
            raise RuntimeError("Whisper model not loaded")

        audio = np.array(request.audio, dtype=np.float32)

        segments_gen, info = self.model.transcribe(
            audio,
            language=request.language or "ar",
            task=request.task or "transcribe",
            word_timestamps=request.word_timestamps,
            chunk_length=request.chunk_length_s or 30,
            stride_length=request.stride_length_s or 5,
            vad_filter=True,
            vad_parameters={
                "threshold": 0.5,
                "min_speech_duration_ms": 250,
            },
        )

        full_text = ""
        proto_segments = []

        for seg in segments_gen:
            full_text += seg.text

            proto_words = []
            if seg.words:
                for w in seg.words:
                    proto_words.append(inference_pb2.WordSegment(
                        word=w.word,
                        start=w.start,
                        end=w.end,
                        no_speech_prob=getattr(seg, "no_speech_prob", 0.0),
                        avg_logprob=getattr(seg, "avg_logprob", -0.5),
                        compression_ratio=getattr(seg, "compression_ratio", 1.0),
                    ))

            proto_segments.append(inference_pb2.Segment(
                text=seg.text,
                start=seg.start,
                end=seg.end,
                no_speech_prob=getattr(seg, "no_speech_prob", 0.0),
                avg_logprob=getattr(seg, "avg_logprob", -0.5),
                compression_ratio=getattr(seg, "compression_ratio", 1.0),
                words=proto_words,
            ))

        logger.info(
            f"Transcribed {len(proto_segments)} segments, "
            f"language={info.language}, duration={info.duration:.1f}s"
        )

        return inference_pb2.TranscribeResponse(
            text=full_text.strip(),
            segments=proto_segments,
            language=info.language,
        )
