from fastapi import APIRouter
import vertexai
from vertexai.preview.generative_models import GenerativeModel
from app.config import GOOGLE_PROJECT_ID, GOOGLE_LOCATION, init_google_credentials

router = APIRouter()

@router.get("/models")
async def check_available_models():
    """
    Check which Gemini models are available in this project
    """
    try:
        init_google_credentials()
        vertexai.init(project=GOOGLE_PROJECT_ID, location=GOOGLE_LOCATION)
        
        # Try different model names
        model_names = [
            "gemini-1.5-pro",
            "gemini-1.5-flash",
            "gemini-pro",
            "gemini-1.0-pro"
        ]
        
        results = {}
        for model_name in model_names:
            try:
                model = GenerativeModel(model_name)
                # Try a simple test call
                response = model.generate_content("Say 'test'")
                results[model_name] = {
                    "status": "available",
                    "test_response": response.text[:50] if hasattr(response, 'text') else "No text"
                }
            except Exception as e:
                error_str = str(e)
                if "NOT_FOUND" in error_str or "not found" in error_str:
                    results[model_name] = {"status": "not_found", "error": "Model not found"}
                elif "PERMISSION_DENIED" in error_str:
                    results[model_name] = {"status": "permission_denied", "error": str(e)[:100]}
                else:
                    results[model_name] = {"status": "error", "error": str(e)[:100]}
        
        return {
            "project_id": GOOGLE_PROJECT_ID,
            "location": GOOGLE_LOCATION,
            "models": results
        }
    except Exception as e:
        return {
            "error": str(e),
            "project_id": GOOGLE_PROJECT_ID,
            "location": GOOGLE_LOCATION
        }
