"""
Alignment Worker
Word-level: WhisperX
Phoneme-level: facebook/mms-fa
"""

import os
import logging
import numpy as np
from typing import List, Tuple

import inference_pb2

logger = logging.getLogger(__name__)

ALIGN_MODEL = os.getenv("ALIGN_MODEL", "jonatasgrosman/wav2vec2-large-xlsr-53-arabic")
MMS_MODEL = os.getenv("MMS_MODEL", "facebook/mms-1b-all")
DEVICE = os.getenv("ALIGN_DEVICE", "cuda")


class AlignmentWorker:
    def __init__(self):
        self.word_model = None
        self.phoneme_model = None
        self.word_metadata = None
        self._load_models()

    def _load_models(self):
        try:
            import whisperx
            self.word_model, self.word_metadata = whisperx.load_align_model(
                language_code="ar",
                device=DEVICE,
                model_name=ALIGN_MODEL,
            )
            logger.info(f"Word alignment model loaded: {ALIGN_MODEL}")
        except Exception as e:
            logger.error(f"Failed to load WhisperX model: {e}")

        try:
            from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
            import torch
            self.phoneme_processor = Wav2Vec2Processor.from_pretrained(MMS_MODEL)
            self.phoneme_model = Wav2Vec2ForCTC.from_pretrained(MMS_MODEL)
            if DEVICE == "cuda":
                import torch
                self.phoneme_model = self.phoneme_model.cuda()
            logger.info(f"Phoneme alignment model loaded: {MMS_MODEL}")
        except Exception as e:
            logger.error(f"Failed to load MMS model: {e}")

    async def align_words(
        self, request: inference_pb2.AlignWordRequest
    ) -> inference_pb2.AlignWordResponse:
        if self.word_model is None:
            raise RuntimeError("Word alignment model not loaded")

        import whisperx
        audio = np.array(request.audio, dtype=np.float32)

        # WhisperX expects transcript as list of segments
        fake_result = {
            "segments": [{
                "text": request.transcript,
                "start": 0.0,
                "end": len(audio) / request.sample_rate,
                "words": [
                    {"word": w, "start": 0.0, "end": 0.0}
                    for w in request.transcript.split()
                ],
            }]
        }

        aligned = whisperx.align(
            fake_result["segments"],
            self.word_model,
            self.word_metadata,
            audio,
            device=DEVICE,
            return_char_alignments=False,
        )

        words = []
        for seg in aligned["segments"]:
            for w in seg.get("words", []):
                words.append(inference_pb2.AlignedWord(
                    word=w.get("word", ""),
                    start=w.get("start", 0.0),
                    end=w.get("end", 0.0),
                    score=w.get("score", 0.5),
                    confidence=w.get("score", 0.5),
                ))

        logger.info(f"Aligned {len(words)} words")
        return inference_pb2.AlignWordResponse(words=words)

    async def align_phonemes(
        self, request: inference_pb2.AlignPhonemeRequest
    ) -> inference_pb2.AlignPhonemeResponse:
        if self.phoneme_model is None:
            raise RuntimeError("Phoneme alignment model not loaded")

        import torch
        audio = np.array(request.audio, dtype=np.float32)
        sr = request.sample_rate

        inputs = self.phoneme_processor(
            audio,
            sampling_rate=sr,
            return_tensors="pt",
        )

        if DEVICE == "cuda":
            inputs = {k: v.cuda() for k, v in inputs.items()}

        with torch.no_grad():
            logits = self.phoneme_model(**inputs).logits

        predicted_ids = torch.argmax(logits, dim=-1)
        transcription = self.phoneme_processor.batch_decode(predicted_ids)[0]
        phonemes = transcription.strip().split()

        # Simple uniform timestamp distribution
        duration = len(audio) / sr
        step = duration / max(len(phonemes), 1)
        starts = [i * step for i in range(len(phonemes))]
        ends = [(i + 1) * step for i in range(len(phonemes))]
        confidences = [0.8] * len(phonemes)

        logger.info(f"Aligned {len(phonemes)} phonemes")
        return inference_pb2.AlignPhonemeResponse(
            phonemes=phonemes,
            starts=starts,
            ends=ends,
            confidences=confidences,
        )
