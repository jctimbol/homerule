import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from elevenlabs import ElevenLabs

router = APIRouter(prefix="/tts", tags=["tts"])

client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))


class TTSRequest(BaseModel):
    text: str


@router.post("")
async def text_to_speech(body: TTSRequest):
    try:
        audio = client.text_to_speech.convert(
            text=body.text,
            voice_id="JBFqnCBsd6RMkjVDRZzb",  # George — swap to any voice ID
            model_id="eleven_turbo_v2_5",
            output_format="mp3_44100_128",
        )
        return StreamingResponse(audio, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
