import asyncio
import base64
import json
import os
import urllib.error
import urllib.request

from app.config import (
    GOOGLE_API_KEY,
    GOOGLE_LOCATION,
    GOOGLE_PROJECT_ID,
    VERTEX_AI_API_KEY,
)

# Use REST + API key. gemini-2.5-flash-lite works (SDK models 1.5-pro/1.5-flash 404).
MODEL = "gemini-2.5-flash-lite"


def _vision_rest(prompt: str, image_b64: str, api_key: str) -> str:
    project = os.getenv("GOOGLE_PROJECT_ID", GOOGLE_PROJECT_ID)
    region = os.getenv("GOOGLE_LOCATION", GOOGLE_LOCATION)
    base_url = (
        f"https://{region}-aiplatform.googleapis.com/v1/projects/{project}"
        f"/locations/{region}/publishers/google/models"
    )
    url = f"{base_url}/{MODEL}:generateContent?key={api_key}"

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {"inlineData": {"mimeType": "image/png", "data": image_b64}},
                ],
            }
        ]
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode("utf-8")

    data = json.loads(raw)
    text_parts = []
    for c in data.get("candidates", []):
        for p in c.get("content", {}).get("parts", []):
            if "text" in p:
                text_parts.append(p["text"])
    result = "".join(text_parts).strip()
    if not result:
        raise Exception("Empty or invalid response from vision model")
    return result


class VisionService:
    def __init__(self):
        self._api_key = os.getenv("VERTEX_AI_API_KEY") or os.getenv("GOOGLE_API_KEY") or VERTEX_AI_API_KEY or GOOGLE_API_KEY

    async def analyze_screenshot(self, screenshot_data: str) -> str:
        """Analyze screenshot (base64) using Gemini Vision REST."""
        try:
            image_bytes = base64.b64decode(screenshot_data)
            return await self.analyze_screenshot_bytes(image_bytes)
        except Exception as e:
            raise Exception(f"Vision analysis error: {str(e)}")

    async def analyze_screenshot_bytes(self, screenshot_bytes: bytes) -> str:
        """
        Analyze screenshot bytes using Gemini Vision via REST.
        Uses gemini-2.5-flash-lite + API key (Vertex SDK models 404 for this project).
        """
        if not self._api_key:
            raise Exception(
                "Vision requires VERTEX_AI_API_KEY or GOOGLE_API_KEY in environment"
            )

        prompt = """Analyze this screenshot and provide a detailed summary including:
1. What application or website is shown
2. Current UI state and visible elements
3. Any errors or issues visible
4. User context and what they might be trying to do
5. Key interactive elements

Provide a concise but comprehensive summary."""

        image_b64 = base64.b64encode(screenshot_bytes).decode("ascii")

        try:
            return await asyncio.to_thread(
                _vision_rest, prompt, image_b64, self._api_key
            )
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8")
            raise Exception(f"Vision analysis error: HTTP {e.code} {raw}")
        except Exception as e:
            raise Exception(f"Vision analysis error: {str(e)}")
