import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from elevenlabs import ElevenLabs

router = APIRouter(prefix="/transcribe", tags=["transcribe"])

client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))


@router.post("")
async def transcribe(audio: UploadFile = File(...)):
    data = await audio.read()
    try:
        result = client.speech_to_text.convert(
            file=(audio.filename or "audio.webm", data, audio.content_type or "audio/webm"),
            model_id="scribe_v1",
        )
        return {"transcript": result.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
