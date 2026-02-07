import type { CEFRLevel } from "@monke-say/shared";

// ============================================
// STORY GENERATION PROMPT
// ============================================

export interface StoryGenerationContext {
  level: CEFRLevel;
  topic: string;
  knownVocabulary: string;
  newVocabulary: string;
  grammarConcepts: string;
  characters?: string;
}

// ── Tweakable constants ──────────────────────────────────────
const SENTENCE_RANGE = { min: 10, max: 15 };
const EXERCISE_RANGE = { min: 4, max: 6 };

// ── Section builders (easy to edit independently) ────────────

function roleSection(): string {
  return `You are a Hindi language teaching assistant creating conversational practice content for language learners.
You are also a native-level Hindi speaker who writes grammatically perfect, natural-sounding spoken Hindi.`;
}

function taskSection(level: string, topic: string): string {
  return `Generate a short conversational story for a learner at ${level} level.
The story should be dialogue-heavy — at least 60-70% of the content should be characters talking to each other, with brief narration to set the scene. Think of it as a scene the learner might encounter in real life.

TOPIC/THEME: ${topic}`;
}

function vocabularySection(
  knownVocabulary: string,
  newVocabulary: string,
): string {
  return `KNOWN VOCABULARY (the learner can read these comfortably):
${knownVocabulary || "Basic greetings, pronouns, and common verbs"}

NEW WORDS TO TEACH (incorporate naturally — see rules below):
${newVocabulary}`;
}

function grammarSection(grammarConcepts: string): string {
  return `GRAMMAR TO PRACTICE:
${grammarConcepts}`;
}

function characterSectionBuilder(characters?: string): string {
  if (!characters) return "";
  return `RECURRING CHARACTERS (use these when appropriate for continuity):
${characters}
Feel free to develop their personalities and relationships naturally. You may introduce new minor characters as needed.`;
}

function styleGuidelinesSection(): string {
  return `STYLE GUIDELINES:
- Write ${SENTENCE_RANGE.min}-${SENTENCE_RANGE.max} sentences total
- Make it DIALOGUE-HEAVY: most of the story should be characters speaking to each other
- Use short narration lines (1-2 sentences) only to set the scene or describe actions between dialogue
- Dialogue should sound like real spoken Hindi — use colloquial forms, filler words (अच्छा, हाँ, अरे, चलो), and natural turn-taking
- Create a realistic everyday scenario: ordering food, asking for directions, shopping, meeting a friend, a phone call, visiting a doctor, etc.
- Build a mini conversation arc: greeting/opening → main exchange → closing/goodbye
- Each dialogue line should be something the learner could realistically say or hear in India
- Vary speakers and keep exchanges natural — avoid long monologues
- Every sentence must advance the conversation or set context — no random filler actions`;
}

function newWordRulesSection(): string {
  return `NEW WORD USAGE RULES:
- Integrate new words ONLY when they fit the story naturally
- It is perfectly fine to use a new word just once if forcing a second use would feel unnatural
- NEVER insert random unrelated actions (e.g. "he drank water", "she read a book") just to practise a word — if a word doesn't fit the story, skip it
- The story's coherence is more important than word coverage`;
}

function hindiGrammarRulesSection(): string {
  return `CRITICAL HINDI GRAMMAR RULES — follow these exactly:
1. VERB CONJUGATION: Never use the bare infinitive (e.g. जाना, बोलना) as a main verb with है.
   - "infinitive + है" (जाना है) = obligation ("has to go"). This is NOT simple present tense.
   - Simple present (habitual): stem + ता/ती/ते + है/हैं  →  जाता है (goes), बोलती है (speaks)
   - Present progressive: stem + रहा/रही/रहे + है/हैं  →  जा रहा है (is going)
   - Simple past: stem + आ/ई/ए  →  गया (went), बोला (said)
2. GENDER AGREEMENT: Adjectives and verbs must agree with the noun's gender.
   - अच्छा लड़का / अच्छी लड़की
   - लड़का जाता है / लड़की जाती है
3. POSTPOSITION CASE: When a noun is followed by a postposition, it takes the oblique case.
   - लड़का → लड़के को, घर → घर में
4. ने-construction in perfective: Transitive verbs in simple past use ने with the subject; the verb agrees with the object.
   - लड़के ने किताब पढ़ी (the boy read the book — verb agrees with किताब, feminine)`;
}

function languageConstraintsSection(level: string): string {
  return `LANGUAGE CONSTRAINTS:
- Use only known vocabulary + new words (proper nouns like names are OK)
- Keep individual sentences clear, but let them build on each other
- Match complexity to ${level} level`;
}

function outputFormatSection(): string {
  return `Return your response as valid JSON with this exact structure:
{
  "title": "Story title in Hindi (with English subtitle)",
  "content_hindi": "Full story text in Devanagari as flowing prose",
  "content_romanized": "Full story romanized as flowing prose",
  "content_english": "English translation as flowing prose",
  "word_count": number,
  "characters_used": [
    {
      "name": "Character name",
      "role": "How they appear in this story"
    }
  ],
  "sentences": [
    {
      "index": 0,
      "hindi": "Sentence in Devanagari",
      "romanized": "Sentence romanized",
      "english": "English translation",
      "words": [
        {
          "hindi": "word",
          "romanized": "word",
          "english": "meaning",
          "isNew": true,
          "partOfSpeech": "NOUN"
        }
      ],
      "grammarNotes": ["Optional: brief grammar insight for this sentence"]
    }
  ],
  "exercises": [
    {
      "type": "COMPREHENSION",
      "question": {
        "prompt": "Question about story content or meaning",
        "context": "Relevant excerpt if needed",
        "sentenceIndex": 0
      },
      "correctAnswer": "The correct answer",
      "options": ["option1", "option2", "option3", "option4"]
    }
  ]
}`;
}

function exercisesSection(): string {
  return `EXERCISE TYPES (generate ${EXERCISE_RANGE.min}-${EXERCISE_RANGE.max} varied exercises):
- COMPREHENSION: Questions about story meaning, character motivations, or plot
- FILL_BLANK: Complete a sentence from the story with the correct word
- TRANSLATE_TO_HINDI: Translate an English phrase/sentence to Hindi
- TRANSLATE_TO_ENGLISH: Translate a Hindi phrase/sentence to English
- MULTIPLE_CHOICE: Vocabulary or grammar questions with 4 options

Focus exercises on the new vocabulary and grammar concepts being practiced.`;
}

// ── Main builder ─────────────────────────────────────────────

/**
 * Builds the full story-generation prompt from modular sections.
 * Each section is a standalone function so you can tweak wording
 * without touching unrelated parts.
 */
export function buildStoryGenerationPrompt(
  ctx: StoryGenerationContext,
): string {
  const sections = [
    roleSection(),
    taskSection(ctx.level, ctx.topic),
    vocabularySection(ctx.knownVocabulary, ctx.newVocabulary),
    grammarSection(ctx.grammarConcepts),
    characterSectionBuilder(ctx.characters),
    styleGuidelinesSection(),
    newWordRulesSection(),
    hindiGrammarRulesSection(),
    languageConstraintsSection(ctx.level),
    outputFormatSection(),
    exercisesSection(),
  ].filter(Boolean);

  return sections.join("\n\n");
}

// ============================================
// GRAMMAR & COHESION VALIDATION PROMPT
// ============================================

export interface StoryValidationContext {
  storyHindi: string;
  storyEnglish: string;
  level: CEFRLevel;
  topic: string;
}

/**
 * Builds a prompt that asks the LLM to review a generated story
 * for grammar mistakes and cohesion problems, then return a
 * corrected version if needed.
 */
export function buildStoryValidationPrompt(
  ctx: StoryValidationContext,
): string {
  return `You are a Hindi language expert reviewing a generated story for a ${ctx.level}-level Hindi learner.

ORIGINAL STORY (Hindi):
${ctx.storyHindi}

ENGLISH TRANSLATION:
${ctx.storyEnglish}

INTENDED TOPIC: ${ctx.topic}

Review the story for the following issues and return corrections:

1. GRAMMAR CHECK
   - Verb conjugation: ensure no bare infinitive + है used as simple present (e.g. "जाना है" when meaning "goes" — should be "जाता है")
   - Gender agreement on adjectives and verbs
   - Correct postposition case (oblique forms)
   - Proper use of ने-construction in perfective tense

2. COHESION CHECK
   - Every sentence should connect logically to the previous one
   - No random, unrelated actions inserted (e.g. sudden "he drank water" in a shopping story)
   - The story should stay focused on the topic/setting
   - There should be a clear mini arc: setup → development → resolution

3. NATURALNESS CHECK
   - Sentences should sound like something a native Hindi speaker would actually say
   - Dialogue (if any) should feel natural, not textbook-stilted

Return your response as valid JSON:
{
  "hasIssues": true/false,
  "issues": [
    {
      "type": "GRAMMAR" | "COHESION" | "NATURALNESS",
      "description": "What the issue is",
      "original": "The problematic text",
      "corrected": "The fixed text"
    }
  ],
  "corrected_hindi": "Full corrected story in Devanagari (or original if no issues)",
  "corrected_romanized": "Full corrected story romanized",
  "corrected_english": "Updated English translation",
  "corrected_sentences": [
    {
      "index": 0,
      "hindi": "Corrected sentence in Devanagari",
      "romanized": "Corrected sentence romanized",
      "english": "Corrected English translation",
      "changed": true/false
    }
  ]
}

If the story is already correct, set "hasIssues" to false and return the original text unchanged.
Only fix actual errors — do not rephrase sentences that are already correct.`;
}
