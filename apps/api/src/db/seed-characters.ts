/**
 * Seed script for recurring story characters
 * Run with: npx tsx src/db/seed-characters.ts
 */

import { db } from "./index.js";
import { characters, characterRelationships, users } from "./schema.js";
import { eq } from "drizzle-orm";

const DEMO_USER_EMAIL = "demo@example.com";

interface CharacterSeed {
  nameHindi: string;
  nameRomanized: string;
  nameEnglish?: string;
  age?: number;
  gender?: string;
  occupation?: string;
  occupationHindi?: string;
  hobbies?: string[];
  personalityTraits?: string[];
  backstory?: string;
}

const characterSeeds: CharacterSeed[] = [
  {
    nameHindi: "अर्जुन",
    nameRomanized: "Arjun",
    nameEnglish: "Arjun",
    age: 28,
    gender: "male",
    occupation: "Software Engineer",
    occupationHindi: "सॉफ्टवेयर इंजीनियर",
    hobbies: ["reading", "cricket", "cooking"],
    personalityTraits: ["curious", "helpful", "patient"],
    backstory:
      "Arjun grew up in Delhi and moved to Bangalore for work. He loves learning new things and often helps his neighbors.",
  },
  {
    nameHindi: "प्रिया",
    nameRomanized: "Priya",
    nameEnglish: "Priya",
    age: 26,
    gender: "female",
    occupation: "Teacher",
    occupationHindi: "अध्यापिका",
    hobbies: ["dancing", "gardening", "music"],
    personalityTraits: ["kind", "creative", "energetic"],
    backstory:
      "Priya teaches at a local school and is passionate about education. She is Arjun's neighbor and close friend.",
  },
  {
    nameHindi: "राजू",
    nameRomanized: "Raju",
    nameEnglish: "Raju",
    age: 35,
    gender: "male",
    occupation: "Shopkeeper",
    occupationHindi: "दुकानदार",
    hobbies: ["chess", "storytelling"],
    personalityTraits: ["friendly", "talkative", "generous"],
    backstory:
      "Raju runs a small grocery shop in the neighborhood. He knows everyone and loves to share local news and stories.",
  },
  {
    nameHindi: "आशा",
    nameRomanized: "Asha",
    nameEnglish: "Asha",
    age: 60,
    gender: "female",
    occupation: "Retired Teacher",
    occupationHindi: "सेवानिवृत्त अध्यापिका",
    hobbies: ["knitting", "cooking", "reading scriptures"],
    personalityTraits: ["wise", "caring", "traditional"],
    backstory:
      "Asha ji is a respected elder in the community. She was a Hindi teacher for 35 years and now enjoys spending time with her grandchildren.",
  },
  {
    nameHindi: "विकास",
    nameRomanized: "Vikas",
    nameEnglish: "Vikas",
    age: 22,
    gender: "male",
    occupation: "College Student",
    occupationHindi: "कॉलेज छात्र",
    hobbies: ["photography", "traveling", "social media"],
    personalityTraits: ["adventurous", "tech-savvy", "ambitious"],
    backstory:
      "Vikas is Asha's grandson, studying computer science. He often visits his grandmother and helps neighbors with technology.",
  },
  {
    nameHindi: "मीरा",
    nameRomanized: "Meera",
    nameEnglish: "Meera",
    age: 30,
    gender: "female",
    occupation: "Doctor",
    occupationHindi: "डॉक्टर",
    hobbies: ["yoga", "painting", "traveling"],
    personalityTraits: ["compassionate", "intelligent", "calm"],
    backstory:
      "Dr. Meera works at the local clinic. She is known for her gentle manner and dedication to her patients.",
  },
  {
    nameHindi: "संजय",
    nameRomanized: "Sanjay",
    nameEnglish: "Sanjay",
    age: 45,
    gender: "male",
    occupation: "Auto Rickshaw Driver",
    occupationHindi: "ऑटो चालक",
    hobbies: ["movies", "singing", "playing cards"],
    personalityTraits: ["humorous", "street-smart", "loyal"],
    backstory:
      "Sanjay has been driving his auto in the neighborhood for 20 years. He knows every shortcut and has countless stories to tell.",
  },
  {
    nameHindi: "अनीता",
    nameRomanized: "Anita",
    nameEnglish: "Anita",
    age: 32,
    gender: "female",
    occupation: "Cafe Owner",
    occupationHindi: "कैफे मालिक",
    hobbies: ["baking", "reading novels", "interior design"],
    personalityTraits: ["entrepreneurial", "warm", "organized"],
    backstory:
      "Anita recently opened a small cafe that has become a popular gathering spot. She serves the best chai in the area.",
  },
];

// Relationships to create after characters are seeded
interface RelationshipSeed {
  fromName: string;
  toName: string;
  type: string;
  description?: string;
}

const relationshipSeeds: RelationshipSeed[] = [
  {
    fromName: "Arjun",
    toName: "Priya",
    type: "neighbor",
    description:
      "They live in the same apartment building and are close friends",
  },
  {
    fromName: "Priya",
    toName: "Arjun",
    type: "neighbor",
    description: "They often have chai together in the evenings",
  },
  {
    fromName: "Vikas",
    toName: "Asha",
    type: "grandson",
    description: "Vikas is Asha's favorite grandson",
  },
  {
    fromName: "Asha",
    toName: "Vikas",
    type: "grandmother",
    description: "She dotes on Vikas and worries about his studies",
  },
  {
    fromName: "Arjun",
    toName: "Raju",
    type: "customer",
    description: "Arjun shops at Raju's store regularly",
  },
  {
    fromName: "Raju",
    toName: "Arjun",
    type: "shopkeeper",
    description: "Raju knows Arjun's usual purchases",
  },
  {
    fromName: "Meera",
    toName: "Asha",
    type: "doctor",
    description: "Meera is Asha's family doctor",
  },
  {
    fromName: "Sanjay",
    toName: "Anita",
    type: "regular customer",
    description: "Sanjay stops by Anita's cafe every morning for chai",
  },
  {
    fromName: "Priya",
    toName: "Vikas",
    type: "tutor",
    description: "Priya sometimes helps Vikas with Hindi essays",
  },
];

async function seedCharacters() {
  console.log("🌱 Seeding characters...\n");

  // Find demo user
  const [demoUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_USER_EMAIL));

  if (!demoUser) {
    console.error(`❌ Demo user (${DEMO_USER_EMAIL}) not found!`);
    console.log("Please create the demo user first or update DEMO_USER_EMAIL.");
    process.exit(1);
  }

  console.log(`Found demo user: ${demoUser.email} (${demoUser.id})\n`);

  // Check for existing characters
  const existingChars = await db
    .select()
    .from(characters)
    .where(eq(characters.userId, demoUser.id));

  if (existingChars.length > 0) {
    console.log(
      `⚠️  Found ${existingChars.length} existing characters for this user.`,
    );
    console.log("Skipping character creation to avoid duplicates.\n");
    console.log("To re-seed, delete existing characters first:\n");
    console.log(`  DELETE FROM characters WHERE user_id = '${demoUser.id}';\n`);
    process.exit(0);
  }

  // Insert characters
  const createdCharacters: Map<string, string> = new Map();

  for (const charData of characterSeeds) {
    const [created] = await db
      .insert(characters)
      .values({
        userId: demoUser.id,
        ...charData,
      })
      .returning();

    createdCharacters.set(charData.nameRomanized, created.id);
    console.log(
      `✅ Created: ${charData.nameHindi} (${charData.nameRomanized})`,
    );
  }

  console.log(`\n📊 Created ${createdCharacters.size} characters\n`);

  // Create relationships
  console.log("🔗 Creating relationships...\n");

  let relCount = 0;
  for (const rel of relationshipSeeds) {
    const fromId = createdCharacters.get(rel.fromName);
    const toId = createdCharacters.get(rel.toName);

    if (fromId && toId) {
      await db.insert(characterRelationships).values({
        characterId: fromId,
        relatedCharacterId: toId,
        relationshipType: rel.type,
        relationshipDescription: rel.description,
      });
      console.log(`  ${rel.fromName} → ${rel.toName}: ${rel.type}`);
      relCount++;
    }
  }

  console.log(`\n📊 Created ${relCount} relationships\n`);
  console.log("✨ Character seeding complete!");

  process.exit(0);
}

seedCharacters().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
