from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from .db.models import (
    CEFRLevel,
    ExerciseType,
    GrammarStatus,
    PartOfSpeech,
    SessionType,
    WordSource,
    WordStatus,
)


# ============================================
# BASE SCHEMAS
# ============================================


class ApiResponse(BaseModel):
    success: bool
    error: Optional[str] = None


# ============================================
# USER SCHEMAS
# ============================================


class UserCreate(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: Optional[str]
    name: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class UserProgress(BaseModel):
    words_known: int
    words_learning: int
    grammar_learned: int
    current_level: CEFRLevel
    current_streak: int
    total_stories_completed: int
    total_exercises_completed: int


class UserStats(BaseModel):
    words_known: int
    level: CEFRLevel
    streak_days: int
    reviews_due: int


# ============================================
# WORD SCHEMAS
# ============================================


class WordBase(BaseModel):
    hindi: str
    romanized: str
    english: str
    part_of_speech: PartOfSpeech
    cefr_level: CEFRLevel
    tags: list[str] = []
    notes: Optional[str] = None


class WordCreate(WordBase):
    root_form_id: Optional[str] = None
    audio_url: Optional[str] = None


class WordResponse(WordBase):
    id: str
    root_form_id: Optional[str]
    audio_url: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserWordResponse(BaseModel):
    id: str
    word_id: str
    status: WordStatus
    familiarity: float
    times_seen: int
    times_reviewed: int
    times_correct: int
    last_seen_at: Optional[datetime]
    next_review_at: Optional[datetime]
    srs_interval_days: float
    source: WordSource
    word: WordResponse

    class Config:
        from_attributes = True


class WordWithProgress(WordResponse):
    user_progress: Optional[UserWordResponse] = None


# ============================================
# GRAMMAR SCHEMAS
# ============================================


class GrammarExampleSchema(BaseModel):
    hindi: str
    romanized: str
    english: str


class GrammarConceptBase(BaseModel):
    name: str
    slug: str
    description: str
    cefr_level: CEFRLevel
    sort_order: int
    examples: list[GrammarExampleSchema] = []
    prerequisite_ids: list[str] = []


class GrammarConceptCreate(GrammarConceptBase):
    pass


class GrammarConceptResponse(GrammarConceptBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserGrammarResponse(BaseModel):
    id: str
    grammar_concept_id: str
    status: GrammarStatus
    introduced_at: Optional[datetime]
    comfort_score: float
    grammar_concept: GrammarConceptResponse

    class Config:
        from_attributes = True


# ============================================
# STORY SCHEMAS
# ============================================


class SentenceWord(BaseModel):
    hindi: str
    romanized: str
    english: str
    word_id: Optional[str] = None
    root_word_id: Optional[str] = None
    is_new: bool = False
    part_of_speech: Optional[PartOfSpeech] = None
    grammar_note: Optional[str] = None


class StorySentence(BaseModel):
    index: int
    hindi: str
    romanized: str
    english: str
    words: list[SentenceWord]
    grammar_notes: list[str] = []


class StoryGenerateRequest(BaseModel):
    topic: Optional[str] = None
    include_word_ids: list[str] = []
    focus_grammar_id: Optional[str] = None
    difficulty_override: Optional[CEFRLevel] = None


class StoryResponse(BaseModel):
    id: str
    title: str
    content_hindi: str
    content_romanized: str
    content_english: str
    sentences: list[StorySentence]
    target_new_word_ids: list[str]
    target_grammar_ids: list[str]
    topic: Optional[str]
    difficulty_level: CEFRLevel
    word_count: int
    rating: Optional[int]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class StoryCompleteRequest(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5)


class StoryListResponse(BaseModel):
    id: str
    title: str
    topic: Optional[str]
    difficulty_level: CEFRLevel
    word_count: int
    completed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================
# EXERCISE SCHEMAS
# ============================================


class ExerciseQuestion(BaseModel):
    prompt: str
    context: Optional[str] = None
    sentence_index: Optional[int] = None


class ExerciseResponse(BaseModel):
    id: str
    story_id: str
    type: ExerciseType
    question: ExerciseQuestion
    options: Optional[list[str]] = None
    target_word_id: Optional[str]
    target_grammar_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ExerciseSubmitRequest(BaseModel):
    user_answer: str
    time_spent_seconds: Optional[int] = None


class ExerciseSubmitResponse(BaseModel):
    is_correct: bool
    correct_answer: str
    feedback: Optional[str] = None


class ExerciseAttemptResponse(BaseModel):
    id: str
    exercise_id: str
    user_answer: str
    is_correct: bool
    feedback: Optional[str]
    time_spent_seconds: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================
# REVIEW SCHEMAS
# ============================================


class ReviewWordResponse(BaseModel):
    user_word: UserWordResponse
    example_sentence: Optional[StorySentence] = None


class ReviewSubmitRequest(BaseModel):
    quality: int = Field(..., ge=0, le=5)  # SM-2 quality rating


class ReviewSubmitResponse(BaseModel):
    next_review_at: datetime
    new_interval_days: float
    status: WordStatus


class ReviewSummary(BaseModel):
    words_due: int
    words_reviewed_today: int
    next_review_time: Optional[datetime]


# ============================================
# SESSION SCHEMAS
# ============================================


class LearningSessionResponse(BaseModel):
    id: str
    session_type: SessionType
    story_id: Optional[str]
    words_introduced: int
    words_reviewed: int
    exercises_completed: int
    exercises_correct: int
    duration_seconds: int
    started_at: datetime
    ended_at: Optional[datetime]

    class Config:
        from_attributes = True


# ============================================
# AUTH SCHEMAS
# ============================================


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str
    password: str
