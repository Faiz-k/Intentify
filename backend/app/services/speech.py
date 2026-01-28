from google.cloud import speech_v1
from google.cloud.speech_v1 import types
import os
import base64
from app.config import GOOGLE_PROJECT_ID, init_google_credentials

class SpeechService:
    def __init__(self):
        # Ensure credentials are initialized
        init_google_credentials()
        self.client = speech_v1.SpeechClient()
        self.project_id = GOOGLE_PROJECT_ID
    
    async def transcribe_audio(self, audio_data: bytes, language_code: str = "en-US") -> str:
        """
        Convert audio bytes to transcript using Google Speech-to-Text API
        """
        try:
            audio = types.RecognitionAudio(content=audio_data)
            config = types.RecognitionConfig(
                encoding=types.RecognitionConfig.AudioEncoding.WEBM_OPUS,
                sample_rate_hertz=48000,
                language_code=language_code,
                enable_automatic_punctuation=True,
            )
            
            response = self.client.recognize(config=config, audio=audio)
            
            transcript = ""
            for result in response.results:
                transcript += result.alternatives[0].transcript + " "
            
            return transcript.strip()
        except Exception as e:
            raise Exception(f"Speech-to-Text error: {str(e)}")
    
    async def transcribe_audio_base64(self, audio_base64: str) -> str:
        """
        Convert base64 encoded audio to transcript
        """
        try:
            audio_bytes = base64.b64decode(audio_base64)
            return await self.transcribe_audio(audio_bytes)
        except Exception as e:
            raise Exception(f"Speech-to-Text error: {str(e)}")
