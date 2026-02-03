import type { CEFRLevel } from "@monke-say/shared";

export interface StoryGenerationContext {
  level: CEFRLevel;
  topic: string;
  knownVocabulary: string;
  newVocabulary: string;
  grammarConcepts: string;
  characters?: string;
}

/**
 * Generates the story generation prompt for Claude.
 * Factored out for easy tweaking and maintenance.
 */
export function buildStoryGenerationPrompt(
  ctx: StoryGenerationContext,
): string {
  const characterSection = ctx.characters
    ? `
RECURRING CHARACTERS (use these when appropriate for continuity):
${ctx.characters}
Feel free to develop their personalities and relationships naturally. You may introduce new minor characters as needed.
`
    : "";

  return `You are a Hindi language teaching assistant creating immersive reading content for language learners.

Generate a short story for a learner at ${ctx.level} level. The story should read naturally, like a passage from a book—not a list of disconnected sentences.

KNOWN VOCABULARY (the learner can read these comfortably):
${ctx.knownVocabulary || "Basic greetings, pronouns, and common verbs"}

NEW WORDS TO INTRODUCE (weave each naturally into the story, appearing 2-3 times):
${ctx.newVocabulary}

GRAMMAR TO PRACTICE:
${ctx.grammarConcepts}

TOPIC/THEME: ${ctx.topic}
${characterSection}
STYLE GUIDELINES:
- Write 12-18 sentences that flow together as cohesive prose
- Vary sentence length and structure for natural rhythm
- Use descriptive narration, inner thoughts, and dialogue as appropriate to the story
- Don't force dialogue—only include it when it serves the narrative
- Build a mini story arc: setup → development → resolution
- Show, don't tell: use sensory details and specific actions
- Transitions between sentences should feel natural and connected

LANGUAGE CONSTRAINTS:
- Use only known vocabulary + new words (proper nouns like names are OK)
- Each new word should appear at least twice in different contexts
- Keep individual sentences clear, but let them build on each other
- Match complexity to ${ctx.level} level

Return your response as valid JSON with this exact structure:
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
}

EXERCISE TYPES (generate 4-6 varied exercises):
- COMPREHENSION: Questions about story meaning, character motivations, or plot
- FILL_BLANK: Complete a sentence from the story with the correct word
- TRANSLATE_TO_HINDI: Translate an English phrase/sentence to Hindi
- TRANSLATE_TO_ENGLISH: Translate a Hindi phrase/sentence to English  
- MULTIPLE_CHOICE: Vocabulary or grammar questions with 4 options

Focus exercises on the new vocabulary and grammar concepts being practiced.`;
}
