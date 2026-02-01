import enum
from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


# ============================================
# ENUMS
# ============================================


class PartOfSpeech(str, enum.Enum):
    NOUN = "NOUN"
    VERB = "VERB"
    ADJECTIVE = "ADJECTIVE"
    ADVERB = "ADVERB"
    POSTPOSITION = "POSTPOSITION"
    PARTICLE = "PARTICLE"
    PRONOUN = "PRONOUN"
    CONJUNCTION = "CONJUNCTION"


class CEFRLevel(str, enum.Enum):
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"


class WordStatus(str, enum.Enum):
    NEW = "NEW"
    LEARNING = "LEARNING"
    KNOWN = "KNOWN"
    MASTERED = "MASTERED"


class GrammarStatus(str, enum.Enum):
    LOCKED = "LOCKED"
    AVAILABLE = "AVAILABLE"
    LEARNING = "LEARNING"
    LEARNED = "LEARNED"


class WordSource(str, enum.Enum):
    SEEDED = "SEEDED"
    STORY = "STORY"
    MANUAL = "MANUAL"
    REVIEW = "REVIEW"


class ExerciseType(str, enum.Enum):
    COMPREHENSION = "COMPREHENSION"
    FILL_BLANK = "FILL_BLANK"
    TRANSLATE_TO_HINDI = "TRANSLATE_TO_HINDI"
    TRANSLATE_TO_ENGLISH = "TRANSLATE_TO_ENGLISH"
    WORD_ORDER = "WORD_ORDER"
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"


class SessionType(str, enum.Enum):
    STORY = "STORY"
    REVIEW = "REVIEW"
    PLACEMENT = "PLACEMENT"
    FREE_PRACTICE = "FREE_PRACTICE"


# ============================================
# MODELS
# ============================================


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    email: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True
    )
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user_words: Mapped[list["UserWord"]] = relationship(back_populates="user")
    user_grammars: Mapped[list["UserGrammar"]] = relationship(back_populates="user")
    stories: Mapped[list["Story"]] = relationship(back_populates="user")
    learning_sessions: Mapped[list["LearningSession"]] = relationship(
        back_populates="user"
    )


class Word(Base):
    __tablename__ = "words"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    hindi: Mapped[str] = mapped_column(Text, nullable=False)
    romanized: Mapped[str] = mapped_column(Text, nullable=False)
    english: Mapped[str] = mapped_column(Text, nullable=False)
    part_of_speech: Mapped[PartOfSpeech] = mapped_column(
        Enum(PartOfSpeech), nullable=False
    )
    root_form_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("words.id"), nullable=True
    )
    cefr_level: Mapped[CEFRLevel] = mapped_column(Enum(CEFRLevel), nullable=False)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    audio_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Self-referential relationship for conjugations
    root_form: Mapped[Optional["Word"]] = relationship(
        "Word", remote_side=[id], backref="conjugations"
    )
    user_words: Mapped[list["UserWord"]] = relationship(back_populates="word")


class GrammarConcept(Base):
    __tablename__ = "grammar_concepts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    cefr_level: Mapped[CEFRLevel] = mapped_column(Enum(CEFRLevel), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    examples_json: Mapped[dict] = mapped_column(JSONB, default=list)
    prerequisite_ids: Mapped[list[str]] = mapped_column(
        ARRAY(UUID(as_uuid=False)), default=list
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user_grammars: Mapped[list["UserGrammar"]] = relationship(
        back_populates="grammar_concept"
    )


class UserWord(Base):
    __tablename__ = "user_words"
    __table_args__ = (UniqueConstraint("user_id", "word_id", name="uq_user_word"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    word_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("words.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[WordStatus] = mapped_column(Enum(WordStatus), default=WordStatus.NEW)
    familiarity: Mapped[float] = mapped_column(Float, default=0.0)
    times_seen: Mapped[int] = mapped_column(Integer, default=0)
    times_reviewed: Mapped[int] = mapped_column(Integer, default=0)
    times_correct: Mapped[int] = mapped_column(Integer, default=0)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    srs_interval_days: Mapped[float] = mapped_column(Float, default=1.0)
    srs_ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    source: Mapped[WordSource] = mapped_column(
        Enum(WordSource), default=WordSource.SEEDED
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="user_words")
    word: Mapped["Word"] = relationship(back_populates="user_words")


class UserGrammar(Base):
    __tablename__ = "user_grammars"
    __table_args__ = (
        UniqueConstraint("user_id", "grammar_concept_id", name="uq_user_grammar"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    grammar_concept_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("grammar_concepts.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[GrammarStatus] = mapped_column(
        Enum(GrammarStatus), default=GrammarStatus.LOCKED
    )
    introduced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    comfort_score: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="user_grammars")
    grammar_concept: Mapped["GrammarConcept"] = relationship(
        back_populates="user_grammars"
    )


class Story(Base):
    __tablename__ = "stories"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content_hindi: Mapped[str] = mapped_column(Text, nullable=False)
    content_romanized: Mapped[str] = mapped_column(Text, nullable=False)
    content_english: Mapped[str] = mapped_column(Text, nullable=False)
    sentences_json: Mapped[dict] = mapped_column(JSONB, default=list)
    target_new_word_ids: Mapped[list[str]] = mapped_column(
        ARRAY(UUID(as_uuid=False)), default=list
    )
    target_grammar_ids: Mapped[list[str]] = mapped_column(
        ARRAY(UUID(as_uuid=False)), default=list
    )
    topic: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    difficulty_level: Mapped[CEFRLevel] = mapped_column(Enum(CEFRLevel), nullable=False)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    generation_prompt: Mapped[str] = mapped_column(Text, default="")
    llm_model: Mapped[str] = mapped_column(
        String(100), default="claude-sonnet-4-20250514"
    )
    llm_response_raw: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="stories")
    exercises: Mapped[list["Exercise"]] = relationship(back_populates="story")


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    story_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("stories.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[ExerciseType] = mapped_column(Enum(ExerciseType), nullable=False)
    question_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text), nullable=True)
    target_word_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("words.id"), nullable=True
    )
    target_grammar_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("grammar_concepts.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    story: Mapped["Story"] = relationship(back_populates="exercises")


class ExerciseAttempt(Base):
    __tablename__ = "exercise_attempts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_answer: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    time_spent_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class LearningSession(Base):
    __tablename__ = "learning_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    session_type: Mapped[SessionType] = mapped_column(Enum(SessionType), nullable=False)
    story_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("stories.id"), nullable=True
    )
    words_introduced: Mapped[int] = mapped_column(Integer, default=0)
    words_reviewed: Mapped[int] = mapped_column(Integer, default=0)
    exercises_completed: Mapped[int] = mapped_column(Integer, default=0)
    exercises_correct: Mapped[int] = mapped_column(Integer, default=0)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="learning_sessions")
