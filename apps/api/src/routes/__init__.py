from .auth import router as auth_router
from .words import router as words_router
from .grammar import router as grammar_router
from .stories import router as stories_router
from .exercises import router as exercises_router
from .reviews import router as reviews_router
from .users import router as users_router

__all__ = [
    "auth_router",
    "words_router",
    "grammar_router",
    "stories_router",
    "exercises_router",
    "reviews_router",
    "users_router",
]
