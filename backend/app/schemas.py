from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class SessionCreate(BaseModel):
    user_id: Optional[UUID] = None

class SessionResponse(BaseModel):
    id: UUID
    user_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    transcript: Optional[str] = None
    screen_summary: Optional[str] = None
    structured_intent: Optional[dict] = None

    class Config:
        from_attributes = True

class AudioUpload(BaseModel):
    audio_data: str

class ScreenUpload(BaseModel):
    screenshot_data: str

class StructuredIntent(BaseModel):
    goal: str
    current_state: str
    constraints: List[str]
    tools: List[str]
    skill_level: str
    desired_output: str

class PromptResponse(BaseModel):
    short_prompt: str
    detailed_prompt: str
    expert_prompt: str

class GenerateRequest(BaseModel):
    """Optional overrides; if provided, used instead of session DB values."""
    transcript: Optional[str] = None
    screen_summary: Optional[str] = None


class PromptGenerateResponse(BaseModel):
    session_id: UUID
    short_prompt: str
    detailed_prompt: str
    expert_prompt: str
    structured_intent: Optional[StructuredIntent] = None
