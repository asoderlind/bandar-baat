import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import {
  words,
  grammarConcepts,
  users,
  userWords,
  userGrammars,
} from "./schema.js";
import { eq } from "drizzle-orm";

const { Pool } = pg;

const SEED_WORDS = [
  // A1 - Basic Greetings and Essentials
  {
    hindi: "नमस्ते",
    romanized: "namaste",
    english: "hello",
    partOfSpeech: "PARTICLE" as const,
    cefrLevel: "A1" as const,
    tags: ["greeting"],
  },
  {
    hindi: "धन्यवाद",
    romanized: "dhanyavaad",
    english: "thank you",
    partOfSpeech: "PARTICLE" as const,
    cefrLevel: "A1" as const,
    tags: ["greeting"],
  },
  {
    hindi: "हाँ",
    romanized: "haan",
    english: "yes",
    partOfSpeech: "PARTICLE" as const,
    cefrLevel: "A1" as const,
    tags: ["basic"],
  },
  {
    hindi: "नहीं",
    romanized: "nahin",
    english: "no",
    partOfSpeech: "PARTICLE" as const,
    cefrLevel: "A1" as const,
    tags: ["basic"],
  },
  {
    hindi: "अच्छा",
    romanized: "acchha",
    english: "good/okay",
    partOfSpeech: "ADJECTIVE" as const,
    cefrLevel: "A1" as const,
    tags: ["basic"],
  },

  // Pronouns
  {
    hindi: "मैं",
    romanized: "main",
    english: "I",
    partOfSpeech: "PRONOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["pronoun"],
  },
  {
    hindi: "तुम",
    romanized: "tum",
    english: "you (informal)",
    partOfSpeech: "PRONOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["pronoun"],
  },
  {
    hindi: "आप",
    romanized: "aap",
    english: "you (formal)",
    partOfSpeech: "PRONOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["pronoun"],
  },
  {
    hindi: "वह",
    romanized: "vah",
    english: "he/she/that",
    partOfSpeech: "PRONOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["pronoun"],
  },
  {
    hindi: "हम",
    romanized: "ham",
    english: "we",
    partOfSpeech: "PRONOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["pronoun"],
  },
  {
    hindi: "यह",
    romanized: "yah",
    english: "this",
    partOfSpeech: "PRONOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["pronoun"],
  },
  {
    hindi: "वे",
    romanized: "ve",
    english: "they",
    partOfSpeech: "PRONOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["pronoun"],
  },

  // Basic Verbs
  {
    hindi: "है",
    romanized: "hai",
    english: "is/am/are",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb", "to be"],
  },
  {
    hindi: "हूँ",
    romanized: "hoon",
    english: "am",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb", "to be"],
  },
  {
    hindi: "हैं",
    romanized: "hain",
    english: "are",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb", "to be"],
  },
  {
    hindi: "करना",
    romanized: "karna",
    english: "to do",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb"],
  },
  {
    hindi: "होना",
    romanized: "hona",
    english: "to be",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb"],
  },
  {
    hindi: "जाना",
    romanized: "jaana",
    english: "to go",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb", "movement"],
  },
  {
    hindi: "आना",
    romanized: "aana",
    english: "to come",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb", "movement"],
  },
  {
    hindi: "खाना",
    romanized: "khaana",
    english: "to eat",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb", "food"],
  },
  {
    hindi: "पीना",
    romanized: "peena",
    english: "to drink",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb", "food"],
  },
  {
    hindi: "देखना",
    romanized: "dekhna",
    english: "to see/watch",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb"],
  },
  {
    hindi: "सुनना",
    romanized: "sunna",
    english: "to hear/listen",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb"],
  },
  {
    hindi: "बोलना",
    romanized: "bolna",
    english: "to speak",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb", "communication"],
  },
  {
    hindi: "पढ़ना",
    romanized: "padhna",
    english: "to read",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb"],
  },
  {
    hindi: "लिखना",
    romanized: "likhna",
    english: "to write",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A1" as const,
    tags: ["verb"],
  },

  // Basic Nouns
  {
    hindi: "पानी",
    romanized: "paani",
    english: "water",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["food", "drink"],
  },
  {
    hindi: "चाय",
    romanized: "chaay",
    english: "tea",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["food", "drink"],
  },
  {
    hindi: "खाना",
    romanized: "khaana",
    english: "food",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["food"],
  },
  {
    hindi: "घर",
    romanized: "ghar",
    english: "house/home",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["place"],
  },
  {
    hindi: "दुकान",
    romanized: "dukaan",
    english: "shop",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["place"],
  },
  {
    hindi: "बाज़ार",
    romanized: "baazaar",
    english: "market",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["place"],
  },
  {
    hindi: "रास्ता",
    romanized: "raasta",
    english: "road/way",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["place"],
  },
  {
    hindi: "किताब",
    romanized: "kitaab",
    english: "book",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["object"],
  },
  {
    hindi: "कमरा",
    romanized: "kamra",
    english: "room",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["place"],
  },
  {
    hindi: "दरवाज़ा",
    romanized: "darwaaza",
    english: "door",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["object"],
  },

  // Numbers
  {
    hindi: "एक",
    romanized: "ek",
    english: "one",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["number"],
  },
  {
    hindi: "दो",
    romanized: "do",
    english: "two",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["number"],
  },
  {
    hindi: "तीन",
    romanized: "teen",
    english: "three",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["number"],
  },
  {
    hindi: "चार",
    romanized: "chaar",
    english: "four",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["number"],
  },
  {
    hindi: "पाँच",
    romanized: "paanch",
    english: "five",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["number"],
  },

  // Question Words
  {
    hindi: "क्या",
    romanized: "kya",
    english: "what",
    partOfSpeech: "PRONOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["question"],
  },
  {
    hindi: "कौन",
    romanized: "kaun",
    english: "who",
    partOfSpeech: "PRONOUN" as const,
    cefrLevel: "A1" as const,
    tags: ["question"],
  },
  {
    hindi: "कहाँ",
    romanized: "kahaan",
    english: "where",
    partOfSpeech: "ADVERB" as const,
    cefrLevel: "A1" as const,
    tags: ["question"],
  },
  {
    hindi: "कब",
    romanized: "kab",
    english: "when",
    partOfSpeech: "ADVERB" as const,
    cefrLevel: "A1" as const,
    tags: ["question"],
  },
  {
    hindi: "कैसे",
    romanized: "kaise",
    english: "how",
    partOfSpeech: "ADVERB" as const,
    cefrLevel: "A1" as const,
    tags: ["question"],
  },
  {
    hindi: "क्यों",
    romanized: "kyon",
    english: "why",
    partOfSpeech: "ADVERB" as const,
    cefrLevel: "A1" as const,
    tags: ["question"],
  },

  // Postpositions
  {
    hindi: "में",
    romanized: "mein",
    english: "in",
    partOfSpeech: "POSTPOSITION" as const,
    cefrLevel: "A1" as const,
    tags: ["postposition"],
  },
  {
    hindi: "पर",
    romanized: "par",
    english: "on/at",
    partOfSpeech: "POSTPOSITION" as const,
    cefrLevel: "A1" as const,
    tags: ["postposition"],
  },
  {
    hindi: "से",
    romanized: "se",
    english: "from/with",
    partOfSpeech: "POSTPOSITION" as const,
    cefrLevel: "A1" as const,
    tags: ["postposition"],
  },
  {
    hindi: "को",
    romanized: "ko",
    english: "to",
    partOfSpeech: "POSTPOSITION" as const,
    cefrLevel: "A1" as const,
    tags: ["postposition"],
  },
  {
    hindi: "का",
    romanized: "ka",
    english: "of (masc.)",
    partOfSpeech: "POSTPOSITION" as const,
    cefrLevel: "A1" as const,
    tags: ["postposition"],
  },
  {
    hindi: "की",
    romanized: "ki",
    english: "of (fem.)",
    partOfSpeech: "POSTPOSITION" as const,
    cefrLevel: "A1" as const,
    tags: ["postposition"],
  },
  {
    hindi: "के",
    romanized: "ke",
    english: "of (plural/oblique)",
    partOfSpeech: "POSTPOSITION" as const,
    cefrLevel: "A1" as const,
    tags: ["postposition"],
  },

  // Time Words
  {
    hindi: "आज",
    romanized: "aaj",
    english: "today",
    partOfSpeech: "ADVERB" as const,
    cefrLevel: "A1" as const,
    tags: ["time"],
  },
  {
    hindi: "कल",
    romanized: "kal",
    english: "yesterday/tomorrow",
    partOfSpeech: "ADVERB" as const,
    cefrLevel: "A1" as const,
    tags: ["time"],
  },
  {
    hindi: "अब",
    romanized: "ab",
    english: "now",
    partOfSpeech: "ADVERB" as const,
    cefrLevel: "A1" as const,
    tags: ["time"],
  },
  {
    hindi: "बाद",
    romanized: "baad",
    english: "after/later",
    partOfSpeech: "ADVERB" as const,
    cefrLevel: "A1" as const,
    tags: ["time"],
  },
  {
    hindi: "पहले",
    romanized: "pahle",
    english: "before/first",
    partOfSpeech: "ADVERB" as const,
    cefrLevel: "A1" as const,
    tags: ["time"],
  },

  // A2 Words
  {
    hindi: "समझना",
    romanized: "samajhna",
    english: "to understand",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A2" as const,
    tags: ["verb"],
  },
  {
    hindi: "मिलना",
    romanized: "milna",
    english: "to meet/get",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A2" as const,
    tags: ["verb"],
  },
  {
    hindi: "रहना",
    romanized: "rehna",
    english: "to stay/live",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A2" as const,
    tags: ["verb"],
  },
  {
    hindi: "लेना",
    romanized: "lena",
    english: "to take",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A2" as const,
    tags: ["verb"],
  },
  {
    hindi: "देना",
    romanized: "dena",
    english: "to give",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A2" as const,
    tags: ["verb"],
  },
  {
    hindi: "सोचना",
    romanized: "sochna",
    english: "to think",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A2" as const,
    tags: ["verb"],
  },
  {
    hindi: "चाहना",
    romanized: "chaahna",
    english: "to want",
    partOfSpeech: "VERB" as const,
    cefrLevel: "A2" as const,
    tags: ["verb"],
  },
  {
    hindi: "पसंद",
    romanized: "pasand",
    english: "like/preference",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A2" as const,
    tags: ["feeling"],
  },
  {
    hindi: "ज़रूरत",
    romanized: "zaroorat",
    english: "need",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A2" as const,
    tags: ["abstract"],
  },
  {
    hindi: "मदद",
    romanized: "madad",
    english: "help",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A2" as const,
    tags: ["abstract"],
  },
  {
    hindi: "काम",
    romanized: "kaam",
    english: "work",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A2" as const,
    tags: ["work"],
  },
  {
    hindi: "दोस्त",
    romanized: "dost",
    english: "friend",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A2" as const,
    tags: ["person"],
  },
  {
    hindi: "परिवार",
    romanized: "parivaar",
    english: "family",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A2" as const,
    tags: ["person"],
  },
  {
    hindi: "शहर",
    romanized: "shahar",
    english: "city",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A2" as const,
    tags: ["place"],
  },
  {
    hindi: "देश",
    romanized: "desh",
    english: "country",
    partOfSpeech: "NOUN" as const,
    cefrLevel: "A2" as const,
    tags: ["place"],
  },
];

const SEED_GRAMMAR = [
  {
    name: "Basic Sentence Structure",
    slug: "basic-sentence-structure",
    description:
      "Hindi follows Subject-Object-Verb (SOV) order. The verb comes at the end.",
    cefrLevel: "A1" as const,
    sortOrder: 1,
    examplesJson: [
      {
        hindi: "मैं खाना खाता हूँ",
        romanized: "main khaana khaata hoon",
        english: "I eat food",
      },
      {
        hindi: "वह किताब पढ़ता है",
        romanized: "vah kitaab padhta hai",
        english: "He reads a book",
      },
    ],
    prerequisiteIds: [],
  },
  {
    name: "Present Tense with होना",
    slug: "present-tense-hona",
    description:
      "Using है/हूँ/हैं to express 'is/am/are' with nouns and adjectives.",
    cefrLevel: "A1" as const,
    sortOrder: 2,
    examplesJson: [
      {
        hindi: "मैं ठीक हूँ",
        romanized: "main theek hoon",
        english: "I am fine",
      },
      {
        hindi: "यह अच्छा है",
        romanized: "yah acchha hai",
        english: "This is good",
      },
    ],
    prerequisiteIds: [],
  },
  {
    name: "Gender in Nouns",
    slug: "gender-nouns",
    description:
      "Hindi nouns are either masculine or feminine, affecting adjective and verb forms.",
    cefrLevel: "A1" as const,
    sortOrder: 3,
    examplesJson: [
      {
        hindi: "लड़का अच्छा है",
        romanized: "ladka acchha hai",
        english: "The boy is good",
      },
      {
        hindi: "लड़की अच्छी है",
        romanized: "ladki acchhi hai",
        english: "The girl is good",
      },
    ],
    prerequisiteIds: [],
  },
  {
    name: "Postposition का/की/के",
    slug: "postposition-ka-ki-ke",
    description: "Expressing possession and relationships using का/की/के.",
    cefrLevel: "A1" as const,
    sortOrder: 4,
    examplesJson: [
      { hindi: "राम का घर", romanized: "Ram ka ghar", english: "Ram's house" },
      {
        hindi: "सीता की किताब",
        romanized: "Sita ki kitaab",
        english: "Sita's book",
      },
    ],
    prerequisiteIds: [],
  },
  {
    name: "Present Habitual Tense",
    slug: "present-habitual",
    description:
      "Expressing regular or habitual actions using -ता/-ती/-ते forms.",
    cefrLevel: "A2" as const,
    sortOrder: 5,
    examplesJson: [
      {
        hindi: "मैं रोज़ चाय पीता हूँ",
        romanized: "main roz chaay peeta hoon",
        english: "I drink tea every day",
      },
      {
        hindi: "वह स्कूल जाती है",
        romanized: "vah school jaati hai",
        english: "She goes to school",
      },
    ],
    prerequisiteIds: [],
  },
  {
    name: "Present Continuous Tense",
    slug: "present-continuous",
    description: "Expressing ongoing actions using रहा/रही/रहे forms.",
    cefrLevel: "A2" as const,
    sortOrder: 6,
    examplesJson: [
      {
        hindi: "मैं खाना खा रहा हूँ",
        romanized: "main khaana kha raha hoon",
        english: "I am eating food",
      },
      {
        hindi: "वह पढ़ रही है",
        romanized: "vah padh rahi hai",
        english: "She is reading",
      },
    ],
    prerequisiteIds: [],
  },
  {
    name: "Simple Past Tense",
    slug: "simple-past",
    description: "Expressing completed past actions using -आ/-ई/-ए forms.",
    cefrLevel: "A2" as const,
    sortOrder: 7,
    examplesJson: [
      {
        hindi: "मैंने खाना खाया",
        romanized: "maine khaana khaya",
        english: "I ate food",
      },
      { hindi: "वह गई", romanized: "vah gayi", english: "She went" },
    ],
    prerequisiteIds: [],
  },
  {
    name: "Imperative (Commands)",
    slug: "imperative",
    description:
      "Giving commands and making requests using different politeness levels.",
    cefrLevel: "A2" as const,
    sortOrder: 8,
    examplesJson: [
      { hindi: "जाओ", romanized: "jao", english: "Go (informal)" },
      { hindi: "जाइए", romanized: "jaiye", english: "Please go (formal)" },
    ],
    prerequisiteIds: [],
  },
  {
    name: "Future Tense",
    slug: "future-tense",
    description: "Expressing future actions using -गा/-गी/-गे forms.",
    cefrLevel: "B1" as const,
    sortOrder: 9,
    examplesJson: [
      {
        hindi: "मैं कल आऊँगा",
        romanized: "main kal aaoonga",
        english: "I will come tomorrow",
      },
      { hindi: "वह जाएगी", romanized: "vah jaayegi", english: "She will go" },
    ],
    prerequisiteIds: [],
  },
  {
    name: "Compound Verbs",
    slug: "compound-verbs",
    description:
      "Combining verbs to add nuance like completion, suddenness, or benefit.",
    cefrLevel: "B1" as const,
    sortOrder: 10,
    examplesJson: [
      { hindi: "खा लो", romanized: "kha lo", english: "Eat (for yourself)" },
      { hindi: "बैठ जाओ", romanized: "baith jao", english: "Sit down" },
    ],
    prerequisiteIds: [],
  },
];

async function seed() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/monkesay",
  });

  const db = drizzle(pool, { schema });

  console.log("🌱 Seeding database...");

  try {
    // Seed words
    console.log("📚 Seeding words...");
    for (const word of SEED_WORDS) {
      const existing = await db
        .select()
        .from(words)
        .where(eq(words.hindi, word.hindi))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(words).values(word);
      }
    }
    console.log(`✅ Seeded ${SEED_WORDS.length} words`);

    // Seed grammar concepts
    console.log("📖 Seeding grammar concepts...");
    for (const grammar of SEED_GRAMMAR) {
      const existing = await db
        .select()
        .from(grammarConcepts)
        .where(eq(grammarConcepts.slug, grammar.slug))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(grammarConcepts).values(grammar);
      }
    }
    console.log(`✅ Seeded ${SEED_GRAMMAR.length} grammar concepts`);

    // Create demo user via API (so password is hashed correctly)
    console.log("👤 Creating demo user...");

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, "demo@example.com"));

    let demoUserId: string;

    if (!existingUser) {
      // Call the auth API to create user with proper password hashing
      const response = await fetch(
        "http://localhost:8000/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "demo@example.com",
            password: "demo1234", // Must be at least 8 characters for better-auth
            name: "Demo User",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to create demo user: ${await response.text()}`);
      }

      const { user } = await response.json();
      demoUserId = user.id;

      // Add some initial known words for demo user
      const allWords = await db.select().from(words).limit(20);
      for (const word of allWords.slice(0, 10)) {
        await db.insert(userWords).values({
          userId: demoUserId,
          wordId: word.id,
          status: "KNOWN",
          familiarity: 1.0,
          source: "SEEDED",
        });
      }

      // Add some learning words
      for (const word of allWords.slice(10, 15)) {
        await db.insert(userWords).values({
          userId: demoUserId,
          wordId: word.id,
          status: "LEARNING",
          familiarity: 0.5,
          source: "SEEDED",
        });
      }

      // Unlock first few grammar concepts
      const allGrammar = await db.select().from(grammarConcepts).limit(5);
      for (const grammar of allGrammar.slice(0, 3)) {
        await db.insert(userGrammars).values({
          userId: demoUserId,
          grammarConceptId: grammar.id,
          status: "AVAILABLE",
        });
      }

      console.log("✅ Created demo user (demo@example.com / demo1234)");
    } else {
      console.log("ℹ️ Demo user already exists");
    }

    console.log("🎉 Seeding complete!");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
