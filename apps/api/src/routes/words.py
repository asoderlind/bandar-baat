from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import CEFRLevel, User, UserWord, Word, WordStatus, get_db
from ..schemas import WordCreate, WordResponse, WordWithProgress

router = APIRouter()


@router.get("", response_model=list[WordWithProgress])
async def list_words(
    status_filter: Optional[WordStatus] = Query(None, alias="status"),
    level: Optional[CEFRLevel] = None,
    search: Optional[str] = Query(None, alias="q"),
    limit: int = Query(50, le=200),
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List words with optional filtering."""
    # Build base query
    query = select(Word)

    # Apply filters
    if level:
        query = query.where(Word.cefr_level == level)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Word.hindi.ilike(search_pattern),
                Word.romanized.ilike(search_pattern),
                Word.english.ilike(search_pattern),
            )
        )

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    words = result.scalars().all()

    # Get user progress for these words
    word_ids = [w.id for w in words]
    user_words_result = await db.execute(
        select(UserWord)
        .options(selectinload(UserWord.word))
        .where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.word_id.in_(word_ids),
            )
        )
    )
    user_words = {uw.word_id: uw for uw in user_words_result.scalars().all()}

    # Apply status filter if provided
    response_words = []
    for word in words:
        user_word = user_words.get(word.id)
        if status_filter:
            word_status = user_word.status if user_word else WordStatus.NEW
            if word_status != status_filter:
                continue
        response_words.append(
            WordWithProgress(
                **WordResponse.model_validate(word).model_dump(),
                user_progress=user_word,
            )
        )

    return response_words


@router.get("/search", response_model=list[WordResponse])
async def search_words(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Search words by query string."""
    search_pattern = f"%{q}%"
    result = await db.execute(
        select(Word)
        .where(
            or_(
                Word.hindi.ilike(search_pattern),
                Word.romanized.ilike(search_pattern),
                Word.english.ilike(search_pattern),
            )
        )
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{word_id}", response_model=WordWithProgress)
async def get_word(
    word_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific word with user progress."""
    result = await db.execute(select(Word).where(Word.id == word_id))
    word = result.scalar_one_or_none()
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Word not found"
        )

    # Get user progress
    user_word_result = await db.execute(
        select(UserWord)
        .options(selectinload(UserWord.word))
        .where(
            and_(
                UserWord.user_id == current_user.id,
                UserWord.word_id == word_id,
            )
        )
    )
    user_word = user_word_result.scalar_one_or_none()

    return WordWithProgress(
        **WordResponse.model_validate(word).model_dump(),
        user_progress=user_word,
    )


@router.post("", response_model=WordResponse, status_code=status.HTTP_201_CREATED)
async def create_word(
    word_data: WordCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new word (admin only in production)."""
    word = Word(**word_data.model_dump())
    db.add(word)
    await db.commit()
    await db.refresh(word)
    return word


@router.post("/{word_id}/mark-known")
async def mark_word_known(
    word_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a word as known by the user."""
    # Check if word exists
    result = await db.execute(select(Word).where(Word.id == word_id))
    word = result.scalar_one_or_none()
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Word not found"
        )

    # Get or create UserWord
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
        user_word.status = WordStatus.KNOWN
        user_word.familiarity = 0.8
    else:
        user_word = UserWord(
            user_id=current_user.id,
            word_id=word_id,
            status=WordStatus.KNOWN,
            familiarity=0.8,
        )
        db.add(user_word)

    await db.commit()
    return {"success": True, "status": WordStatus.KNOWN}
