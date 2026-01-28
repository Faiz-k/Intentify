from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from uuid import UUID
import logging
from app.database import get_db
from app.models import Session as SessionModel
from app.schemas import SessionCreate, SessionResponse
from app.services.speech import SpeechService
from app.services.vision import VisionService
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()
speech_service = SpeechService()
vision_service = VisionService()

@router.post("/start", response_model=SessionResponse)
async def start_session(
    session_data: SessionCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new session
    """
    try:
        new_session = SessionModel(
            user_id=session_data.user_id
        )
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        
        return SessionResponse(
            id=new_session.id,
            user_id=new_session.user_id,
            created_at=new_session.created_at,
            updated_at=new_session.updated_at,
            transcript=new_session.transcript,
            screen_summary=new_session.screen_summary,
            structured_intent=new_session.structured_intent
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/audio")
async def upload_audio(
    session_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload audio chunk and transcribe it
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
        
        audio_bytes = await file.read()
        transcript = await speech_service.transcribe_audio(audio_bytes)
        
        existing_transcript = session.transcript or ""
        updated_transcript = existing_transcript + " " + transcript if existing_transcript else transcript
        
        await db.execute(
            update(SessionModel)
            .where(SessionModel.id == session_uuid)
            .values(
                transcript=updated_transcript.strip(),
                updated_at=datetime.utcnow()
            )
        )
        await db.commit()
        
        return {"transcript": updated_transcript.strip(), "session_id": session_id}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.exception(f"Error uploading audio: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/capture")
async def capture_audio_and_screen(
    session_id: str,
    audio: UploadFile = File(None),
    screen: UploadFile = File(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload both audio and screen together in a single request
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
        
        if not audio and not screen:
            raise HTTPException(status_code=400, detail="At least one of audio or screen must be provided")
        
        transcript = None
        screen_summary = None
        
        # Process audio if provided
        if audio:
            audio_bytes = await audio.read()
            transcript_text = await speech_service.transcribe_audio(audio_bytes)
            existing_transcript = session.transcript or ""
            transcript = (existing_transcript + " " + transcript_text).strip() if existing_transcript else transcript_text
        
        # Process screen if provided
        if screen:
            screenshot_bytes = await screen.read()
            screen_summary = await vision_service.analyze_screenshot_bytes(screenshot_bytes)
        
        # Update session with both transcript and screen summary
        update_values = {"updated_at": datetime.utcnow()}
        if transcript is not None:
            update_values["transcript"] = transcript
        if screen_summary is not None:
            update_values["screen_summary"] = screen_summary
        
        await db.execute(
            update(SessionModel)
            .where(SessionModel.id == session_uuid)
            .values(**update_values)
        )
        await db.commit()
        
        return {
            "transcript": transcript or session.transcript,
            "screen_summary": screen_summary or session.screen_summary,
            "session_id": session_id
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.exception(f"Error capturing audio and screen: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/screen")
async def upload_screen(
    session_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload screenshot and analyze it (legacy endpoint - kept for backward compatibility)
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
        
        screenshot_bytes = await file.read()
        screen_summary = await vision_service.analyze_screenshot_bytes(screenshot_bytes)
        
        await db.execute(
            update(SessionModel)
            .where(SessionModel.id == session_uuid)
            .values(
                screen_summary=screen_summary,
                updated_at=datetime.utcnow()
            )
        )
        await db.commit()
        
        return {"screen_summary": screen_summary, "session_id": session_id}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.exception(f"Error uploading screen: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get session details
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
        
        return SessionResponse(
            id=session.id,
            user_id=session.user_id,
            created_at=session.created_at,
            updated_at=session.updated_at,
            transcript=session.transcript,
            screen_summary=session.screen_summary,
            structured_intent=session.structured_intent
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
