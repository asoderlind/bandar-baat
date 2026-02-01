from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import Story, User, UserWord, Word, WordStatus, get_db
from ..schemas import (
    ReviewSubmitRequest,
    ReviewSubmitResponse,
    ReviewSummary,
    ReviewWordResponse,
    StorySentence,
)

router = APIRouter()


@router.get("/due", response_model=list[ReviewWordResponse])
async def get_due_reviews(
    limit: int = Query(20, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get words due for review."""
    now = datetime.utcnow()

    result = await db.execute(
        select(UserWord)
        .options(selectinload(UserWord.word))
        .where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.next_review_at <= now,
                UserWord.status != WordStatus.MASTERED,
            )
        )
        .order_by(UserWord.next_review_at)
        .limit(limit)
    )
    user_words = result.scalars().all()

    # Get example sentences from stories for each word
    reviews = []
    for user_word in user_words:
        # Find a story that used this word
        story_result = await db.execute(
            select(Story)
            .where(
                and_(
                    Story.user_id == current_user.id,
                    Story.target_new_word_ids.contains([user_word.word_id]),
                )
            )
            .limit(1)
        )
        story = story_result.scalar_one_or_none()

        example_sentence = None
        if story and story.sentences_json:
            # Find a sentence containing this word
            for sentence_data in story.sentences_json:
                for word_data in sentence_data.get("words", []):
                    if word_data.get("word_id") == user_word.word_id:
                        example_sentence = StorySentence(**sentence_data)
                        break
                if example_sentence:
                    break

        reviews.append(
            ReviewWordResponse(
                user_word=user_word,
                example_sentence=example_sentence,
            )
        )

    return reviews


@router.get("/summary", response_model=ReviewSummary)
async def get_review_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get review summary for dashboard."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Count words due
    words_due_result = await db.execute(
        select(func.count(UserWord.id)).where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.next_review_at <= now,
                UserWord.status != WordStatus.MASTERED,
            )
        )
    )
    words_due = words_due_result.scalar() or 0

    # Count words reviewed today
    words_reviewed_result = await db.execute(
        select(func.count(UserWord.id)).where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.last_seen_at >= today_start,
            )
        )
    )
    words_reviewed_today = words_reviewed_result.scalar() or 0

    # Get next review time
    next_review_result = await db.execute(
        select(UserWord.next_review_at)
        .where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.next_review_at > now,
                UserWord.status != WordStatus.MASTERED,
            )
        )
        .order_by(UserWord.next_review_at)
        .limit(1)
    )
    next_review_time = next_review_result.scalar_one_or_none()

    return ReviewSummary(
        words_due=words_due,
        words_reviewed_today=words_reviewed_today,
        next_review_time=next_review_time,
    )


@router.post("/{user_word_id}/submit", response_model=ReviewSubmitResponse)
async def submit_review(
    user_word_id: str,
    request: ReviewSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a review result for a word (SM-2 algorithm)."""
    result = await db.execute(
        select(UserWord).where(
            and_(
                UserWord.id == user_word_id,
                UserWord.user_id == current_user.id,
            )
        )
    )
    user_word = result.scalar_one_or_none()
    if not user_word:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review word not found",
        )

    # SM-2 algorithm
    quality = request.quality  # 0-5 scale

    if quality < 3:
        # Failed review - reset interval
        user_word.srs_interval_days = 1
    else:
        # Update ease factor
        user_word.srs_ease_factor = max(
            1.3,
            user_word.srs_ease_factor
            + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
        )

        # Calculate new interval
        if user_word.srs_interval_days == 0:
            user_word.srs_interval_days = 1
        elif user_word.srs_interval_days == 1:
            user_word.srs_interval_days = 6
        else:
            user_word.srs_interval_days = round(
                user_word.srs_interval_days * user_word.srs_ease_factor
            )

    # Update review tracking
    user_word.times_reviewed += 1
    user_word.last_seen_at = datetime.utcnow()
    user_word.next_review_at = datetime.utcnow() + timedelta(
        days=user_word.srs_interval_days
    )

    if quality >= 3:
        user_word.times_correct += 1

    # Update status based on familiarity
    user_word.familiarity = min(
        1.0, user_word.times_correct / max(1, user_word.times_reviewed)
    )
    if user_word.familiarity >= 0.9 and user_word.srs_interval_days >= 21:
        user_word.status = WordStatus.MASTERED
    elif user_word.familiarity >= 0.7:
        user_word.status = WordStatus.KNOWN
    else:
        user_word.status = WordStatus.LEARNING

    await db.commit()

    return ReviewSubmitResponse(
        next_review_at=user_word.next_review_at,
        new_interval_days=user_word.srs_interval_days,
        status=user_word.status,
    )
