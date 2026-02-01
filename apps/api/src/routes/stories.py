from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import (
    CEFRLevel,
    Exercise,
    GrammarConcept,
    Story,
    User,
    UserWord,
    Word,
    WordStatus,
    get_db,
)
from ..schemas import (
    StoryCompleteRequest,
    StoryGenerateRequest,
    StoryListResponse,
    StoryResponse,
)
from ..services.story_generator import StoryGeneratorService

router = APIRouter()


@router.get("", response_model=list[StoryListResponse])
async def list_stories(
    completed: Optional[bool] = None,
    limit: int = Query(20, le=50),
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's stories."""
    query = select(Story).where(Story.user_id == current_user.id)

    if completed is True:
        query = query.where(Story.completed_at.isnot(None))
    elif completed is False:
        query = query.where(Story.completed_at.is_(None))

    query = query.order_by(Story.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/ready")
async def get_ready_story_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get information about the next story to generate."""
    # Count user's known words
    words_known_result = await db.execute(
        select(func.count(UserWord.id)).where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.status.in_([WordStatus.KNOWN, WordStatus.MASTERED]),
            )
        )
    )
    words_known = words_known_result.scalar() or 0

    # Determine appropriate level
    if words_known < 50:
        level = CEFRLevel.A1
    elif words_known < 150:
        level = CEFRLevel.A2
    elif words_known < 400:
        level = CEFRLevel.B1
    else:
        level = CEFRLevel.B2

    # Get available new words at this level
    new_words_result = await db.execute(
        select(Word)
        .where(
            and_(
                Word.cefr_level == level,
                ~Word.id.in_(
                    select(UserWord.word_id).where(UserWord.user_id == current_user.id)
                ),
            )
        )
        .limit(5)
    )
    available_new_words = new_words_result.scalars().all()

    return {
        "ready": len(available_new_words) >= 3,
        "level": level,
        "new_words_available": len(available_new_words),
        "suggested_topic": "daily life",  # TODO: rotating topics
    }


@router.post("/generate", response_model=StoryResponse)
async def generate_story(
    request: StoryGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new story using Claude."""
    generator = StoryGeneratorService(db, current_user)
    story = await generator.generate_story(
        topic=request.topic,
        include_word_ids=request.include_word_ids,
        focus_grammar_id=request.focus_grammar_id,
        difficulty_override=request.difficulty_override,
    )
    return story


@router.get("/{story_id}", response_model=StoryResponse)
async def get_story(
    story_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific story."""
    result = await db.execute(
        select(Story).where(
            and_(
                Story.id == story_id,
                Story.user_id == current_user.id,
            )
        )
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )
    return story


@router.post("/{story_id}/complete")
async def complete_story(
    story_id: str,
    request: StoryCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a story as completed."""
    result = await db.execute(
        select(Story).where(
            and_(
                Story.id == story_id,
                Story.user_id == current_user.id,
            )
        )
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    story.completed_at = datetime.utcnow()
    if request.rating:
        story.rating = request.rating

    # Mark new words as seen
    for word_id in story.target_new_word_ids:
        user_word_result = await db.execute(
            select(UserWord).where(
                and_(
                    UserWord.user_id == current_user.id,
                    UserWord.word_id == word_id,
                )
            )
        )
        user_word = user_word_result.scalar_one_or_none()
        if user_word:
            user_word.times_seen += 1
            user_word.last_seen_at = datetime.utcnow()
            if user_word.status == WordStatus.NEW:
                user_word.status = WordStatus.LEARNING
        else:
            user_word = UserWord(
                user_id=current_user.id,
                word_id=word_id,
                status=WordStatus.LEARNING,
                times_seen=1,
                last_seen_at=datetime.utcnow(),
            )
            db.add(user_word)

    await db.commit()
    return {"success": True, "completed_at": story.completed_at}


@router.get("/{story_id}/exercises")
async def get_story_exercises(
    story_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get exercises for a story."""
    # Verify story belongs to user
    story_result = await db.execute(
        select(Story).where(
            and_(
                Story.id == story_id,
                Story.user_id == current_user.id,
            )
        )
    )
    if not story_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    result = await db.execute(
        select(Exercise)
        .where(Exercise.story_id == story_id)
        .order_by(Exercise.created_at)
    )
    return result.scalars().all()
