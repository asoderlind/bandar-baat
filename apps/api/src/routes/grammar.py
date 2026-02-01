from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..db import GrammarConcept, GrammarStatus, User, UserGrammar, get_db
from ..schemas import GrammarConceptCreate, GrammarConceptResponse, UserGrammarResponse

router = APIRouter()


@router.get("", response_model=list[GrammarConceptResponse])
async def list_grammar_concepts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all grammar concepts ordered by sort_order."""
    result = await db.execute(
        select(GrammarConcept).order_by(GrammarConcept.sort_order)
    )
    return result.scalars().all()


@router.get("/with-progress", response_model=list[UserGrammarResponse])
async def list_grammar_with_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all grammar concepts with user progress."""
    # Get all grammar concepts
    concepts_result = await db.execute(
        select(GrammarConcept).order_by(GrammarConcept.sort_order)
    )
    concepts = concepts_result.scalars().all()

    # Get user progress
    user_grammars_result = await db.execute(
        select(UserGrammar)
        .options(selectinload(UserGrammar.grammar_concept))
        .where(UserGrammar.user_id == current_user.id)
    )
    user_grammars = {
        ug.grammar_concept_id: ug for ug in user_grammars_result.scalars().all()
    }

    # Build response with progress for each concept
    response = []
    for concept in concepts:
        if concept.id in user_grammars:
            response.append(user_grammars[concept.id])
        else:
            # Create a virtual user grammar entry (not persisted)
            response.append(
                UserGrammarResponse(
                    id="",
                    grammar_concept_id=concept.id,
                    status=GrammarStatus.LOCKED,
                    introduced_at=None,
                    comfort_score=0.0,
                    grammar_concept=GrammarConceptResponse.model_validate(concept),
                )
            )

    return response


@router.get("/{concept_id}", response_model=GrammarConceptResponse)
async def get_grammar_concept(
    concept_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific grammar concept."""
    result = await db.execute(
        select(GrammarConcept).where(GrammarConcept.id == concept_id)
    )
    concept = result.scalar_one_or_none()
    if not concept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grammar concept not found",
        )
    return concept


@router.post(
    "", response_model=GrammarConceptResponse, status_code=status.HTTP_201_CREATED
)
async def create_grammar_concept(
    concept_data: GrammarConceptCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new grammar concept."""
    concept = GrammarConcept(
        name=concept_data.name,
        slug=concept_data.slug,
        description=concept_data.description,
        cefr_level=concept_data.cefr_level,
        sort_order=concept_data.sort_order,
        examples_json=[ex.model_dump() for ex in concept_data.examples],
        prerequisite_ids=concept_data.prerequisite_ids,
    )
    db.add(concept)
    await db.commit()
    await db.refresh(concept)
    return concept


@router.post("/{concept_id}/unlock")
async def unlock_grammar_concept(
    concept_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unlock a grammar concept for the user."""
    # Check if concept exists
    result = await db.execute(
        select(GrammarConcept).where(GrammarConcept.id == concept_id)
    )
    concept = result.scalar_one_or_none()
    if not concept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grammar concept not found",
        )

    # Check prerequisites
    if concept.prerequisite_ids:
        prereq_result = await db.execute(
            select(UserGrammar).where(
                and_(
                    UserGrammar.user_id == current_user.id,
                    UserGrammar.grammar_concept_id.in_(concept.prerequisite_ids),
                    UserGrammar.status == GrammarStatus.LEARNED,
                )
            )
        )
        learned_prereqs = prereq_result.scalars().all()
        if len(learned_prereqs) < len(concept.prerequisite_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Prerequisites not met",
            )

    # Get or create UserGrammar
    user_grammar_result = await db.execute(
        select(UserGrammar).where(
            and_(
                UserGrammar.user_id == current_user.id,
                UserGrammar.grammar_concept_id == concept_id,
            )
        )
    )
    user_grammar = user_grammar_result.scalar_one_or_none()

    if user_grammar:
        if user_grammar.status == GrammarStatus.LOCKED:
            user_grammar.status = GrammarStatus.AVAILABLE
    else:
        user_grammar = UserGrammar(
            user_id=current_user.id,
            grammar_concept_id=concept_id,
            status=GrammarStatus.AVAILABLE,
        )
        db.add(user_grammar)

    await db.commit()
    return {"success": True, "status": GrammarStatus.AVAILABLE}
