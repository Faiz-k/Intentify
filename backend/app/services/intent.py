import json

from app.services.gemini_rest import generate_text


class IntentService:
    def __init__(self) -> None:
        pass

    async def extract_intent(self, transcript: str, screen_summary: str) -> dict:
        """
        Extract structured intent from transcript and screen summary.
        Uses Gemini REST (gemini-2.5-flash-lite + API key).
        """
        prompt = f"""Based on the following user transcript and screen analysis, extract the user's intent and structure it as JSON.

Transcript: {transcript}

Screen Summary: {screen_summary}

Extract and return a JSON object with the following structure:
{{
  "goal": "clear description of what the user wants to achieve",
  "current_state": "description of current situation based on screen and context",
  "constraints": ["list", "of", "constraints", "or", "limitations"],
  "tools": ["list", "of", "tools", "or", "technologies", "mentioned"],
  "skill_level": "beginner/intermediate/expert",
  "desired_output": "what the user expects as output"
}}

Return ONLY valid JSON, no additional text."""

        try:
            response_text = await generate_text(prompt)
        except Exception as e:
            raise Exception(f"Intent extraction error: {str(e)}")

        response_text = response_text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        try:
            return json.loads(response_text)
        except json.JSONDecodeError as e:
            raise Exception(f"Failed to parse intent JSON: {str(e)}")
