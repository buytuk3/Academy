/**
 * Language registry (CORE-14H) — adding a third language means adding a pack
 * and registering it; the engine core is untouched.
 */
import type { LanguageCode } from "./contracts.js";
import {
  arabicPack,
  englishPack,
  type ArNormalizationOptions,
  type DictationLanguagePack,
} from "./policies.js";

export interface LanguagePackOptions {
  readonly caseSensitive?: boolean;
  readonly comparePunctuation?: boolean;
  readonly arabic?: ArNormalizationOptions;
}

const REGISTRY: Partial<Record<LanguageCode, (o: LanguagePackOptions) => DictationLanguagePack>> = {
  ar: (o) => arabicPack(o.arabic),
  en: (o) => englishPack({ caseSensitive: o.caseSensitive }),
};

export function languagePackFor(
  language: LanguageCode,
  opts?: LanguagePackOptions,
): DictationLanguagePack {
  const o = opts ?? {};
  const factory = REGISTRY[language];
  if (factory === undefined) {
    throw new Error(`UNSUPPORTED_LANGUAGE: ${language}`);
  }
  const pack = factory(o);
  if (o.comparePunctuation !== undefined) {
    return { ...pack, comparison: { ...pack.comparison, comparePunctuation: o.comparePunctuation } };
  }
  return pack;
}

export function supportedLanguages(): readonly LanguageCode[] {
  return ["ar", "en"];
}
