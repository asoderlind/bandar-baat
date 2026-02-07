import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth, type AuthContext } from "../lib/middleware.js";

export const dictionaryRoutes = new Hono<{ Variables: AuthContext }>();

dictionaryRoutes.use("*", requireAuth);

const lookupSchema = z.object({
  word: z.string().min(1).max(100),
});

/**
 * GET /api/dictionary/lookup?word=जाना
 * Look up a Hindi word using the Wiktionary API and return
 * a structured result with definition, romanization, and part of speech.
 */
dictionaryRoutes.get(
  "/lookup",
  zValidator("query", lookupSchema),
  async (c) => {
    const { word } = c.req.valid("query");

    try {
      const result = await lookupWiktionary(word);
      return c.json({ success: true, data: result });
    } catch (error) {
      console.error("Dictionary lookup error:", error);
      return c.json(
        {
          success: true,
          data: {
            word,
            found: false,
            definitions: [],
          },
        },
        200,
      );
    }
  },
);

// ── Wiktionary parser ────────────────────────────────────────

interface WiktionaryResult {
  word: string;
  found: boolean;
  romanized?: string;
  definitions: {
    partOfSpeech: string;
    meanings: string[];
  }[];
}

async function lookupWiktionary(word: string): Promise<WiktionaryResult> {
  const url = new URL("https://en.wiktionary.org/w/api.php");
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", word);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const res = await fetch(url.toString());

  if (!res.ok) {
    return { word, found: false, definitions: [] };
  }

  const data = (await res.json()) as any;

  if (data.error) {
    return { word, found: false, definitions: [] };
  }

  const wikitext: string = data?.parse?.wikitext?.["*"] ?? "";

  if (!wikitext) {
    return { word, found: false, definitions: [] };
  }

  return parseHindiWikitext(word, wikitext);
}

/**
 * Parse the raw wikitext of a Wiktionary page to extract
 * Hindi-specific sections (romanization, definitions, PoS).
 *
 * Wiktionary pages are structured by language (==Hindi==) then
 * by part of speech (===Noun===, ===Verb===, etc.).
 */
function parseHindiWikitext(word: string, wikitext: string): WiktionaryResult {
  // Extract the Hindi section
  const hindiSection = extractLanguageSection(wikitext, "Hindi");

  if (!hindiSection) {
    return { word, found: false, definitions: [] };
  }

  // Extract romanization from the headword template
  const romanized = extractRomanization(hindiSection);

  // Extract definitions grouped by part of speech
  const definitions = extractDefinitions(hindiSection);

  return {
    word,
    found: definitions.length > 0,
    romanized: romanized || undefined,
    definitions,
  };
}

/**
 * Extract the section for a specific language from wikitext.
 * Language headers are ==Language==.
 */
function extractLanguageSection(
  wikitext: string,
  language: string,
): string | null {
  // Match ==Hindi== (level-2 header)
  const langRegex = new RegExp(`^==${language}==\\s*$`, "m");
  const match = langRegex.exec(wikitext);
  if (!match) return null;

  const start = match.index + match[0].length;

  // Find the next level-2 header (another language) or end of text
  const nextLangMatch = /^==[^=]+==/m.exec(wikitext.slice(start));
  const end = nextLangMatch ? start + nextLangMatch.index : wikitext.length;

  return wikitext.slice(start, end);
}

/**
 * Extract romanization from headword templates like
 * {{hi-noun|g=m|...}} or {{hi-verb form of|...}} or the
 * transliteration inside {{head|hi|...|tr=...}}
 */
function extractRomanization(section: string): string | null {
  // Try {{hi-*|...|tr=romanized}} pattern
  const trMatch = /\|tr=([^|}]+)/.exec(section);
  if (trMatch) return trMatch[1].trim();

  // Try Devanagari headword bullet: * {{hi-IPA|...}}
  // Or the head template: {{head|hi|...|...|romanized}}
  const headMatch =
    /\{\{head\|hi\|[^}]*?\|([a-zA-Zāīūṛṝḷḹēōṃḥñṅṇṭḍśṣ\s]+)\}\}/.exec(section);
  if (headMatch) return headMatch[1].trim();

  // Try inline romanization after bullet: {{hi-noun|romanized}} etc.
  // Many templates put romanization as first positional param after lang
  const posMatch =
    /\{\{hi-(?:noun|verb|adj|adv|proper noun|particle|postposition)[^}]*?\|([a-zA-Zāīūṛṝḷḹēōṃḥñṅṇṭḍśṣ\s-]+)/.exec(
      section,
    );
  if (posMatch) return posMatch[1].trim();

  return null;
}

/**
 * Extract definitions from the Hindi section, grouped by part of speech.
 * PoS headers are level 3 or 4: ===Noun=== / ====Noun====
 */
function extractDefinitions(
  section: string,
): { partOfSpeech: string; meanings: string[] }[] {
  const posLabels = [
    "Noun",
    "Verb",
    "Adjective",
    "Adverb",
    "Pronoun",
    "Postposition",
    "Particle",
    "Conjunction",
    "Determiner",
    "Numeral",
    "Interjection",
    "Proper noun",
  ];

  const results: { partOfSpeech: string; meanings: string[] }[] = [];

  for (const pos of posLabels) {
    // Match ===Noun=== or ====Noun====
    const posRegex = new RegExp(`^={3,4}${pos}={3,4}\\s*$`, "gim");
    let posMatch: RegExpExecArray | null;

    while ((posMatch = posRegex.exec(section)) !== null) {
      const start = posMatch.index + posMatch[0].length;

      // Find next header of level 3+ to delimit this PoS block
      const nextHeader = /^={3,}/m.exec(section.slice(start));
      const end = nextHeader ? start + nextHeader.index : section.length;
      const posBlock = section.slice(start, end);

      // Extract definition lines: lines starting with # (not ##, not #:, not #*)
      const meanings: string[] = [];
      const defRegex = /^# ([^#*:].*)$/gm;
      let defMatch: RegExpExecArray | null;

      while ((defMatch = defRegex.exec(posBlock)) !== null) {
        const cleaned = cleanWikitext(defMatch[1]);
        if (cleaned && cleaned.length > 1) {
          meanings.push(cleaned);
        }
      }

      if (meanings.length > 0) {
        results.push({
          partOfSpeech: pos.toUpperCase().replace(" ", "_"),
          meanings,
        });
      }
    }
  }

  return results;
}

/**
 * Strip common wikitext markup to get plain text.
 */
function cleanWikitext(text: string): string {
  let cleaned = text;

  // Remove {{...}} templates — but try to keep display text
  // Handle {{l|hi|word|t=meaning}} → meaning
  cleaned = cleaned.replace(
    /\{\{l\|[^|]*\|[^|]*(?:\|t=([^}]*))?}}/g,
    (_, t) => t || "",
  );
  // Handle {{m|hi|word|t=meaning}} → meaning
  cleaned = cleaned.replace(
    /\{\{m\|[^|]*\|[^|]*(?:\|t=([^}]*))?}}/g,
    (_, t) => t || "",
  );
  // Handle {{gloss|text}} → text
  cleaned = cleaned.replace(/\{\{gloss\|([^}]*)}}/g, "$1");
  // Remove remaining templates
  cleaned = cleaned.replace(/\{\{[^}]*}}/g, "");
  // Convert [[link|display]] → display, [[link]] → link
  cleaned = cleaned.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1");
  // Remove '' and ''' (italic/bold markup)
  cleaned = cleaned.replace(/'{2,3}/g, "");
  // Remove <ref>...</ref>
  cleaned = cleaned.replace(/<ref[^>]*>.*?<\/ref>/gs, "");
  cleaned = cleaned.replace(/<ref[^>]*\/>/g, "");
  // Trim
  cleaned = cleaned.trim();

  return cleaned;
}
