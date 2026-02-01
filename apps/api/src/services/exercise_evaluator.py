from dataclasses import dataclass
from typing import Optional

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import Exercise, ExerciseType

settings = get_settings()


@dataclass
class EvaluationResult:
    is_correct: bool
    feedback: Optional[str] = None


class ExerciseEvaluatorService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    async def evaluate(
        self,
        exercise: Exercise,
        user_answer: str,
    ) -> EvaluationResult:
        """Evaluate a user's answer."""

        # For multiple choice and simple matching, do exact comparison
        if exercise.type in [ExerciseType.MULTIPLE_CHOICE, ExerciseType.COMPREHENSION]:
            is_correct = self._normalize(user_answer) == self._normalize(
                exercise.correct_answer
            )
            return EvaluationResult(
                is_correct=is_correct,
                feedback=None
                if is_correct
                else f"The correct answer was: {exercise.correct_answer}",
            )

        # For fill in the blank, be more lenient
        if exercise.type == ExerciseType.FILL_BLANK:
            is_correct = self._fuzzy_match(user_answer, exercise.correct_answer)
            return EvaluationResult(
                is_correct=is_correct,
                feedback=None if is_correct else f"Expected: {exercise.correct_answer}",
            )

        # For translation exercises, use LLM evaluation
        if exercise.type in [
            ExerciseType.TRANSLATE_TO_HINDI,
            ExerciseType.TRANSLATE_TO_ENGLISH,
        ]:
            return await self.evaluate_with_llm(exercise, user_answer)

        # Word order - check if all words are present in correct order
        if exercise.type == ExerciseType.WORD_ORDER:
            is_correct = self._normalize(user_answer) == self._normalize(
                exercise.correct_answer
            )
            return EvaluationResult(
                is_correct=is_correct,
                feedback=None
                if is_correct
                else f"Correct order: {exercise.correct_answer}",
            )

        return EvaluationResult(is_correct=False, feedback="Unknown exercise type")

    async def evaluate_with_llm(
        self,
        exercise: Exercise,
        user_answer: str,
    ) -> EvaluationResult:
        """Use Claude to evaluate a free-text translation."""
        prompt = f"""You are evaluating a Hindi language learner's translation.
Be lenient with minor spelling variations in romanized Hindi.
Accept synonyms and alternative phrasings that convey the same meaning.
Focus on whether the grammar structure and meaning are correct.

Question: {exercise.question_json.get("prompt", "")}
Expected answer: {exercise.correct_answer}
Student's answer: {user_answer}

Evaluate: is this correct, partially correct, or incorrect?
Give brief, encouraging feedback in 1-2 sentences.

Respond in JSON format:
{{
  "is_correct": true/false,
  "feedback": "Your encouraging feedback here"
}}"""

        try:
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = message.content[0].text

            # Parse response
            import json

            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            result = json.loads(response_text.strip())
            return EvaluationResult(
                is_correct=result.get("is_correct", False),
                feedback=result.get("feedback"),
            )
        except Exception as e:
            # Fallback to simple comparison if LLM fails
            is_correct = self._fuzzy_match(user_answer, exercise.correct_answer)
            return EvaluationResult(
                is_correct=is_correct,
                feedback="Good attempt!"
                if is_correct
                else f"Expected something like: {exercise.correct_answer}",
            )

    def _normalize(self, text: str) -> str:
        """Normalize text for comparison."""
        return text.lower().strip().replace("  ", " ")

    def _fuzzy_match(self, answer: str, expected: str) -> bool:
        """Fuzzy match allowing for minor typos and variations."""
        answer_normalized = self._normalize(answer)
        expected_normalized = self._normalize(expected)

        # Exact match
        if answer_normalized == expected_normalized:
            return True

        # Check if romanized versions match (handle diacritics)
        answer_simple = self._simplify_romanization(answer_normalized)
        expected_simple = self._simplify_romanization(expected_normalized)

        if answer_simple == expected_simple:
            return True

        # Allow for very close matches (1-2 character difference for short words)
        if len(expected_normalized) <= 6:
            return (
                self._levenshtein_distance(answer_normalized, expected_normalized) <= 1
            )

        return self._levenshtein_distance(answer_normalized, expected_normalized) <= 2

    def _simplify_romanization(self, text: str) -> str:
        """Simplify romanization by removing common variations."""
        replacements = {
            "aa": "a",
            "ee": "i",
            "oo": "u",
            "sh": "s",
            "th": "t",
            "dh": "d",
            "bh": "b",
            "ph": "f",
            "kh": "k",
            "gh": "g",
            "chh": "ch",
        }
        result = text
        for old, new in replacements.items():
            result = result.replace(old, new)
        return result

    def _levenshtein_distance(self, s1: str, s2: str) -> int:
        """Calculate Levenshtein distance between two strings."""
        if len(s1) < len(s2):
            return self._levenshtein_distance(s2, s1)

        if len(s2) == 0:
            return len(s1)

        previous_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row

        return previous_row[-1]
