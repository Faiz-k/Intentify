"""
Shared Gemini REST client (text-only).
Uses Vertex generateContent + API key + gemini-2.5-flash-lite.
"""
from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from typing import Optional

from app.config import (
    GOOGLE_API_KEY,
    GOOGLE_LOCATION,
    GOOGLE_PROJECT_ID,
    VERTEX_AI_API_KEY,
)

MODEL = "gemini-2.5-flash-lite"


def _generate_text_sync(prompt: str, api_key: str) -> str:
    project = os.getenv("GOOGLE_PROJECT_ID", GOOGLE_PROJECT_ID)
    region = os.getenv("GOOGLE_LOCATION", GOOGLE_LOCATION)
    base_url = (
        f"https://{region}-aiplatform.googleapis.com/v1/projects/{project}"
        f"/locations/{region}/publishers/google/models"
    )
    url = f"{base_url}/{MODEL}:generateContent?key={api_key}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}]
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read().decode("utf-8")
    data = json.loads(raw)
    text_parts = []
    for c in data.get("candidates", []):
        for p in c.get("content", {}).get("parts", []):
            if "text" in p:
                text_parts.append(p["text"])
    result = "".join(text_parts).strip()
    if not result:
        raise Exception("Empty or invalid response from Gemini")
    return result


def get_api_key() -> str:
    return (
        os.getenv("VERTEX_AI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or VERTEX_AI_API_KEY
        or GOOGLE_API_KEY
        or ""
    )


async def generate_text(prompt: str, api_key: Optional[str] = None) -> str:
    key = api_key or get_api_key()
    if not key:
        raise Exception(
            "VERTEX_AI_API_KEY or GOOGLE_API_KEY required for Gemini REST"
        )
    try:
        return await asyncio.to_thread(_generate_text_sync, prompt, key)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        raise Exception(f"Gemini REST HTTP {e.code}: {raw}")


async def check_model() -> dict:
    """
    Lightweight check that Gemini REST (gemini-2.5-flash-lite) is reachable.
    Returns {"status": "ok", "model": "..."} or {"status": "error", "error": "..."}.
    """
    key = get_api_key()
    if not key:
        return {"status": "error", "error": "VERTEX_AI_API_KEY or GOOGLE_API_KEY not set"}
    try:
        out = await generate_text("Reply with exactly: OK", key)
        return {
            "status": "ok",
            "model": MODEL,
            "reply": (out.strip()[:80] + "…") if len(out.strip()) > 80 else out.strip(),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}
