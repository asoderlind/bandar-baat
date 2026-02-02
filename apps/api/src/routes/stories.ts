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
import { db } from "../db/index.js";
import {
  stories,
  exercises,
  words,
  userWords,
  grammarConcepts,
  userGrammars,
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

      const prompt = `You are a Hindi language teaching assistant. Generate a short story for a language learner at ${level} level.

KNOWN VOCABULARY (the learner can read these):
${knownVocabStr || "Basic greetings and pronouns"}

NEW WORDS TO INTRODUCE (use each at least twice):
${newVocabStr}

GRAMMAR TO PRACTICE:
${grammarStr}

TOPIC: ${topic}

CONSTRAINTS:
- 8-12 sentences long
- Use only known vocabulary + new words (proper nouns like names are OK)
- Every new word must appear at least twice in different sentences
- Include 1-2 lines of dialogue
- Keep sentences simple and clear

Return your response as valid JSON with this exact structure:
{
  "title": "Story title in Hindi and English",
  "content_hindi": "Full story in Devanagari",
  "content_romanized": "Full story romanized",
  "content_english": "English translation",
  "word_count": number,
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
          "isNew": true/false,
          "partOfSpeech": "NOUN/VERB/etc"
        }
      ],
      "grammarNotes": ["Optional grammar explanations"]
    }
  ],
  "exercises": [
    {
      "type": "COMPREHENSION/FILL_BLANK/TRANSLATE_TO_HINDI/TRANSLATE_TO_ENGLISH/MULTIPLE_CHOICE",
      "question": {
        "prompt": "Question text",
        "context": "Optional context",
        "sentenceIndex": 0
      },
      "correctAnswer": "The correct answer",
      "options": ["option1", "option2", "option3", "option4"]
    }
  ]
}

Generate 4-6 exercises mixing comprehension and vocabulary practice.`;

      // Call Claude API
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      // Parse response
      let storyData: any;
      try {
        let jsonText = responseText.trim();

        // Extract JSON from code blocks (more robust extraction)
        const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1].trim();
        }

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
