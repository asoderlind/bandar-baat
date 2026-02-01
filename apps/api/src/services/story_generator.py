import json
from typing import Optional

import anthropic
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import get_settings
from ..db import (
    CEFRLevel,
    Exercise,
    ExerciseType,
    GrammarConcept,
    Story,
    User,
    UserGrammar,
    UserWord,
    Word,
    WordStatus,
    GrammarStatus,
)

settings = get_settings()


class StoryGeneratorService:
    def __init__(self, db: AsyncSession, user: User):
        self.db = db
        self.user = user
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    async def generate_story(
        self,
        topic: Optional[str] = None,
        include_word_ids: list[str] = [],
        focus_grammar_id: Optional[str] = None,
        difficulty_override: Optional[CEFRLevel] = None,
    ) -> Story:
        """Generate a new story using Claude."""

        # Determine difficulty level
        level = difficulty_override or await self._determine_user_level()

        # Get known vocabulary
        known_words = await self._get_known_words()

        # Select new words to introduce
        new_words = await self._select_new_words(level, include_word_ids)

        # Get grammar to practice
        grammar_concepts = await self._get_available_grammar(focus_grammar_id)

        # Build prompt
        prompt = self._build_prompt(
            known_words=known_words,
            new_words=new_words,
            grammar_concepts=grammar_concepts,
            topic=topic or "daily life",
            level=level,
        )

        # Call Claude API
        response = await self._call_claude(prompt)

        # Parse response and create story
        story_data = self._parse_response(response)

        # Create story in database
        story = Story(
            user_id=self.user.id,
            title=story_data["title"],
            content_hindi=story_data["content_hindi"],
            content_romanized=story_data["content_romanized"],
            content_english=story_data["content_english"],
            sentences_json=story_data["sentences"],
            target_new_word_ids=[w.id for w in new_words],
            target_grammar_ids=[g.id for g in grammar_concepts],
            topic=topic,
            difficulty_level=level,
            word_count=story_data.get("word_count", 0),
            generation_prompt=prompt,
            llm_model="claude-sonnet-4-20250514",
            llm_response_raw={"content": response},
        )

        self.db.add(story)

        # Create exercises
        for exercise_data in story_data.get("exercises", []):
            exercise = Exercise(
                story_id=story.id,
                type=ExerciseType(exercise_data["type"]),
                question_json=exercise_data["question"],
                correct_answer=exercise_data["correct_answer"],
                options=exercise_data.get("options"),
                target_word_id=exercise_data.get("target_word_id"),
                target_grammar_id=exercise_data.get("target_grammar_id"),
            )
            self.db.add(exercise)

        await self.db.commit()
        await self.db.refresh(story)

        return story

    async def _determine_user_level(self) -> CEFRLevel:
        """Determine user's current level based on vocabulary."""
        result = await self.db.execute(
            select(func.count(UserWord.id)).where(
                and_(
                    UserWord.user_id == self.user.id,
                    UserWord.status.in_([WordStatus.KNOWN, WordStatus.MASTERED]),
                )
            )
        )
        words_known = result.scalar() or 0

        if words_known < 50:
            return CEFRLevel.A1
        elif words_known < 150:
            return CEFRLevel.A2
        elif words_known < 400:
            return CEFRLevel.B1
        else:
            return CEFRLevel.B2

    async def _get_known_words(self) -> list[Word]:
        """Get user's known vocabulary."""
        result = await self.db.execute(
            select(Word)
            .join(UserWord)
            .where(
                and_(
                    UserWord.user_id == self.user.id,
                    UserWord.status.in_(
                        [WordStatus.KNOWN, WordStatus.MASTERED, WordStatus.LEARNING]
                    ),
                )
            )
            .limit(300)  # Limit for prompt size
        )
        return list(result.scalars().all())

    async def _select_new_words(
        self, level: CEFRLevel, include_ids: list[str]
    ) -> list[Word]:
        """Select 3-5 new words to introduce."""
        # First, get any specifically requested words
        included_words = []
        if include_ids:
            result = await self.db.execute(select(Word).where(Word.id.in_(include_ids)))
            included_words = list(result.scalars().all())

        # Then get additional new words at appropriate level
        needed = max(0, 3 - len(included_words))
        if needed > 0:
            result = await self.db.execute(
                select(Word)
                .where(
                    and_(
                        Word.cefr_level == level,
                        ~Word.id.in_(
                            select(UserWord.word_id).where(
                                UserWord.user_id == self.user.id
                            )
                        ),
                        ~Word.id.in_([w.id for w in included_words]),
                    )
                )
                .order_by(func.random())
                .limit(needed + 2)  # Get a few extra
            )
            included_words.extend(result.scalars().all())

        return included_words[:5]

    async def _get_available_grammar(
        self, focus_id: Optional[str]
    ) -> list[GrammarConcept]:
        """Get grammar concepts to practice."""
        if focus_id:
            result = await self.db.execute(
                select(GrammarConcept).where(GrammarConcept.id == focus_id)
            )
            concept = result.scalar_one_or_none()
            if concept:
                return [concept]

        # Get grammar concepts the user is learning
        result = await self.db.execute(
            select(GrammarConcept)
            .join(UserGrammar)
            .where(
                and_(
                    UserGrammar.user_id == self.user.id,
                    UserGrammar.status.in_(
                        [GrammarStatus.LEARNING, GrammarStatus.AVAILABLE]
                    ),
                )
            )
            .order_by(GrammarConcept.sort_order)
            .limit(2)
        )
        return list(result.scalars().all())

    def _build_prompt(
        self,
        known_words: list[Word],
        new_words: list[Word],
        grammar_concepts: list[GrammarConcept],
        topic: str,
        level: CEFRLevel,
    ) -> str:
        """Build the prompt for Claude."""
        known_vocab_str = "\n".join(
            f"- {w.hindi} ({w.romanized}) — {w.english}" for w in known_words[:200]
        )

        new_vocab_str = "\n".join(
            f"- {w.hindi} ({w.romanized}) — {w.english}" for w in new_words
        )

        grammar_str = (
            "\n".join(f"- {g.name}: {g.description}" for g in grammar_concepts)
            if grammar_concepts
            else "Basic sentence structure"
        )

        return f"""You are a Hindi language teaching assistant. Generate a short story for a language learner at {level.value} level.

KNOWN VOCABULARY (the learner can read these):
{known_vocab_str or "Basic greetings and pronouns"}

NEW WORDS TO INTRODUCE (use each at least twice):
{new_vocab_str}

GRAMMAR TO PRACTICE:
{grammar_str}

TOPIC: {topic}

CONSTRAINTS:
- 8-12 sentences long
- Use only known vocabulary + new words (proper nouns like names are OK)
- Every new word must appear at least twice in different sentences
- Include 1-2 lines of dialogue
- Keep sentences simple and clear

Return your response as valid JSON with this exact structure:
{{
  "title": "Story title in Hindi and English",
  "content_hindi": "Full story in Devanagari",
  "content_romanized": "Full story romanized",
  "content_english": "English translation",
  "word_count": number,
  "sentences": [
    {{
      "index": 0,
      "hindi": "Sentence in Devanagari",
      "romanized": "Sentence romanized",
      "english": "English translation",
      "words": [
        {{
          "hindi": "word",
          "romanized": "word",
          "english": "meaning",
          "is_new": true/false,
          "part_of_speech": "NOUN/VERB/etc"
        }}
      ],
      "grammar_notes": ["Optional grammar explanations"]
    }}
  ],
  "exercises": [
    {{
      "type": "COMPREHENSION/FILL_BLANK/TRANSLATE_TO_HINDI/TRANSLATE_TO_ENGLISH/MULTIPLE_CHOICE",
      "question": {{
        "prompt": "Question text",
        "context": "Optional context",
        "sentence_index": 0
      }},
      "correct_answer": "The correct answer",
      "options": ["option1", "option2", "option3", "option4"]
    }}
  ]
}}

Generate 4-6 exercises mixing comprehension and vocabulary practice."""

    async def _call_claude(self, prompt: str) -> str:
        """Call Claude API and return response."""
        message = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text

    def _parse_response(self, response: str) -> dict:
        """Parse Claude's JSON response."""
        # Try to extract JSON from response
        try:
            # Handle potential markdown code blocks
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                response = response.split("```")[1].split("```")[0]

            return json.loads(response.strip())
        except json.JSONDecodeError as e:
            # Return a basic structure if parsing fails
            return {
                "title": "Generated Story",
                "content_hindi": response,
                "content_romanized": "",
                "content_english": "",
                "word_count": 0,
                "sentences": [],
                "exercises": [],
            }
