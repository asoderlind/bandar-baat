from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..db import Exercise, ExerciseAttempt, Story, User, get_db
from ..schemas import ExerciseResponse, ExerciseSubmitRequest, ExerciseSubmitResponse
from ..services.exercise_evaluator import ExerciseEvaluatorService

router = APIRouter()


@router.get("/{exercise_id}", response_model=ExerciseResponse)
async def get_exercise(
    exercise_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific exercise."""
    result = await db.execute(
        select(Exercise)
        .join(Story)
        .where(
            and_(
                Exercise.id == exercise_id,
                Story.user_id == current_user.id,
            )
        )
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found",
        )
    return exercise


@router.post("/{exercise_id}/submit", response_model=ExerciseSubmitResponse)
async def submit_exercise(
    exercise_id: str,
    request: ExerciseSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit an answer for an exercise."""
    # Get exercise
    result = await db.execute(
        select(Exercise)
        .join(Story)
        .where(
            and_(
                Exercise.id == exercise_id,
                Story.user_id == current_user.id,
            )
        )
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found",
        )

    # Evaluate answer
    evaluator = ExerciseEvaluatorService(db)
    evaluation = await evaluator.evaluate(
        exercise=exercise,
        user_answer=request.user_answer,
    )

    # Record attempt
    attempt = ExerciseAttempt(
        user_id=current_user.id,
        exercise_id=exercise_id,
        user_answer=request.user_answer,
        is_correct=evaluation.is_correct,
        feedback=evaluation.feedback,
        time_spent_seconds=request.time_spent_seconds,
    )
    db.add(attempt)
    await db.commit()

    return ExerciseSubmitResponse(
        is_correct=evaluation.is_correct,
        correct_answer=exercise.correct_answer,
        feedback=evaluation.feedback,
    )


@router.post("/{exercise_id}/evaluate")
async def evaluate_free_text(
    exercise_id: str,
    request: ExerciseSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Evaluate a free-text answer using LLM (for translation exercises)."""
    result = await db.execute(
        select(Exercise)
        .join(Story)
        .where(
            and_(
                Exercise.id == exercise_id,
                Story.user_id == current_user.id,
            )
        )
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found",
        )

    evaluator = ExerciseEvaluatorService(db)
    evaluation = await evaluator.evaluate_with_llm(
        exercise=exercise,
        user_answer=request.user_answer,
    )

    return {
        "is_correct": evaluation.is_correct,
        "correct_answer": exercise.correct_answer,
        "feedback": evaluation.feedback,
    }
