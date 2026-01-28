from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from uuid import UUID
import logging
from app.database import get_db
from app.models import Session as SessionModel, Prompt as PromptModel
from app.schemas import GenerateRequest, PromptGenerateResponse
from app.services.intent import IntentService
from app.services.prompt import PromptService
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()
intent_service = IntentService()
prompt_service = PromptService()

@router.post("/{session_id}/generate", response_model=PromptGenerateResponse)
async def generate_prompts(
    session_id: str,
    body: GenerateRequest | None = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate prompts from session data (transcript + screen summary).
    Optional body transcript/screen_summary override DB values (e.g. user-edited).
    """
    try:
        session_uuid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    
    try:
        result = await db.execute(
            select(SessionModel).where(SessionModel.id == session_uuid)
        )
        session = result.scalar_one_or_none()
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        transcript = (body.transcript if body and body.transcript is not None else None) or (session.transcript or "")
        screen_summary = (body.screen_summary if body and body.screen_summary is not None else None) or (session.screen_summary or "")
        
        if not transcript.strip() and not screen_summary.strip():
            raise HTTPException(status_code=400, detail="Session needs transcript or screen summary")
        
        structured_intent = None
        if transcript.strip() or screen_summary.strip():
            try:
                structured_intent = await intent_service.extract_intent(transcript, screen_summary)
                await db.execute(
                    update(SessionModel)
                    .where(SessionModel.id == session_uuid)
                    .values(
                        structured_intent=structured_intent,
                        updated_at=datetime.utcnow()
                    )
                )
                await db.commit()
            except Exception as e:
                await db.rollback()
                logger.exception(f"Intent extraction failed: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Intent extraction failed: {str(e)}")
        
        if not structured_intent:
            raise HTTPException(status_code=400, detail="Failed to extract structured intent")
        
        try:
            prompts = await prompt_service.generate_prompts(structured_intent)
        except Exception as e:
            logger.exception(f"Prompt generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Prompt generation failed: {str(e)}")
        
        prompt_record = PromptModel(
            session_id=session_uuid,
            raw_text=transcript,
            screenshot_summary=screen_summary,
            structured_intent=structured_intent,
            short_prompt=prompts.get("short_prompt"),
            detailed_prompt=prompts.get("detailed_prompt"),
            expert_prompt=prompts.get("expert_prompt")
        )
        
        db.add(prompt_record)
        await db.commit()
        await db.refresh(prompt_record)
        
        return PromptGenerateResponse(
            session_id=session_uuid,
            short_prompt=prompts.get("short_prompt", ""),
            detailed_prompt=prompts.get("detailed_prompt", ""),
            expert_prompt=prompts.get("expert_prompt", ""),
            structured_intent=structured_intent
        )
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.exception(f"Error generating prompts: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
