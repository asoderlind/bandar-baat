# Hindi Learning Webapp — Architecture & Design Plan

## 1. Vision

A self-hosted SPA for learning Hindi through AI-generated stories and exercises. The core loop: the system tracks which words and grammar the learner already knows, then asks Claude to generate engaging short stories that are _mostly_ comprehensible but introduce a few new elements each session. This is essentially **comprehensible input (Krashen's i+1)** implemented programmatically.

### Why this works

Traditional flashcard apps (Anki, Memrise) drill isolated words. Immersion content (podcasts, shows) is overwhelming for beginners. This app sits in the gap: every piece of content is _personalized_ to be just at the edge of the learner's ability, with full context.

---

## 2. Tech Stack

| Layer      | Choice                             | Notes                                                 |
| ---------- | ---------------------------------- | ----------------------------------------------------- |
| Frontend   | React (Vite + TypeScript)          | SPA, mobile-friendly responsive design                |
| Backend    | FastAPI (Python)                   | Async, good LLM ecosystem, Pydantic models            |
| Database   | PostgreSQL                         | JSONB for flexible LLM response storage               |
| LLM        | Claude API (Sonnet for generation) | Structured output via tool_use / JSON mode            |
| Auth       | Simple session-based (single user) | Can add multi-user later; self-hosted so low priority |
| Deployment | Docker Compose                     | Fits existing home lab setup                          |

---

## 3. Data Models

### 3.1 Core Vocabulary

```
Word
├── id: UUID
├── hindi: text              -- "खाना" (Devanagari)
├── romanized: text          -- "khaanaa"
├── english: text            -- "to eat / food"
├── part_of_speech: enum     -- NOUN, VERB, ADJECTIVE, ADVERB, POSTPOSITION, PARTICLE, PRONOUN, CONJUNCTION
├── root_form_id: UUID?      -- nullable self-ref, links conjugations back to lemma
├── cefr_level: enum         -- A1, A2, B1, B2 (approximate difficulty bucket)
├── tags: text[]             -- ["food", "daily_life", "core_100"]
├── audio_url: text?         -- optional TTS or recorded audio path
├── notes: text?             -- usage notes, common collocations
├── created_at: timestamp
└── updated_at: timestamp
```

**Design decisions:**

- `root_form_id` handles conjugations. "खाता" (khaataa, masc. habitual) links back to "खाना" (khaanaa, infinitive). This lets the SRS system credit knowledge of the root when you encounter a conjugated form, and vice versa.
- `cefr_level` is approximate — Hindi doesn't have an official CEFR word list, but frequency-based bucketing works. Seed from Hindi Shabdkosh frequency lists or the Hindi portion of CEFR-J.
- Tags enable topical story generation ("generate a story about food using these words").

### 3.2 Grammar Concepts

```
GrammarConcept
├── id: UUID
├── name: text               -- "Postpositions (में, पर, को)"
├── slug: text               -- "postpositions-basic"
├── description: text        -- Human-readable explanation
├── cefr_level: enum
├── sort_order: int          -- Defines teaching sequence
├── examples_json: JSONB     -- [{hindi, romanized, english}]
├── prerequisite_ids: UUID[] -- Grammar concepts that should be learned first
└── created_at: timestamp
```

**Teaching order matters.** Hindi grammar builds on itself: you need to know basic sentence structure (SOV) before postpositions, postpositions before compound verbs, etc. The `prerequisite_ids` + `sort_order` let you define a DAG of grammar progression.

**Suggested initial grammar sequence:**

1. Personal pronouns + है/हैं (to be)
2. Basic SOV word order
3. Gender system (masculine/feminine nouns)
4. Simple present tense (-ता/-ती/-ते)
5. Postpositions (में, पर, को, से, का/की/के)
6. Past tense (-ा/-ी/-े)
7. Future tense (-गा/-गी/-गे)
8. Compound verbs
9. Subjunctive
10. Relative clauses (जो...वो)

### 3.3 User Progress

```
UserWord
├── id: UUID
├── user_id: UUID
├── word_id: UUID
├── status: enum             -- NEW, LEARNING, KNOWN, MASTERED
├── familiarity: float       -- 0.0 to 1.0 (SRS confidence score)
├── times_seen: int          -- encounters in stories
├── times_reviewed: int      -- explicit review sessions
├── times_correct: int
├── last_seen_at: timestamp?
├── next_review_at: timestamp? -- SRS scheduling
├── srs_interval_days: float -- current SRS interval
├── srs_ease_factor: float   -- SM-2 ease factor (default 2.5)
├── source: enum             -- SEEDED, STORY, MANUAL, REVIEW
└── created_at: timestamp

UNIQUE(user_id, word_id)
```

```
UserGrammar
├── id: UUID
├── user_id: UUID
├── grammar_concept_id: UUID
├── status: enum             -- LOCKED, AVAILABLE, LEARNING, LEARNED
├── introduced_at: timestamp?
├── comfort_score: float     -- 0.0 to 1.0
└── created_at: timestamp

UNIQUE(user_id, grammar_concept_id)
```

**SRS algorithm:** Start with SM-2 (well-understood, simple to implement). The key fields are `srs_interval_days` and `srs_ease_factor`. Can swap for FSRS later if desired — the schema supports either.

### 3.4 Generated Content

```
Story
├── id: UUID
├── user_id: UUID
├── title: text
├── content_hindi: text           -- Full story in Devanagari
├── content_romanized: text       -- Full story romanized
├── content_english: text         -- English translation
├── sentences_json: JSONB         -- Parsed sentence-by-sentence breakdown (see below)
├── target_new_word_ids: UUID[]   -- Words this story was designed to introduce
├── target_grammar_ids: UUID[]    -- Grammar concepts this story exercises
├── topic: text?                  -- "at the market", "meeting a friend"
├── difficulty_level: enum        -- A1, A2, B1, B2
├── word_count: int
├── generation_prompt: text       -- The actual prompt sent to Claude (for debugging/iteration)
├── llm_model: text               -- "claude-sonnet-4-20250514"
├── llm_response_raw: JSONB       -- Full API response for auditing
├── rating: int?                  -- User rating (1-5) for feedback loop
├── created_at: timestamp
└── completed_at: timestamp?      -- When user finished reading/exercises
```

**`sentences_json` structure** (the core interactive element):

```json
[
  {
    "index": 0,
    "hindi": "राज बाज़ार में सब्ज़ियाँ खरीदता है।",
    "romanized": "Raaj baazaar mein sabziyaan khareedtaa hai.",
    "english": "Raj buys vegetables at the market.",
    "words": [
      {
        "hindi": "राज",
        "romanized": "Raaj",
        "english": "Raj (name)",
        "word_id": null,
        "is_new": false
      },
      {
        "hindi": "बाज़ार",
        "romanized": "baazaar",
        "english": "market",
        "word_id": "uuid-1",
        "is_new": false
      },
      {
        "hindi": "में",
        "romanized": "mein",
        "english": "in/at",
        "word_id": "uuid-2",
        "is_new": false
      },
      {
        "hindi": "सब्ज़ियाँ",
        "romanized": "sabziyaan",
        "english": "vegetables",
        "word_id": "uuid-3",
        "is_new": true
      },
      {
        "hindi": "खरीदता",
        "romanized": "khareedtaa",
        "english": "buys",
        "word_id": "uuid-4",
        "is_new": true
      },
      {
        "hindi": "है",
        "romanized": "hai",
        "english": "is (aux.)",
        "word_id": "uuid-5",
        "is_new": false
      }
    ],
    "grammar_notes": [
      "Simple present tense: verb stem + ता + है for masculine singular"
    ]
  }
]
```

This structure powers the interactive reader: tap any word to see its meaning, new words are highlighted, grammar notes appear contextually.

### 3.5 Exercises & Reviews

```
Exercise
├── id: UUID
├── story_id: UUID
├── type: enum               -- COMPREHENSION, FILL_BLANK, TRANSLATE_TO_HINDI,
│                               TRANSLATE_TO_ENGLISH, WORD_ORDER, MULTIPLE_CHOICE
├── question_json: JSONB     -- Flexible per exercise type
├── correct_answer: text
├── options: text[]?         -- For multiple choice
├── target_word_id: UUID?    -- Which word this exercises (nullable for comprehension)
├── target_grammar_id: UUID? -- Which grammar concept
└── created_at: timestamp
```

```
ExerciseAttempt
├── id: UUID
├── user_id: UUID
├── exercise_id: UUID
├── user_answer: text
├── is_correct: boolean
├── feedback: text?          -- LLM-generated feedback on wrong answers
├── time_spent_seconds: int?
└── created_at: timestamp
```

### 3.6 Session Tracking

```
LearningSession
├── id: UUID
├── user_id: UUID
├── session_type: enum       -- STORY, REVIEW, PLACEMENT, FREE_PRACTICE
├── story_id: UUID?
├── words_introduced: int
├── words_reviewed: int
├── exercises_completed: int
├── exercises_correct: int
├── duration_seconds: int
├── started_at: timestamp
└── ended_at: timestamp?
```

---

## 4. User Flows

### 4.1 Onboarding (First Launch)

```
┌─────────────────────────────────────────────────────┐
│  Welcome! Let's figure out where you are with Hindi  │
│                                                       │
│  ○ Complete beginner (I know nothing)                 │
│  ○ I know some basics (greetings, numbers, etc.)     │
│  ○ I can read Devanagari and know common words       │
│  ○ Intermediate (I can hold simple conversations)     │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │   Placement Quiz    │
              │  (if not beginner)  │
              │                     │
              │ Show 30-50 words,   │
              │ "Do you know this?" │
              │ Yes / Kinda / No    │
              └─────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │  Seed UserWord rows │
              │  Unlock grammar up  │
              │  to detected level  │
              │  Set CEFR starting  │
              │  point              │
              └─────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │  Script preference  │
              │                     │
              │ Show: Devanagari    │
              │   □ + Romanization  │
              │   □ + English       │
              │ (can change later)  │
              └─────────────────────┘
                          │
                          ▼
                  First story lesson
```

**For complete beginners:** Skip placement, seed with the Devanagari alphabet as the first module (this is a special non-story flow: character recognition drills). Then introduce the first 10-20 words and first grammar concept before the first story.

### 4.2 Main Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  नमस्ते, Axel                                    [Settings] │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  142 words   │  │  Level: A2   │  │  7-day       │       │
│  │  known       │  │              │  │  streak 🔥   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │  📖  NEW STORY                                     │      │
│  │  Ready! 3 new words + past tense practice          │      │
│  │  Topic: At the chai stall                          │      │
│  │                                    [Start →]       │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │  🔄  REVIEW DUE                                    │      │
│  │  12 words due for review                           │      │
│  │                                    [Review →]      │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │  📚  PAST STORIES                                  │      │
│  │  Re-read or practice with previous stories         │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │  🎯  FREE PRACTICE                                 │      │
│  │  Ask for a story about any topic                   │      │
│  └────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 Story Lesson Flow (Core Loop)

This is the heart of the app. Each session follows this sequence:

```
Step 1: PREPARE
─────────────────
Backend selects:
  - 3-5 new words (based on CEFR level + frequency)
  - 0-1 new grammar concepts (based on prerequisite DAG)
  - A topic (rotating, or user-chosen)
Backend calls Claude API to generate story + exercises.

Step 2: PREVIEW NEW WORDS
─────────────────────────
┌──────────────────────────────────────┐
│  New words in this story:            │
│                                      │
│  सब्ज़ी  (sabzee) — vegetable       │
│  🔊 [play audio]                     │
│                                      │
│  खरीदना (khareednaa) — to buy       │
│  🔊 [play audio]                     │
│                                      │
│  ताज़ा  (taazaa) — fresh             │
│  🔊 [play audio]                     │
│                                      │
│              [Got it, show story →]  │
└──────────────────────────────────────┘

Step 3: READ STORY (Interactive Reader)
────────────────────────────────────────
┌──────────────────────────────────────────────────────┐
│  🏪 बाज़ार में (At the Market)                       │
│                                                      │
│  राज सुबह बाज़ार जाता है। वह ताज़ी सब्ज़ियाँ        │
│  खरीदता है। दुकानदार कहता है, "आज टमाटर             │
│  बहुत अच्छे हैं!" राज तीन किलो टमाटर और            │
│  एक किलो आलू खरीदता है।                             │
│                                                      │
│  ───────────────────────────────────                  │
│  [Toggle: Devanagari only | + Roman | + English]     │
│                                                      │
│  Tap any word for translation.                       │
│  New words are highlighted in blue.                  │
│  Grammar notes appear with a ℹ️ icon.                │
└──────────────────────────────────────────────────────┘

Interaction: tapping "सब्ज़ियाँ" shows a tooltip:
  ┌─────────────────────────┐
  │ सब्ज़ियाँ               │
  │ sabziyaan               │
  │ vegetables (fem. pl.)   │
  │ root: सब्ज़ी (sabzee)   │
  │ 🔊  ⭐ Mark as known    │
  └─────────────────────────┘

Step 4: COMPREHENSION EXERCISES
────────────────────────────────
Generated by Claude alongside the story. 4-6 exercises mixing types:

  Q1 (comprehension): What does Raj buy at the market?
     ○ clothes  ○ vegetables  ○ books  ○ fruit

  Q2 (fill-in-blank): राज ___ सब्ज़ियाँ खरीदता है।
     [ताज़ी]

  Q3 (translate): How would you say "I buy vegetables"?
     [मैं सब्ज़ियाँ खरीदता हूँ]
     → LLM evaluates free-text answer, gives feedback

  Q4 (word order): Arrange: [है / सब्ज़ियाँ / राज / खरीदता]
     → राज सब्ज़ियाँ खरीदता है

Step 5: SESSION SUMMARY
─────────────────────────
┌──────────────────────────────────────┐
│  ✅ Session Complete!                │
│                                      │
│  Words learned: 3                    │
│  Exercises: 5/6 correct              │
│  Grammar practiced: Simple present   │
│                                      │
│  New words will appear in review     │
│  tomorrow.                           │
│                                      │
│  [Rate this story: ⭐⭐⭐⭐⭐]       │
│  [Back to Dashboard]                 │
└──────────────────────────────────────┘
```

### 4.4 Review Flow (SRS)

```
┌───────────────────────────────────────┐
│  Review (12 words due)          4/12  │
│                                       │
│        खरीदना                         │
│                                       │
│  [Show answer]                        │
└───────────────────────────────────────┘
           │
           ▼
┌───────────────────────────────────────┐
│        खरीदना                         │
│        khareednaa                     │
│        to buy                         │
│                                       │
│  Example: राज सब्ज़ियाँ खरीदता है।    │
│  (from story "At the Market")        │
│                                       │
│  [Again] [Hard] [Good] [Easy]        │
│   1 min   10 min  1 day   4 days     │
└───────────────────────────────────────┘
```

**Key detail:** Reviews show example sentences _from stories the user has already read_. This provides context and reinforces the narrative memory, rather than drilling bare words.

### 4.5 Free Practice

User can request a story on any topic or with specific constraints:

```
┌────────────────────────────────────────────┐
│  What would you like to read about?        │
│                                            │
│  [A trip to the doctor_______________]     │
│                                            │
│  □ Include specific words: ___________     │
│  □ Focus on grammar: [Past tense ▼]       │
│  □ Difficulty: [Match my level ▼]          │
│                                            │
│  [Generate Story →]                        │
└────────────────────────────────────────────┘
```

---

## 5. LLM Integration Design

### 5.1 Story Generation Prompt Strategy

The prompt to Claude is the most critical piece. It must be structured to produce consistent, parseable output.

**Approach:** Use Claude's tool_use / structured output to return JSON directly rather than free text that needs parsing.

**Prompt template (simplified):**

```
System: You are a Hindi language teaching assistant. You generate short
stories for language learners. You MUST use only the provided known
vocabulary plus the specified new words. Keep sentences short and clear.
Use natural Hindi — do not create stilted textbook sentences.

User: Generate a Hindi story with the following constraints:

KNOWN VOCABULARY (the learner can read these):
{list of ~100-300 hindi words with english meanings}

NEW WORDS TO INTRODUCE (use each at least twice):
- सब्ज़ी (sabzee) — vegetable
- खरीदना (khareednaa) — to buy
- ताज़ा (taazaa) — fresh

GRAMMAR TO PRACTICE:
- Simple present tense (verb stem + ता/ती/ते + है/हैं)
- Postposition में

TOPIC: At the market

CONSTRAINTS:
- 8-12 sentences long
- Use only known vocabulary + new words (proper nouns are OK)
- Every new word must appear at least twice in different sentences
- Include 1-2 lines of dialogue

Return your response as JSON with this exact structure:
{schema}
```

**The JSON schema** matches `sentences_json` from the Story model plus an `exercises` array.

### 5.2 Answer Evaluation

For free-text translation exercises, use a second Claude call:

```
System: You are evaluating a Hindi language learner's translation.
Be lenient with minor spelling variations in romanized Hindi.
Accept synonyms. Focus on whether the grammar structure is correct.

User:
Target sentence (English): "I buy vegetables"
Expected Hindi: "मैं सब्ज़ियाँ खरीदता हूँ"
Student wrote: "mai sabziyan kharidta hun"

Evaluate: is this correct, partially correct, or incorrect?
Give brief, encouraging feedback in 1-2 sentences.
```

### 5.3 Cost Management

At ~3¢ per story generation (Sonnet, ~2K tokens in + out) and ~1¢ per answer evaluation, a session costs roughly 5-10¢. For a self-hosted personal app this is fine, but worth tracking.

- Store `llm_response_raw` for debugging but consider pruning after 30 days
- Cache: if the user re-reads a story, don't regenerate — serve from DB
- Batch exercise generation with story generation (one API call, not separate)

---

## 6. Seeding the Word Database

The word database needs an initial seed. Options:

1. **Hindi frequency lists** — Top 1000-2000 most common Hindi words, tagged with CEFR levels. Available from Wiktionary frequency lists and Hindi Shabdkosh.
2. **Textbook vocabulary** — Pull word lists from "Complete Hindi" (Teach Yourself) or similar graded textbooks, organized by chapter/level.
3. **Bootstrap with Claude** — Ask Claude to generate a graded vocabulary list of 500 words organized by CEFR level. Then manually review and correct. This is fast but needs QA.
4. **Grow organically** — Start with 50-100 manually curated words. Each story generation can propose new words. User confirms which words they actually learned. The database grows naturally with usage.

**Recommended approach:** Option 2 + 4. Start with a curated seed of ~200-300 words from a textbook, organized by level. Then let the system grow organically as stories are generated.

---

## 7. Key Architectural Decisions for the Implementer

### Things that are decided

| Decision            | Choice                                                | Rationale                                                                    |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Script display      | Devanagari primary, toggleable romanization + English | Learners need to read Devanagari eventually; romanization as training wheels |
| SRS algorithm       | SM-2                                                  | Simple, proven, easy to implement; can swap later                            |
| Story length        | 8-15 sentences                                        | Short enough for a 5-10 min session                                          |
| New words per story | 3-5                                                   | Enough to feel progress, few enough to not overwhelm                         |
| LLM model           | Claude Sonnet (for generation)                        | Good balance of quality/cost/speed                                           |
| Exercise generation | Same API call as story                                | Reduces latency and cost                                                     |
| Auth                | Simple single-user session                            | Self-hosted; don't over-engineer                                             |

### Things left open for the architect

1. **Pre-generation vs on-demand** — Should stories be pre-generated in a background job (e.g., generate tomorrow's story tonight) or generated on-demand when the user clicks "Start"? Pre-generation is smoother UX but means wasted generations if the user doesn't show up.

2. **Audio/TTS** — Should words have audio? Options: browser-native Web Speech API (free, decent Hindi support), Google Cloud TTS, or skip initially. Recommendation: start with browser TTS, upgrade later.

3. **Devanagari input** — For exercises requiring Hindi text input, should the app include a virtual Devanagari keyboard, rely on OS-level input, or accept romanized input and transliterate?

4. **Word form handling** — When Claude uses a conjugated form in a story, how does the backend match it back to the root word? Options: maintain a conjugation table, use a Hindi stemmer/lemmatizer library (e.g., iNLTK), or include root_word_id in the Claude generation output.

5. **Offline capability** — For a self-hosted app on a home network this probably doesn't matter, but worth noting: stories can be cached for offline reading, but new generation requires API access.

---

## 8. API Endpoints (Suggested)

```
Auth
  POST   /api/auth/login
  POST   /api/auth/logout

User & Progress
  GET    /api/user/profile
  GET    /api/user/stats                    -- dashboard stats
  GET    /api/user/progress                 -- detailed progress data

Vocabulary
  GET    /api/words?status=known&limit=50   -- browse vocabulary
  PATCH  /api/words/{id}/status             -- manually mark known/unknown
  GET    /api/words/search?q=               -- search word database

Grammar
  GET    /api/grammar                       -- all concepts with user status
  GET    /api/grammar/{id}                  -- concept detail + examples

Stories
  POST   /api/stories/generate              -- generate new story (async)
  GET    /api/stories/{id}                  -- get story with sentences
  GET    /api/stories                       -- list past stories
  PATCH  /api/stories/{id}/rate             -- rate a story
  POST   /api/stories/{id}/complete         -- mark story complete

Exercises
  GET    /api/stories/{id}/exercises        -- get exercises for a story
  POST   /api/exercises/{id}/attempt        -- submit an answer
  POST   /api/exercises/{id}/evaluate       -- LLM evaluation for free-text

Reviews (SRS)
  GET    /api/reviews/due                   -- words due for review
  POST   /api/reviews                       -- submit review result (updates SRS)

Sessions
  POST   /api/sessions/start               -- begin a learning session
  PATCH  /api/sessions/{id}/end             -- end session, record stats

Onboarding
  POST   /api/onboarding/placement          -- submit placement quiz results
  POST   /api/onboarding/seed               -- seed initial vocabulary
```

---

## 9. Future Enhancements (Out of Scope for V1)

- **Conversation practice** — Chat with Claude in Hindi, with real-time corrections. The known-word tracking would make Claude aware of the learner's level.
- **Listening mode** — TTS reads the story aloud; learner follows along or does dictation exercises.
- **Grammar deep-dives** — Dedicated grammar lesson pages with explanations and drills (not just story-integrated practice).
- **Spaced story re-reading** — SRS but for entire stories: resurface a story from 2 weeks ago for re-reading to reinforce all its vocabulary at once.
- **Import from other sources** — Paste any Hindi text and get it annotated with word-level translations based on your known vocabulary, highlighting unknown words.
- **Mobile app** — PWA or React Native wrapper for mobile-friendly sessions.
