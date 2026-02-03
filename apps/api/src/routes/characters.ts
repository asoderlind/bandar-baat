import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, type AuthContext } from "../lib/middleware.js";
import { db } from "../db/index.js";
import {
  characters,
  characterRelationships,
  storyCharacters,
  stories,
} from "../db/schema.js";

export const charactersRoutes = new Hono<{ Variables: AuthContext }>();

// All routes require authentication
charactersRoutes.use("*", requireAuth);

/**
 * GET /api/characters
 * List user's characters
 */
charactersRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const activeOnly = c.req.query("active") !== "false";

    const conditions = [eq(characters.userId, user.id)];
    if (activeOnly) {
      conditions.push(eq(characters.isActive, true));
    }

    const userCharacters = await db
      .select()
      .from(characters)
      .where(and(...conditions))
      .orderBy(desc(characters.appearanceCount));

    return c.json({
      success: true,
      data: userCharacters.map((char) => ({
        id: char.id,
        nameHindi: char.nameHindi,
        nameRomanized: char.nameRomanized,
        nameEnglish: char.nameEnglish,
        age: char.age,
        gender: char.gender,
        occupation: char.occupation,
        occupationHindi: char.occupationHindi,
        hobbies: char.hobbies,
        personalityTraits: char.personalityTraits,
        backstory: char.backstory,
        imageUrl: char.imageUrl,
        isActive: char.isActive,
        appearanceCount: char.appearanceCount,
        createdAt: char.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/characters/:characterId
 * Get a specific character with relationships
 */
charactersRoutes.get("/:characterId", async (c) => {
  try {
    const user = c.get("user");
    const characterId = c.req.param("characterId");

    const [character] = await db
      .select()
      .from(characters)
      .where(
        and(eq(characters.id, characterId), eq(characters.userId, user.id)),
      );

    if (!character) {
      return c.json({ success: false, error: "Character not found" }, 404);
    }

    // Get relationships
    const relationships = await db
      .select({
        relationship: characterRelationships,
        relatedCharacter: characters,
      })
      .from(characterRelationships)
      .innerJoin(
        characters,
        eq(characterRelationships.relatedCharacterId, characters.id),
      )
      .where(eq(characterRelationships.characterId, characterId));

    // Get story appearances
    const appearances = await db
      .select({
        storyCharacter: storyCharacters,
        story: stories,
      })
      .from(storyCharacters)
      .innerJoin(stories, eq(storyCharacters.storyId, stories.id))
      .where(eq(storyCharacters.characterId, characterId))
      .orderBy(desc(stories.createdAt))
      .limit(10);

    return c.json({
      success: true,
      data: {
        id: character.id,
        nameHindi: character.nameHindi,
        nameRomanized: character.nameRomanized,
        nameEnglish: character.nameEnglish,
        age: character.age,
        gender: character.gender,
        occupation: character.occupation,
        occupationHindi: character.occupationHindi,
        hobbies: character.hobbies,
        personalityTraits: character.personalityTraits,
        backstory: character.backstory,
        imageUrl: character.imageUrl,
        isActive: character.isActive,
        appearanceCount: character.appearanceCount,
        createdAt: character.createdAt.toISOString(),
        relationships: relationships.map((r) => ({
          id: r.relationship.id,
          type: r.relationship.relationshipType,
          description: r.relationship.relationshipDescription,
          relatedCharacter: {
            id: r.relatedCharacter.id,
            nameHindi: r.relatedCharacter.nameHindi,
            nameRomanized: r.relatedCharacter.nameRomanized,
          },
        })),
        recentAppearances: appearances.map((a) => ({
          storyId: a.story.id,
          storyTitle: a.story.title,
          roleInStory: a.storyCharacter.roleInStory,
          date: a.story.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

const createCharacterSchema = z.object({
  nameHindi: z.string().min(1),
  nameRomanized: z.string().min(1),
  nameEnglish: z.string().optional(),
  age: z.number().int().positive().optional(),
  gender: z.string().optional(),
  occupation: z.string().optional(),
  occupationHindi: z.string().optional(),
  hobbies: z.array(z.string()).optional(),
  personalityTraits: z.array(z.string()).optional(),
  backstory: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

/**
 * POST /api/characters
 * Create a new character
 */
charactersRoutes.post(
  "/",
  zValidator("json", createCharacterSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const data = c.req.valid("json");

      const [character] = await db
        .insert(characters)
        .values({
          userId: user.id,
          nameHindi: data.nameHindi,
          nameRomanized: data.nameRomanized,
          nameEnglish: data.nameEnglish,
          age: data.age,
          gender: data.gender,
          occupation: data.occupation,
          occupationHindi: data.occupationHindi,
          hobbies: data.hobbies || [],
          personalityTraits: data.personalityTraits || [],
          backstory: data.backstory,
          imageUrl: data.imageUrl,
        })
        .returning();

      return c.json({
        success: true,
        data: {
          id: character.id,
          nameHindi: character.nameHindi,
          nameRomanized: character.nameRomanized,
          nameEnglish: character.nameEnglish,
          age: character.age,
          gender: character.gender,
          occupation: character.occupation,
          occupationHindi: character.occupationHindi,
          hobbies: character.hobbies,
          personalityTraits: character.personalityTraits,
          backstory: character.backstory,
          imageUrl: character.imageUrl,
          isActive: character.isActive,
          appearanceCount: character.appearanceCount,
          createdAt: character.createdAt.toISOString(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ success: false, error: message }, 500);
    }
  },
);

const updateCharacterSchema = createCharacterSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/**
 * PATCH /api/characters/:characterId
 * Update a character
 */
charactersRoutes.patch(
  "/:characterId",
  zValidator("json", updateCharacterSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const characterId = c.req.param("characterId");
      const data = c.req.valid("json");

      // Verify ownership
      const [existing] = await db
        .select()
        .from(characters)
        .where(
          and(eq(characters.id, characterId), eq(characters.userId, user.id)),
        );

      if (!existing) {
        return c.json({ success: false, error: "Character not found" }, 404);
      }

      const [updated] = await db
        .update(characters)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(characters.id, characterId))
        .returning();

      return c.json({
        success: true,
        data: {
          id: updated.id,
          nameHindi: updated.nameHindi,
          nameRomanized: updated.nameRomanized,
          nameEnglish: updated.nameEnglish,
          age: updated.age,
          gender: updated.gender,
          occupation: updated.occupation,
          occupationHindi: updated.occupationHindi,
          hobbies: updated.hobbies,
          personalityTraits: updated.personalityTraits,
          backstory: updated.backstory,
          imageUrl: updated.imageUrl,
          isActive: updated.isActive,
          appearanceCount: updated.appearanceCount,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ success: false, error: message }, 500);
    }
  },
);

/**
 * DELETE /api/characters/:characterId
 * Delete a character
 */
charactersRoutes.delete("/:characterId", async (c) => {
  try {
    const user = c.get("user");
    const characterId = c.req.param("characterId");

    // Verify ownership
    const [existing] = await db
      .select()
      .from(characters)
      .where(
        and(eq(characters.id, characterId), eq(characters.userId, user.id)),
      );

    if (!existing) {
      return c.json({ success: false, error: "Character not found" }, 404);
    }

    await db.delete(characters).where(eq(characters.id, characterId));

    return c.json({ success: true, message: "Character deleted" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

const addRelationshipSchema = z.object({
  relatedCharacterId: z.string().uuid(),
  relationshipType: z.string().min(1),
  relationshipDescription: z.string().optional(),
});

/**
 * POST /api/characters/:characterId/relationships
 * Add a relationship between characters
 */
charactersRoutes.post(
  "/:characterId/relationships",
  zValidator("json", addRelationshipSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const characterId = c.req.param("characterId");
      const data = c.req.valid("json");

      // Verify ownership of both characters
      const [char1] = await db
        .select()
        .from(characters)
        .where(
          and(eq(characters.id, characterId), eq(characters.userId, user.id)),
        );

      const [char2] = await db
        .select()
        .from(characters)
        .where(
          and(
            eq(characters.id, data.relatedCharacterId),
            eq(characters.userId, user.id),
          ),
        );

      if (!char1 || !char2) {
        return c.json({ success: false, error: "Character not found" }, 404);
      }

      const [relationship] = await db
        .insert(characterRelationships)
        .values({
          characterId,
          relatedCharacterId: data.relatedCharacterId,
          relationshipType: data.relationshipType,
          relationshipDescription: data.relationshipDescription,
        })
        .returning();

      return c.json({
        success: true,
        data: {
          id: relationship.id,
          characterId: relationship.characterId,
          relatedCharacterId: relationship.relatedCharacterId,
          type: relationship.relationshipType,
          description: relationship.relationshipDescription,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ success: false, error: message }, 500);
    }
  },
);

/**
 * DELETE /api/characters/:characterId/relationships/:relationshipId
 * Remove a relationship
 */
charactersRoutes.delete(
  "/:characterId/relationships/:relationshipId",
  async (c) => {
    try {
      const user = c.get("user");
      const characterId = c.req.param("characterId");
      const relationshipId = c.req.param("relationshipId");

      // Verify ownership
      const [char] = await db
        .select()
        .from(characters)
        .where(
          and(eq(characters.id, characterId), eq(characters.userId, user.id)),
        );

      if (!char) {
        return c.json({ success: false, error: "Character not found" }, 404);
      }

      await db
        .delete(characterRelationships)
        .where(
          and(
            eq(characterRelationships.id, relationshipId),
            eq(characterRelationships.characterId, characterId),
          ),
        );

      return c.json({ success: true, message: "Relationship removed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ success: false, error: message }, 500);
    }
  },
);
