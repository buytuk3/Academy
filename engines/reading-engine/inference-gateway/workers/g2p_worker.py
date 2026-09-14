"""
G2P Worker - CAMeL Tools
Arabic grapheme-to-phoneme with diacritization + morphology
"""

import os
import logging
import json
from typing import Optional

import inference_pb2

logger = logging.getLogger(__name__)

CAMEL_MODEL = os.getenv("CAMEL_MODEL", "calima-msa-r13")


class G2PWorker:
    def __init__(self):
        self.diacritizer = None
        self.morph_analyzer = None
        self._load_models()

    def _load_models(self):
        try:
            from camel_tools.tagger.default import DefaultTagger
            from camel_tools.dialectid import DialectIdentifier
            from camel_tools.diacritize.model import DiacritizerMSA
            from camel_tools.morphology.database import MorphologyDB
            from camel_tools.morphology.analyzer import Analyzer

            self.diacritizer = DiacritizerMSA()
            self.diacritizer.set_model("13000000.0")

            db = MorphologyDB.builtin_db(CAMEL_MODEL)
            self.morph_analyzer = Analyzer(db)

            logger.info(f"CAMeL Tools loaded: model={CAMEL_MODEL}")
        except ImportError as e:
            logger.warning(f"CAMeL Tools not available: {e}")
        except Exception as e:
            logger.error(f"Failed to load CAMeL models: {e}")

    async def process(self, request: inference_pb2.G2PRequest) -> inference_pb2.G2PResponse:
        word = request.word.strip()

        diacritized = ""
        if request.diacritize and self.diacritizer is not None:
            try:
                result = self.diacritizer.diacritize_word(word)
                diacritized = result if result else word
            except Exception as e:
                logger.warning(f"Diacritization failed for '{word}': {e}")
                diacritized = word
        else:
            diacritized = word

        morphology = ""
        if request.morph_analysis and self.morph_analyzer is not None:
            try:
                analyses = self.morph_analyzer.analyze(word)
                if analyses:
                    best = analyses[0]
                    morphology = json.dumps({
                        "pos": best.get("pos", ""),
                        "root": best.get("root", ""),
                        "stem": best.get("stem", ""),
                        "lemma": best.get("lex", ""),
                        "features": {
                            "gender": best.get("gen", ""),
                            "number": best.get("num", ""),
                            "person": best.get("per", ""),
                            "aspect": best.get("asp", ""),
                        },
                    }, ensure_ascii=False)
            except Exception as e:
                logger.warning(f"Morphology analysis failed for '{word}': {e}")

        logger.debug(f"G2P: '{word}' → '{diacritized}'")
        return inference_pb2.G2PResponse(
            diacritized=diacritized,
            morphology=morphology,
        )
