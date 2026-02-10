import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  eq,
  and,
  sql,
  isNull,
  isNotNull,
  desc,
  inArray,
  notInArray,
} from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth, type AuthContext } from "../lib/middleware.js";
import {
  buildStoryGenerationPrompt,
  buildStoryImportPrompt,
  buildStoryValidationPrompt,
} from "../lib/prompts.js";
import { DEFAULT_NEW_WORDS_PER_STORY } from "@monke-say/shared";
import { db } from "../db/index.js";
import {
  stories,
  exercises,
  words,
  userWords,
  grammarConcepts,
  userGrammars,
  characters,
  characterRelationships,
  storyCharacters,
} from "../db/schema.js";
import type { CEFRLevel, StorySentence, ExerciseType } from "@monke-say/shared";

export const storiesRoutes = new Hono<{ Variables: AuthContext }>();

// All routes require authentication
storiesRoutes.use("*", requireAuth);

// ── Shared helpers ──────────────────────────────────────────

async function determineUserLevel(
  userId: string,
  override?: CEFRLevel,
): Promise<CEFRLevel> {
  if (override) return override;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(userWords)
    .where(
      and(
        eq(userWords.userId, userId),
        inArray(userWords.status, ["KNOWN", "MASTERED"]),
      ),
    );
  const wordsKnown = Number(result[0]?.count || 0);
  if (wordsKnown < 50) return "A1";
  if (wordsKnown < 150) return "A2";
  if (wordsKnown < 400) return "B1";
  return "B2";
}

async function getKnownWords(userId: string) {
  const results = await db
    .select({ word: words })
    .from(userWords)
    .innerJoin(words, eq(userWords.wordId, words.id))
    .where(
      and(
        eq(userWords.userId, userId),
        inArray(userWords.status, ["KNOWN", "MASTERED", "LEARNING"]),
      ),
    )
    .limit(300);
  return results.map((r) => r.word);
}

async function getActiveGrammar(userId: string) {
  const results = await db
    .select({ grammar: grammarConcepts })
    .from(userGrammars)
    .innerJoin(
      grammarConcepts,
      eq(userGrammars.grammarConceptId, grammarConcepts.id),
    )
    .where(
      and(
        eq(userGrammars.userId, userId),
        inArray(userGrammars.status, ["LEARNING", "AVAILABLE"]),
      ),
    )
    .orderBy(grammarConcepts.sortOrder)
    .limit(2);
  return results.map((r) => r.grammar);
}

function formatKnownVocabStr(
  knownWords: (typeof words.$inferSelect)[],
): string {
  return knownWords
    .slice(0, 200)
    .map((w) => `- ${w.hindi} (${w.romanized}) — ${w.english}`)
    .join("\n");
}

function formatGrammarStr(
  grammar: (typeof grammarConcepts.$inferSelect)[],
): string {
  return grammar.length > 0
    ? grammar.map((g) => `- ${g.name}: ${g.description}`).join("\n")
    : "Basic sentence structure";
}

function parseClaudeJsonResponse(responseText: string): any {
  let jsonText = responseText.trim();
  jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, "");
  jsonText = jsonText.replace(/\n?```\s*$/i, "");
  jsonText = jsonText.trim();

  let braceCount = 0;
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < jsonText.length; i++) {
    if (jsonText[i] === "{") {
      if (startIdx === -1) startIdx = i;
      braceCount++;
    } else if (jsonText[i] === "}") {
      braceCount--;
      if (braceCount === 0 && startIdx !== -1) {
        endIdx = i;
        break;
      }
    }
  }

  if (startIdx !== -1 && endIdx !== -1) {
    jsonText = jsonText.slice(startIdx, endIdx + 1);
  }

  return JSON.parse(jsonText);
}

function formatStoryResponse(
  story: typeof stories.$inferSelect,
  storyExercises: (typeof exercises.$inferSelect)[],
) {
  return {
    id: story.id,
    title: story.title,
    contentHindi: story.contentHindi,
    contentRomanized: story.contentRomanized,
    contentEnglish: story.contentEnglish,
    sentences: story.sentencesJson as StorySentence[],
    targetNewWordIds: story.targetNewWordIds || [],
    targetGrammarIds: story.targetGrammarIds || [],
    topic: story.topic,
    difficultyLevel: story.difficultyLevel,
    wordCount: story.wordCount,
    rating: story.rating,
    createdAt: story.createdAt.toISOString(),
    completedAt: story.completedAt?.toISOString(),
    exercises: storyExercises.map((ex) => ({
      id: ex.id,
      storyId: ex.storyId,
      type: ex.type,
      question: ex.questionJson,
      correctAnswer: ex.correctAnswer,
      options: ex.options,
      createdAt: ex.createdAt.toISOString(),
    })),
  };
}

async function runValidationPass(
  anthropic: Anthropic,
  storyData: any,
  level: CEFRLevel,
  topic: string,
) {
  if (!storyData.content_hindi || !storyData.content_english) return;

  try {
    const validationPrompt = buildStoryValidationPrompt({
      storyHindi: storyData.content_hindi,
      storyEnglish: storyData.content_english,
      level,
      topic,
    });

    const validationMessage = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: validationPrompt }],
    });

    const validationText =
      validationMessage.content[0].type === "text"
        ? validationMessage.content[0].text
        : "";

    let validationResult: any;
    try {
      validationResult = parseClaudeJsonResponse(validationText);
    } catch {
      console.warn("Validation JSON parse failed, skipping corrections");
      return;
    }

    if (validationResult?.hasIssues) {
      console.log(
        `Story validation found ${validationResult.issues?.length || 0} issues — applying corrections`,
      );
      if (validationResult.corrected_hindi) {
        storyData.content_hindi = validationResult.corrected_hindi;
      }
      if (validationResult.corrected_romanized) {
        storyData.content_romanized = validationResult.corrected_romanized;
      }
      if (validationResult.corrected_english) {
        storyData.content_english = validationResult.corrected_english;
      }
      if (
        validationResult.corrected_sentences &&
        Array.isArray(validationResult.corrected_sentences) &&
        storyData.sentences
      ) {
        for (const corrected of validationResult.corrected_sentences) {
          if (corrected.changed && storyData.sentences[corrected.index]) {
            const original = storyData.sentences[corrected.index];
            original.hindi = corrected.hindi || original.hindi;
            original.romanized = corrected.romanized || original.romanized;
            original.english = corrected.english || original.english;
          }
        }
      }
    } else {
      console.log("Story validation passed — no issues found");
    }
  } catch (validationError) {
    console.warn(
      "Grammar/cohesion validation failed, using original story:",
      validationError,
    );
  }
}

async function createExercises(storyId: string, exercisesData: any[]) {
  for (const exerciseData of exercisesData || []) {
    await db.insert(exercises).values({
      storyId,
      type: exerciseData.type as ExerciseType,
      questionJson: exerciseData.question,
      correctAnswer: exerciseData.correctAnswer || exerciseData.correct_answer,
      options: exerciseData.options,
    });
  }
  return db.select().from(exercises).where(eq(exercises.storyId, storyId));
}

/**
 * GET /api/stories
 * List user's stories
 */
storiesRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const completed = c.req.query("completed");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const offset = parseInt(c.req.query("offset") || "0");

    const conditions: any[] = [eq(stories.userId, user.id)];

    if (completed === "true") {
      conditions.push(isNotNull(stories.completedAt));
    } else if (completed === "false") {
      conditions.push(isNull(stories.completedAt));
    }

    const storyResults = await db
      .select()
      .from(stories)
      .where(and(...conditions))
      .orderBy(desc(stories.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: storyResults.map((story) => ({
        id: story.id,
        title: story.title,
        topic: story.topic,
        difficultyLevel: story.difficultyLevel,
        wordCount: story.wordCount,
        completedAt: story.completedAt?.toISOString(),
        createdAt: story.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/stories/ready
 * Get information about the next story to generate
 */
storiesRoutes.get("/ready", async (c) => {
  try {
    const user = c.get("user");

    // Count known words
    const knownWordsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userWords)
      .where(
        and(
          eq(userWords.userId, user.id),
          inArray(userWords.status, ["KNOWN", "MASTERED"]),
        ),
      );

    const wordsKnown = Number(knownWordsResult[0]?.count || 0);

    // Determine level
    let level: CEFRLevel;
    if (wordsKnown < 50) {
      level = "A1";
    } else if (wordsKnown < 150) {
      level = "A2";
    } else if (wordsKnown < 400) {
      level = "B1";
    } else {
      level = "B2";
    }

    // Get available new words
    const knownWordIds = await db
      .select({ wordId: userWords.wordId })
      .from(userWords)
      .where(eq(userWords.userId, user.id));

    const knownIds = knownWordIds.map((w) => w.wordId);

    const newWordsQuery =
      knownIds.length > 0
        ? db
            .select()
            .from(words)
            .where(
              and(eq(words.cefrLevel, level), notInArray(words.id, knownIds)),
            )
            .limit(DEFAULT_NEW_WORDS_PER_STORY)
        : db
            .select()
            .from(words)
            .where(eq(words.cefrLevel, level))
            .limit(DEFAULT_NEW_WORDS_PER_STORY);

    const availableNewWords = await newWordsQuery;

    return c.json({
      success: true,
      data: {
        ready: availableNewWords.length >= 1,
        level,
        newWordsAvailable: availableNewWords.length,
        suggestedTopic: "daily life",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

const generateStorySchema = z.object({
  topic: z.string().optional(),
  includeWordIds: z.array(z.string()).optional(),
  focusGrammarId: z.string().optional(),
  difficultyOverride: z.enum(["A1", "A2", "B1", "B2"]).optional(),
});

/**
 * POST /api/stories/generate
 * Generate a new story using Claude
 */
storiesRoutes.post(
  "/generate",
  zValidator("json", generateStorySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const request = c.req.valid("json");

      const level = await determineUserLevel(
        user.id,
        request.difficultyOverride,
      );
      const knownWords = await getKnownWords(user.id);
      const grammar = await getActiveGrammar(user.id);

      const knownVocabStr = formatKnownVocabStr(knownWords);
      const grammarStr = formatGrammarStr(grammar);
      const topic = request.topic || "daily life";

      // Get user's recurring characters for story continuity
      const userCharacters = await db
        .select({
          character: characters,
        })
        .from(characters)
        .where(
          and(eq(characters.userId, user.id), eq(characters.isActive, true)),
        )
        .orderBy(desc(characters.appearanceCount))
        .limit(5);

      // Get relationships for these characters
      const characterIds = userCharacters.map((c) => c.character.id);
      let relationshipsData: Array<{
        relationship: typeof characterRelationships.$inferSelect;
        relatedChar: typeof characters.$inferSelect;
      }> = [];

      if (characterIds.length > 0) {
        relationshipsData = await db
          .select({
            relationship: characterRelationships,
            relatedChar: characters,
          })
          .from(characterRelationships)
          .innerJoin(
            characters,
            eq(characterRelationships.relatedCharacterId, characters.id),
          )
          .where(inArray(characterRelationships.characterId, characterIds));
      }

      // Build character context string
      let characterStr = "";
      if (userCharacters.length > 0) {
        characterStr = userCharacters
          .map((c) => {
            const char = c.character;
            let desc = `- ${char.nameHindi} (${char.nameRomanized})`;
            if (char.age) desc += `, ${char.age} years old`;
            if (char.occupation)
              desc += `, ${char.occupationHindi || char.occupation}`;
            if (char.personalityTraits && char.personalityTraits.length > 0) {
              desc += ` — ${char.personalityTraits.slice(0, 3).join(", ")}`;
            }

            const rels = relationshipsData.filter(
              (r) => r.relationship.characterId === char.id,
            );
            if (rels.length > 0) {
              const relStr = rels
                .map(
                  (r) =>
                    `${r.relationship.relationshipType} of ${r.relatedChar.nameRomanized}`,
                )
                .join(", ");
              desc += ` [${relStr}]`;
            }

            return desc;
          })
          .join("\n");
      }

      const prompt = buildStoryGenerationPrompt({
        level,
        topic,
        knownVocabulary: knownVocabStr,
        grammarConcepts: grammarStr,
        characters: characterStr || undefined,
      });

      // Call Claude API
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      let storyData: any;
      try {
        storyData = parseClaudeJsonResponse(responseText);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        console.error("Raw response:", responseText.substring(0, 500));
        storyData = {
          title: "Generated Story",
          content_hindi: "",
          content_romanized: "",
          content_english: "",
          word_count: 0,
          sentences: [],
          exercises: [],
        };
      }

      // Grammar & cohesion validation pass
      await runValidationPass(anthropic, storyData, level, topic);

      // Post-generation word matching: find words marked isNew by Claude
      const genNewWordSet = new Map<
        string,
        { hindi: string; romanized: string; english: string; partOfSpeech?: string }
      >();
      for (const sentence of storyData.sentences || []) {
        for (const word of sentence.words || []) {
          if (word.isNew && !genNewWordSet.has(word.hindi)) {
            genNewWordSet.set(word.hindi, word);
          }
        }
      }

      const generatedNewWordIds: string[] = [];
      const validPOS = new Set([
        "NOUN", "VERB", "ADJECTIVE", "ADVERB",
        "POSTPOSITION", "PARTICLE", "PRONOUN", "CONJUNCTION",
      ]);

      for (const [hindi, wordInfo] of genNewWordSet) {
        const [dbWord] = await db
          .select()
          .from(words)
          .where(eq(words.hindi, hindi))
          .limit(1);

        if (dbWord) {
          const [existingUserWord] = await db
            .select()
            .from(userWords)
            .where(
              and(
                eq(userWords.userId, user.id),
                eq(userWords.wordId, dbWord.id),
                inArray(userWords.status, ["KNOWN", "MASTERED"]),
              ),
            );

          if (existingUserWord) {
            for (const s of storyData.sentences || []) {
              for (const w of s.words || []) {
                if (w.hindi === hindi) w.isNew = false;
              }
            }
          } else {
            generatedNewWordIds.push(dbWord.id);
          }
        } else {
          const rawPos = wordInfo.partOfSpeech?.toUpperCase() ?? "";
          const pos = validPOS.has(rawPos) ? rawPos : "NOUN";
          try {
            const [newWord] = await db
              .insert(words)
              .values({
                hindi: wordInfo.hindi,
                romanized: wordInfo.romanized || "",
                english: wordInfo.english || "",
                partOfSpeech: pos as any,
                cefrLevel: level,
                tags: ["generated"],
              })
              .returning();
            generatedNewWordIds.push(newWord.id);
          } catch (insertError) {
            console.warn(`Failed to insert word "${hindi}":`, insertError);
          }
        }
      }

      // Create story in database
      const [story] = await db
        .insert(stories)
        .values({
          userId: user.id,
          title: storyData.title || "Generated Story",
          contentHindi: storyData.content_hindi || "",
          contentRomanized: storyData.content_romanized || "",
          contentEnglish: storyData.content_english || "",
          sentencesJson: storyData.sentences || [],
          targetNewWordIds: generatedNewWordIds,
          targetGrammarIds: grammar.map((g) => g.id),
          topic,
          difficultyLevel: level,
          wordCount: storyData.word_count || 0,
          generationPrompt: prompt,
          llmModel: "claude-sonnet-4-20250514",
          llmResponseRaw: { content: responseText },
        })
        .returning();

      // Create exercises
      const createdExercises = await createExercises(
        story.id,
        storyData.exercises,
      );

      // Link characters used in the story and update appearance counts
      if (
        storyData.characters_used &&
        Array.isArray(storyData.characters_used)
      ) {
        for (const charUsed of storyData.characters_used) {
          const matchedChar = userCharacters.find(
            (c) =>
              c.character.nameRomanized.toLowerCase() ===
                charUsed.name?.toLowerCase() ||
              c.character.nameHindi === charUsed.name,
          );

          if (matchedChar) {
            await db.insert(storyCharacters).values({
              storyId: story.id,
              characterId: matchedChar.character.id,
              roleInStory: charUsed.role || null,
            });

            await db
              .update(characters)
              .set({
                appearanceCount: matchedChar.character.appearanceCount + 1,
                updatedAt: new Date(),
              })
              .where(eq(characters.id, matchedChar.character.id));
          }
        }
      }

      return c.json({
        success: true,
        data: formatStoryResponse(story, createdExercises),
      });
    } catch (error) {
      console.error("Story generation error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.toLowerCase().includes("credit balance")) {
        return c.json(
          {
            success: false,
            error: "Story generation service temporarily unavailable",
          },
          503,
        );
      }

      return c.json({ success: false, error: message }, 500);
    }
  },
);

const importStorySchema = z.object({
  text: z.string().min(10).max(10000),
  topic: z.string().optional(),
});

/**
 * POST /api/stories/import
 * Import and process a Hindi story using Claude
 */
storiesRoutes.post(
  "/import",
  zValidator("json", importStorySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const request = c.req.valid("json");

      const level = await determineUserLevel(user.id);
      const knownWords = await getKnownWords(user.id);
      const grammar = await getActiveGrammar(user.id);

      const knownVocabStr = formatKnownVocabStr(knownWords);
      const grammarStr = formatGrammarStr(grammar);
      const topic = request.topic || "imported";

      const prompt = buildStoryImportPrompt({
        level,
        importedText: request.text,
        knownVocabulary: knownVocabStr,
        grammarConcepts: grammarStr,
      });

      // Call Claude API
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      let storyData: any;
      try {
        storyData = parseClaudeJsonResponse(responseText);
      } catch (parseError) {
        console.error("Import JSON parse error:", parseError);
        console.error("Raw response:", responseText.substring(0, 500));
        storyData = {
          title: "Imported Story",
          content_hindi: request.text,
          content_romanized: "",
          content_english: "",
          word_count: 0,
          sentences: [],
          exercises: [],
        };
      }

      // Word matching: compare Claude's isNew annotations against the DB
      const newWordHindiSet = new Map<
        string,
        { hindi: string; romanized: string; english: string; partOfSpeech?: string }
      >();
      for (const sentence of storyData.sentences || []) {
        for (const word of sentence.words || []) {
          if (word.isNew && !newWordHindiSet.has(word.hindi)) {
            newWordHindiSet.set(word.hindi, word);
          }
        }
      }

      const matchedNewWordIds: string[] = [];
      const validPartOfSpeech = new Set([
        "NOUN", "VERB", "ADJECTIVE", "ADVERB",
        "POSTPOSITION", "PARTICLE", "PRONOUN", "CONJUNCTION",
      ]);

      for (const [hindi, wordInfo] of newWordHindiSet) {
        const [dbWord] = await db
          .select()
          .from(words)
          .where(eq(words.hindi, hindi))
          .limit(1);

        if (dbWord) {
          // Check if user already knows this word
          const [existingUserWord] = await db
            .select()
            .from(userWords)
            .where(
              and(
                eq(userWords.userId, user.id),
                eq(userWords.wordId, dbWord.id),
                inArray(userWords.status, ["KNOWN", "MASTERED"]),
              ),
            );

          if (existingUserWord) {
            // User already knows it — unmark isNew in sentence data
            for (const sentence of storyData.sentences || []) {
              for (const w of sentence.words || []) {
                if (w.hindi === hindi) w.isNew = false;
              }
            }
          } else {
            // Word exists in DB but user doesn't know it yet
            matchedNewWordIds.push(dbWord.id);
          }
        } else {
          // Word not in DB — auto-create it from Claude's annotations
          const rawPos = wordInfo.partOfSpeech?.toUpperCase() ?? "";
          const pos = validPartOfSpeech.has(rawPos) ? rawPos : "NOUN";
          try {
            const [newWord] = await db
              .insert(words)
              .values({
                hindi: wordInfo.hindi,
                romanized: wordInfo.romanized || "",
                english: wordInfo.english || "",
                partOfSpeech: pos as any,
                cefrLevel: level,
                tags: ["imported"],
              })
              .returning();
            matchedNewWordIds.push(newWord.id);
          } catch (insertError) {
            console.warn(`Failed to insert word "${hindi}":`, insertError);
          }
        }
      }

      // Skip validation pass for imported stories — we preserve the original text
      // and should not let the validator rewrite/paraphrase user-provided content.

      // Create story in database
      const [story] = await db
        .insert(stories)
        .values({
          userId: user.id,
          title: storyData.title || "Imported Story",
          contentHindi: storyData.content_hindi || request.text,
          contentRomanized: storyData.content_romanized || "",
          contentEnglish: storyData.content_english || "",
          sentencesJson: storyData.sentences || [],
          targetNewWordIds: matchedNewWordIds,
          targetGrammarIds: grammar.map((g) => g.id),
          topic,
          difficultyLevel: level,
          wordCount: storyData.word_count || 0,
          generationPrompt: prompt,
          llmModel: "claude-sonnet-4-20250514",
          llmResponseRaw: { content: responseText },
        })
        .returning();

      // Create exercises
      const createdExercises = await createExercises(
        story.id,
        storyData.exercises,
      );

      return c.json({
        success: true,
        data: formatStoryResponse(story, createdExercises),
      });
    } catch (error) {
      console.error("Story import error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.toLowerCase().includes("credit balance")) {
        return c.json(
          {
            success: false,
            error: "Story processing service temporarily unavailable",
          },
          503,
        );
      }

      return c.json({ success: false, error: message }, 500);
    }
  },
);

/**
 * GET /api/stories/:storyId
 * Get a specific story
 */
storiesRoutes.get("/:storyId", async (c) => {
  try {
    const user = c.get("user");
    const storyId = c.req.param("storyId");

    const [story] = await db
      .select()
      .from(stories)
      .where(and(eq(stories.id, storyId), eq(stories.userId, user.id)));

    if (!story) {
      return c.json({ success: false, error: "Story not found" }, 404);
    }

    // Get exercises
    const storyExercises = await db
      .select()
      .from(exercises)
      .where(eq(exercises.storyId, storyId));

    return c.json({
      success: true,
      data: formatStoryResponse(story, storyExercises),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

const completeStorySchema = z.object({
  rating: z.number().min(1).max(5).optional(),
});

/**
 * POST /api/stories/:storyId/complete
 * Mark a story as complete
 */
storiesRoutes.post(
  "/:storyId/complete",
  zValidator("json", completeStorySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const storyId = c.req.param("storyId");
      const { rating } = c.req.valid("json");

      const [story] = await db
        .select()
        .from(stories)
        .where(and(eq(stories.id, storyId), eq(stories.userId, user.id)));

      if (!story) {
        return c.json({ success: false, error: "Story not found" }, 404);
      }

      await db
        .update(stories)
        .set({
          completedAt: new Date(),
          rating: rating,
        })
        .where(eq(stories.id, storyId));

      // Update user word progress for new words introduced
      if (story.targetNewWordIds && story.targetNewWordIds.length > 0) {
        for (const wordId of story.targetNewWordIds) {
          const [existing] = await db
            .select()
            .from(userWords)
            .where(
              and(eq(userWords.userId, user.id), eq(userWords.wordId, wordId)),
            );

          if (existing) {
            await db
              .update(userWords)
              .set({
                timesSeen: existing.timesSeen + 1,
                lastSeenAt: new Date(),
                status:
                  existing.status === "NEW" ? "LEARNING" : existing.status,
                // Set nextReviewAt if not already set
                nextReviewAt: existing.nextReviewAt || new Date(),
              })
              .where(eq(userWords.id, existing.id));
          } else {
            await db.insert(userWords).values({
              userId: user.id,
              wordId: wordId,
              status: "LEARNING",
              source: "STORY",
              timesSeen: 1,
              lastSeenAt: new Date(),
              nextReviewAt: new Date(), // Due immediately for first review
            });
          }
        }
      }

      return c.json({ success: true, message: "Story completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ success: false, error: message }, 500);
    }
  },
);

/**
 * DELETE /api/stories/:storyId
 * Delete a story
 */
storiesRoutes.delete("/:storyId", async (c) => {
  try {
    const user = c.get("user");
    const storyId = c.req.param("storyId");

    // Verify user owns the story
    const [story] = await db
      .select()
      .from(stories)
      .where(and(eq(stories.id, storyId), eq(stories.userId, user.id)));

    if (!story) {
      return c.json({ success: false, error: "Story not found" }, 404);
    }

    // Delete story (exercises will cascade)
    await db.delete(stories).where(eq(stories.id, storyId));

    return c.json({ success: true, message: "Story deleted" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});
