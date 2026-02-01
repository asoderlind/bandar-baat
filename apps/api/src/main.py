from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import auth, words, grammar, stories, exercises, reviews, users

settings = get_settings()

app = FastAPI(
    title="Monke Say API",
    description="Hindi Learning Webapp - Comprehensible Input with AI-generated stories",
    version="0.1.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "0.1.0"}


# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/user", tags=["users"])
app.include_router(words.router, prefix="/api/words", tags=["words"])
app.include_router(grammar.router, prefix="/api/grammar", tags=["grammar"])
app.include_router(stories.router, prefix="/api/stories", tags=["stories"])
app.include_router(exercises.router, prefix="/api/exercises", tags=["exercises"])
app.include_router(reviews.router, prefix="/api/reviews", tags=["reviews"])
