from fastapi import APIRouter

from app.config import GOOGLE_LOCATION, GOOGLE_PROJECT_ID
from app.services import gemini_rest

router = APIRouter()


@router.get("/models")
async def check_available_models():
    """
    Check Gemini REST (gemini-2.5-flash-lite) availability via API key.
    """
    result = await gemini_rest.check_model()
    return {
        "project_id": GOOGLE_PROJECT_ID,
        "location": GOOGLE_LOCATION,
        "gemini": result,
    }
