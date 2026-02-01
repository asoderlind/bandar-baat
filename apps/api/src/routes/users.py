from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import (
    CEFRLevel,
    ExerciseAttempt,
    GrammarStatus,
    LearningSession,
    Story,
    User,
    UserGrammar,
    UserWord,
    WordStatus,
    get_db,
)
from ..schemas import UserProgress, UserResponse, UserStats

router = APIRouter()


@router.get("/profile", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile."""
    return current_user


@router.get("/stats", response_model=UserStats)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user statistics for dashboard."""
    # Count known words
    words_known_result = await db.execute(
        select(func.count(UserWord.id)).where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.status.in_([WordStatus.KNOWN, WordStatus.MASTERED]),
            )
        )
    )
    words_known = words_known_result.scalar() or 0

    # Count reviews due
    reviews_due_result = await db.execute(
        select(func.count(UserWord.id)).where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.next_review_at <= datetime.utcnow(),
                UserWord.status != WordStatus.MASTERED,
            )
        )
    )
    reviews_due = reviews_due_result.scalar() or 0

    # Calculate streak (simplified: consecutive days with completed sessions)
    streak_days = await _calculate_streak(db, current_user.id)

    # Determine level based on words known
    level = _determine_level(words_known)

    return UserStats(
        words_known=words_known,
        level=level,
        streak_days=streak_days,
        reviews_due=reviews_due,
    )


@router.get("/progress", response_model=UserProgress)
async def get_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed user progress."""
    # Count words by status
    words_known_result = await db.execute(
        select(func.count(UserWord.id)).where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.status.in_([WordStatus.KNOWN, WordStatus.MASTERED]),
            )
        )
    )
    words_known = words_known_result.scalar() or 0

    words_learning_result = await db.execute(
        select(func.count(UserWord.id)).where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.status == WordStatus.LEARNING,
            )
        )
    )
    words_learning = words_learning_result.scalar() or 0

    # Count learned grammar
    grammar_learned_result = await db.execute(
        select(func.count(UserGrammar.id)).where(
            and_(
                UserGrammar.user_id == current_user.id,
                UserGrammar.status == GrammarStatus.LEARNED,
            )
        )
    )
    grammar_learned = grammar_learned_result.scalar() or 0

    # Count completed stories
    stories_completed_result = await db.execute(
        select(func.count(Story.id)).where(
            and_(
                Story.user_id == current_user.id,
                Story.completed_at.isnot(None),
            )
        )
    )
    total_stories_completed = stories_completed_result.scalar() or 0

    # Count completed exercises
    exercises_completed_result = await db.execute(
        select(func.count(ExerciseAttempt.id)).where(
            ExerciseAttempt.user_id == current_user.id
        )
    )
    total_exercises_completed = exercises_completed_result.scalar() or 0

    # Calculate streak and level
    streak_days = await _calculate_streak(db, current_user.id)
    level = _determine_level(words_known)

    return UserProgress(
        words_known=words_known,
        words_learning=words_learning,
        grammar_learned=grammar_learned,
        current_level=level,
        current_streak=streak_days,
        total_stories_completed=total_stories_completed,
        total_exercises_completed=total_exercises_completed,
    )


async def _calculate_streak(db: AsyncSession, user_id: str) -> int:
    """Calculate the current learning streak in days."""
    # Get all completed sessions ordered by date
    result = await db.execute(
        select(LearningSession.started_at)
        .where(
            and_(
                LearningSession.user_id == user_id,
                LearningSession.ended_at.isnot(None),
            )
        )
        .order_by(LearningSession.started_at.desc())
    )
    sessions = result.scalars().all()

    if not sessions:
        return 0

    streak = 0
    current_date = datetime.utcnow().date()

    for session in sessions:
        session_date = session.date()
        if session_date == current_date:
            streak = max(streak, 1)
        elif session_date == current_date - __import__("datetime").timedelta(days=1):
            streak += 1
            current_date = session_date
        else:
            break

    return streak


def _determine_level(words_known: int) -> CEFRLevel:
    """Determine CEFR level based on vocabulary size."""
    if words_known < 100:
        return CEFRLevel.A1
    elif words_known < 300:
        return CEFRLevel.A2
    elif words_known < 600:
        return CEFRLevel.B1
    else:
        return CEFRLevel.B2
