import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth, type AuthContext } from "../lib/middleware.js";
import { db } from "../db/index.js";
import { exercises, exerciseAttempts, userWords, stories } from "../db/schema.js";

export const exercisesRoutes = new Hono<{ Variables: AuthContext }>();

// All routes require authentication
exercisesRoutes.use("*", requireAuth);

/**
 * GET /api/exercises/:exerciseId
 * Get a specific exercise
 */
exercisesRoutes.get("/:exerciseId", async (c) => {
  try {
    const exerciseId = c.req.param("exerciseId");

    const [exercise] = await db
      .select()
      .from(exercises)
      .where(eq(exercises.id, exerciseId));

    if (!exercise) {
      return c.json({ success: false, error: "Exercise not found" }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: exercise.id,
        storyId: exercise.storyId,
        type: exercise.type,
        question: exercise.questionJson,
        options: exercise.options,
        createdAt: exercise.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

const submitAnswerSchema = z.object({
  answer: z.string(),
  timeSpentSeconds: z.number().optional(),
});

/**
 * POST /api/exercises/:exerciseId/submit
 * Submit an answer to an exercise
 */
exercisesRoutes.post(
  "/:exerciseId/submit",
  zValidator("json", submitAnswerSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const exerciseId = c.req.param("exerciseId");
      const { answer, timeSpentSeconds } = c.req.valid("json");

      const [exercise] = await db
        .select()
        .from(exercises)
        .where(eq(exercises.id, exerciseId));

      if (!exercise) {
        return c.json({ success: false, error: "Exercise not found" }, 404);
      }

      // Check if correct
      const normalizedAnswer = answer.toLowerCase().trim();
      const normalizedCorrect = exercise.correctAnswer.toLowerCase().trim();
      const isCorrect = normalizedAnswer === normalizedCorrect;

      let feedback: string | undefined;

      // For translation exercises, use Claude to evaluate if not exact match
      if (
        !isCorrect &&
        (exercise.type === "TRANSLATE_TO_HINDI" ||
          exercise.type === "TRANSLATE_TO_ENGLISH")
      ) {
        try {
          const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
          });

          const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 200,
            messages: [
              {
                role: "user",
                content: `A Hindi language learner submitted this translation:
                
Question: ${JSON.stringify(exercise.questionJson)}
Expected answer: "${exercise.correctAnswer}"
Student's answer: "${answer}"

Is the student's answer acceptable (semantically equivalent)? 
Reply with JSON: {"acceptable": true/false, "feedback": "brief explanation"}`,
              },
            ],
          });

          const responseText =
            message.content[0].type === "text" ? message.content[0].text : "";

          try {
            const evaluation = JSON.parse(responseText);
            if (evaluation.acceptable) {
              // Accept the answer
              feedback = evaluation.feedback;
            } else {
              feedback = evaluation.feedback;
            }
          } catch {
            // Keep original isCorrect value
          }
        } catch (err) {
          console.error("Claude evaluation error:", err);
        }
      }

      // Record attempt
      await db.insert(exerciseAttempts).values({
        userId: user.id,
        exerciseId: exerciseId,
        userAnswer: answer,
        isCorrect: isCorrect,
        feedback: feedback,
        timeSpentSeconds: timeSpentSeconds,
      });

      // Update word progress if this exercise targets a word
      if (exercise.targetWordId) {
        const [userWord] = await db
          .select()
          .from(userWords)
          .where(
            and(
              eq(userWords.userId, user.id),
              eq(userWords.wordId, exercise.targetWordId)
            )
          );

        if (userWord) {
          const newTimesReviewed = userWord.timesReviewed + 1;
          const newTimesCorrect = isCorrect
            ? userWord.timesCorrect + 1
            : userWord.timesCorrect;
          const newFamiliarity = Math.min(
            1,
            newTimesCorrect / Math.max(1, newTimesReviewed)
          );

          await db
            .update(userWords)
            .set({
              timesReviewed: newTimesReviewed,
              timesCorrect: newTimesCorrect,
              familiarity: newFamiliarity,
              lastSeenAt: new Date(),
            })
            .where(eq(userWords.id, userWord.id));
        }
      }

      return c.json({
        success: true,
        data: {
          isCorrect,
          correctAnswer: exercise.correctAnswer,
          feedback,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ success: false, error: message }, 500);
    }
  }
);

/**
 * GET /api/exercises/story/:storyId
 * Get all exercises for a story
 */
exercisesRoutes.get("/story/:storyId", async (c) => {
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

    const storyExercises = await db
      .select()
      .from(exercises)
      .where(eq(exercises.storyId, storyId));

    return c.json({
      success: true,
      data: storyExercises.map((ex) => ({
        id: ex.id,
        storyId: ex.storyId,
        type: ex.type,
        question: ex.questionJson,
        options: ex.options,
        createdAt: ex.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});
