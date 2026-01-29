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

        prompt = """You are Intentify's screen analyst. Intentify diagnoses why the user is failing, not what the project offers.

CORE RULE (non-negotiable):
If the screen contains a documented hard constraint that can block the user entirely (whitelists, OAuth restrictions, disclaimers, "not allowed", "supported clients only"), surface it FIRST and center the analysis around it. Be willing to say: "Stop debugging. This isn't fixable yet." when that is true.

STRICT RULES:
- Do NOT describe visual design (themes, colors, layouts, icons).
- Do NOT list product features or capabilities unless they directly explain why the user is failing.
- Do NOT use README-driven or marketing language. Be user-driven: "why am I failing?" not "what does this offer?"
- Do NOT hedge. Use "will fail", "is gated", "not runnable" when that is the case; avoid "might", "could", "potentially" when the constraint is explicit.
- Treat README disclaimers, whitelists, and restrictions as PRIMARY signals.

OUTPUT FORMAT (MANDATORY). Use exactly these ### headers and order:

### Feasibility Verdict
One line. Pick exactly one:
- "Possible" — User can run this in their environment with no gating.
- "Possible with conditions" — User can run this only if they meet explicit conditions (e.g. whitelisted client, approved URI).
- "Not currently feasible in this environment" — Documented constraints make it not runnable for the user's case; stop debugging until something changes.

### Is This Runnable? What Blocks You?
Answer in 1–3 short sentences: (1) Is this project freely runnable by the user? (2) If not, what explicit constraint prevents it? (3) Is the user's failure likely expected given the documentation? Do NOT describe features. Focus on: "Here's why this might not be working — and whether it's fixable."

### What This Is
Do NOT describe what the software provides (e.g. "APIs for X"). Do describe: maturity level (experimental / testing-only / production-ready), who controls critical configuration (user vs provider), and whether the user has full autonomy to run it. Example: "Experimental integration guide for a provider-controlled MCP server with restricted OAuth access."

### Who Should Care (and Who Shouldn't)
Base this on constraints, not features. Explicitly call out environments that will FAIL. Example: "Should Care: Developers testing within supported OAuth clients. Should NOT: Developers attempting local, custom, or production deployments." Avoid vague personas like "e-commerce developers."

### Core Value Proposition
One value relevant to THIS screen only. Do NOT list all supported capabilities. If features do not impact installation or runnability success, exclude them. Example: "Controlled experimentation with MCP integrations" — NOT "food ordering features."

### Constraints (Not Differentiation)
If something limits user freedom (OAuth whitelist, allowed clients only, provider-controlled config), classify it as a CONSTRAINT and state it plainly. Do NOT call gating constraints "differentiation" or "risk" — call them constraints. What must be true for this to run?

### Blocker / Verdict
If a single issue blocks the user entirely, state it in one clear sentence. Example: "This setup will fail unless your OAuth redirect URI is explicitly whitelisted by the provider." Do NOT bury it in a bullet list. If nothing blocks, say "No single blocker identified."

### What to Ask Next
3–5 questions that help the user decide whether to continue or stop. Avoid exploratory or academic questions. Good: "Is it currently possible to run this with a custom OAuth client?" "Are installation failures expected outside the supported environments?" "Is there a workaround or is access gated?" Bad: "What are the limitations?" "Are there performance benchmarks?"

OPTIONAL (only if it adds context):
### Detailed Observations
Only if it clarifies runnability or constraints.

QUALITY BAR: If the output explains what the project offers instead of why the user is failing, it is wrong. If the user walks away knowing "I'm not doing anything wrong; I either need approval or a supported client," it is correct. Be assertive."""

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
