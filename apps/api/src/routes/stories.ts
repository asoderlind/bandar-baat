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
import { buildStoryGenerationPrompt } from "../lib/prompts.js";
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
            .limit(5)
        : db.select().from(words).where(eq(words.cefrLevel, level)).limit(5);

    const availableNewWords = await newWordsQuery;

    return c.json({
      success: true,
      data: {
        ready: availableNewWords.length >= 3,
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

      // Determine difficulty level
      let level = request.difficultyOverride;
      if (!level) {
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

        if (wordsKnown < 50) level = "A1";
        else if (wordsKnown < 150) level = "A2";
        else if (wordsKnown < 400) level = "B1";
        else level = "B2";
      }

      // Get known vocabulary
      const knownWordsResult = await db
        .select({ word: words })
        .from(userWords)
        .innerJoin(words, eq(userWords.wordId, words.id))
        .where(
          and(
            eq(userWords.userId, user.id),
            inArray(userWords.status, ["KNOWN", "MASTERED", "LEARNING"]),
          ),
        )
        .limit(300);

      const knownWords = knownWordsResult.map((r) => r.word);

      // Get new words to introduce
      const knownWordIds = knownWords.map((w) => w.id);
      const newWordsQuery =
        knownWordIds.length > 0
          ? db
              .select()
              .from(words)
              .where(
                and(
                  eq(words.cefrLevel, level),
                  notInArray(words.id, knownWordIds),
                ),
              )
              .limit(5)
          : db.select().from(words).where(eq(words.cefrLevel, level)).limit(5);

      const newWords = await newWordsQuery;

      // Get grammar concepts
      const grammarResults = await db
        .select({ grammar: grammarConcepts })
        .from(userGrammars)
        .innerJoin(
          grammarConcepts,
          eq(userGrammars.grammarConceptId, grammarConcepts.id),
        )
        .where(
          and(
            eq(userGrammars.userId, user.id),
            inArray(userGrammars.status, ["LEARNING", "AVAILABLE"]),
          ),
        )
        .orderBy(grammarConcepts.sortOrder)
        .limit(2);

      const grammar = grammarResults.map((r) => r.grammar);

      // Build prompt
      const knownVocabStr = knownWords
        .slice(0, 200)
        .map((w) => `- ${w.hindi} (${w.romanized}) — ${w.english}`)
        .join("\n");

      const newVocabStr = newWords
        .map((w) => `- ${w.hindi} (${w.romanized}) — ${w.english}`)
        .join("\n");

      const grammarStr =
        grammar.length > 0
          ? grammar.map((g) => `- ${g.name}: ${g.description}`).join("\n")
          : "Basic sentence structure";

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

            // Add relationships
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

      // Build prompt using the factored-out function
      const prompt = buildStoryGenerationPrompt({
        level,
        topic,
        knownVocabulary: knownVocabStr,
        newVocabulary: newVocabStr,
        grammarConcepts: grammarStr,
        characters: characterStr || undefined,
      });

      // Call Claude API
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      // Parse response
      let storyData: any;
      try {
        let jsonText = responseText.trim();

        // Remove markdown code blocks more aggressively
        // Handle ```json or just ``` at start
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, "");
        // Handle trailing ```
        jsonText = jsonText.replace(/\n?```\s*$/i, "");
        jsonText = jsonText.trim();

        // Find the outermost JSON object
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

        storyData = JSON.parse(jsonText);
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
          targetNewWordIds: newWords.map((w) => w.id),
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
      for (const exerciseData of storyData.exercises || []) {
        await db.insert(exercises).values({
          storyId: story.id,
          type: exerciseData.type as ExerciseType,
          questionJson: exerciseData.question,
          correctAnswer:
            exerciseData.correctAnswer || exerciseData.correct_answer,
          options: exerciseData.options,
        });
      }

      // Link characters used in the story and update appearance counts
      if (
        storyData.characters_used &&
        Array.isArray(storyData.characters_used)
      ) {
        for (const charUsed of storyData.characters_used) {
          // Find matching character by name
          const matchedChar = userCharacters.find(
            (c) =>
              c.character.nameRomanized.toLowerCase() ===
                charUsed.name?.toLowerCase() ||
              c.character.nameHindi === charUsed.name,
          );

          if (matchedChar) {
            // Link character to story
            await db.insert(storyCharacters).values({
              storyId: story.id,
              characterId: matchedChar.character.id,
              roleInStory: charUsed.role || null,
            });

            // Update appearance count
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

      // Fetch created exercises
      const createdExercises = await db
        .select()
        .from(exercises)
        .where(eq(exercises.storyId, story.id));

      return c.json({
        success: true,
        data: {
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
          exercises: createdExercises.map((ex) => ({
            id: ex.id,
            storyId: ex.storyId,
            type: ex.type,
            question: ex.questionJson,
            correctAnswer: ex.correctAnswer,
            options: ex.options,
            createdAt: ex.createdAt.toISOString(),
          })),
        },
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
      data: {
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
      },
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
