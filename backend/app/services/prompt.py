import json

from app.services.gemini_rest import generate_text


class PromptService:
    def __init__(self) -> None:
        pass

    async def generate_prompts(self, structured_intent: dict) -> dict:
        """
        Generate three prompt variants (short, detailed, expert).
        Uses Gemini REST (gemini-2.5-flash-lite + API key).
        """
        intent_json = json.dumps(structured_intent, indent=2)
        prompt = f"""Based on this structured intent, generate three AI prompts:

Structured Intent:
{intent_json}

Generate three prompts:
1. Short prompt: Concise, direct, under 100 words
2. Detailed prompt: Comprehensive with context, 200-300 words
3. Expert prompt: Advanced, technical, assumes expertise, 300-400 words

Return ONLY a JSON object with this exact structure:
{{
  "short_prompt": "...",
  "detailed_prompt": "...",
  "expert_prompt": "..."
}}

Return ONLY valid JSON, no additional text."""

        try:
            response_text = await generate_text(prompt)
        except Exception as e:
            raise Exception(f"Prompt generation error: {str(e)}")

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
            raise Exception(f"Failed to parse prompts JSON: {str(e)}")
