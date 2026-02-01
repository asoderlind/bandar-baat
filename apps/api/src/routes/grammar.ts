import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, type AuthContext } from "../lib/middleware.js";
import { db } from "../db/index.js";
import { grammarConcepts, userGrammars } from "../db/schema.js";
import type { CEFRLevel, GrammarStatus } from "@monke-say/shared";

export const grammarRoutes = new Hono<{ Variables: AuthContext }>();

// All routes require authentication
grammarRoutes.use("*", requireAuth);

/**
 * GET /api/grammar
 * List grammar concepts with user progress
 */
grammarRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const level = c.req.query("level") as CEFRLevel | undefined;
    const status = c.req.query("status") as GrammarStatus | undefined;

    const conditions: any[] = [];
    if (level) {
      conditions.push(eq(grammarConcepts.cefrLevel, level));
    }

    const concepts =
      conditions.length > 0
        ? await db
            .select()
            .from(grammarConcepts)
            .where(and(...conditions))
            .orderBy(grammarConcepts.sortOrder)
        : await db
            .select()
            .from(grammarConcepts)
            .orderBy(grammarConcepts.sortOrder);

    // Get user progress
    const conceptIds = concepts.map((c) => c.id);
    const userGrammarResults =
      conceptIds.length > 0
        ? await db
            .select()
            .from(userGrammars)
            .where(
              and(
                eq(userGrammars.userId, user.id),
                inArray(userGrammars.grammarConceptId, conceptIds),
              ),
            )
        : [];

    const userGrammarMap = new Map(
      userGrammarResults.map((ug) => [ug.grammarConceptId, ug]),
    );

    const response = concepts
      .map((concept) => {
        const userGrammar = userGrammarMap.get(concept.id);
        const conceptStatus = userGrammar?.status || "LOCKED";

        if (status && conceptStatus !== status) {
          return null;
        }

        return {
          id: concept.id,
          name: concept.name,
          slug: concept.slug,
          description: concept.description,
          cefrLevel: concept.cefrLevel,
          sortOrder: concept.sortOrder,
          examples: concept.examplesJson || [],
          prerequisiteIds: concept.prerequisiteIds || [],
          createdAt: concept.createdAt.toISOString(),
          userProgress: userGrammar
            ? {
                id: userGrammar.id,
                status: userGrammar.status,
                introducedAt: userGrammar.introducedAt?.toISOString(),
                comfortScore: userGrammar.comfortScore,
              }
            : null,
        };
      })
      .filter((c) => c !== null);

    return c.json({ success: true, data: response });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/grammar/:conceptId
 * Get a specific grammar concept
 */
grammarRoutes.get("/:conceptId", async (c) => {
  try {
    const user = c.get("user");
    const conceptId = c.req.param("conceptId");

    const [concept] = await db
      .select()
      .from(grammarConcepts)
      .where(eq(grammarConcepts.id, conceptId));

    if (!concept) {
      return c.json(
        { success: false, error: "Grammar concept not found" },
        404,
      );
    }

    const [userGrammar] = await db
      .select()
      .from(userGrammars)
      .where(
        and(
          eq(userGrammars.userId, user.id),
          eq(userGrammars.grammarConceptId, conceptId),
        ),
      );

    return c.json({
      success: true,
      data: {
        id: concept.id,
        name: concept.name,
        slug: concept.slug,
        description: concept.description,
        cefrLevel: concept.cefrLevel,
        sortOrder: concept.sortOrder,
        examples: concept.examplesJson || [],
        prerequisiteIds: concept.prerequisiteIds || [],
        createdAt: concept.createdAt.toISOString(),
        userProgress: userGrammar
          ? {
              id: userGrammar.id,
              status: userGrammar.status,
              introducedAt: userGrammar.introducedAt?.toISOString(),
              comfortScore: userGrammar.comfortScore,
            }
          : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/grammar/:conceptId/unlock
 * Unlock a grammar concept
 */
grammarRoutes.post("/:conceptId/unlock", async (c) => {
  try {
    const user = c.get("user");
    const conceptId = c.req.param("conceptId");

    // Check if concept exists
    const [concept] = await db
      .select()
      .from(grammarConcepts)
      .where(eq(grammarConcepts.id, conceptId));

    if (!concept) {
      return c.json(
        { success: false, error: "Grammar concept not found" },
        404,
      );
    }

    // Check prerequisites
    if (concept.prerequisiteIds && concept.prerequisiteIds.length > 0) {
      const prereqProgress = await db
        .select()
        .from(userGrammars)
        .where(
          and(
            eq(userGrammars.userId, user.id),
            inArray(userGrammars.grammarConceptId, concept.prerequisiteIds),
          ),
        );

      const learnedPrereqs = prereqProgress.filter(
        (p) => p.status === "LEARNED",
      ).length;

      if (learnedPrereqs < concept.prerequisiteIds.length) {
        return c.json(
          { success: false, error: "Prerequisites not completed" },
          400,
        );
      }
    }

    // Upsert user grammar
    const [existing] = await db
      .select()
      .from(userGrammars)
      .where(
        and(
          eq(userGrammars.userId, user.id),
          eq(userGrammars.grammarConceptId, conceptId),
        ),
      );

    if (existing) {
      await db
        .update(userGrammars)
        .set({ status: "AVAILABLE" })
        .where(eq(userGrammars.id, existing.id));
    } else {
      await db.insert(userGrammars).values({
        userId: user.id,
        grammarConceptId: conceptId,
        status: "AVAILABLE",
      });
    }

    return c.json({ success: true, message: "Grammar concept unlocked" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});
