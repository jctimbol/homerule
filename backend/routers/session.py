import uuid
import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/session", tags=["session"])

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"

# In-memory session store (replace with DB later)
sessions: dict[str, dict] = {}

INTAKE_SYSTEM_PROMPT = """You are a tenant rights intake assistant specializing in East Bay, California housing law (Oakland, Berkeley, Hayward, Fremont, and surrounding cities).

Your job is to gather the facts needed to research which local ordinances apply to the user's situation. Ask ONE follow-up question at a time if you need more information.

IMPORTANT: Only ask questions a typical renter would know off the top of their head. Never ask about legal classifications, ordinance coverage, building permits, or whether a unit is "covered" by any program — the renter won't know that. Instead ask about:
- What city/neighborhood they live in
- What happened (rent increase amount, eviction notice, repair issue, etc.)
- When it happened or when it takes effect
- How long they've lived there
- Whether they rent a room, apartment, or house

When you have enough facts to research the applicable laws, respond with READY_TO_RESEARCH.

Always respond in this JSON format:
{
  "status": "NEED_FACTS" | "READY_TO_RESEARCH",
  "question": "<follow-up question if NEED_FACTS>",
  "facts": {
    "city": "<city if known>",
    "issue": "<rent increase | eviction | habitability | deposit | other>",
    "details": "<brief summary of the situation>"
  }
}

Required facts before READY_TO_RESEARCH:
- City or neighborhood
- What the issue is and key details (amount, timeline, etc.)"""


class CreateSessionResponse(BaseModel):
    session_id: str


class MessageRequest(BaseModel):
    transcript: str


class MessageResponse(BaseModel):
    status: str  # "NEED_FACTS" | "READY_TO_RESEARCH" | "VERDICT"
    question: str | None = None
    verdict: str | None = None
    facts: dict | None = None


@router.post("", response_model=CreateSessionResponse)
async def create_session():
    session_id = str(uuid.uuid4())
    sessions[session_id] = {"history": [], "facts": {}}
    return {"session_id": session_id}


@router.post("/{session_id}/message", response_model=MessageResponse)
async def send_message(session_id: str, body: MessageRequest):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    session["history"].append({"role": "user", "content": body.transcript})

    intake_result = await run_intake(session["history"])

    if intake_result["status"] == "NEED_FACTS":
        question = intake_result.get("question", "Can you tell me more?")
        session["history"].append({"role": "assistant", "content": question})
        if intake_result.get("facts"):
            session["facts"].update(intake_result["facts"])
        return MessageResponse(status="NEED_FACTS", question=question, facts=session["facts"])

    # READY_TO_RESEARCH
    session["facts"].update(intake_result.get("facts", {}))
    verdict = await research_ordinance(session["facts"])
    session["verdict"] = verdict
    return MessageResponse(status="VERDICT", verdict=verdict, facts=session["facts"])


async def run_intake(history: list[dict]) -> dict:
    import json

    messages = [{"role": "system", "content": INTAKE_SYSTEM_PROMPT}] + history

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            PERPLEXITY_URL,
            headers={"Authorization": f"Bearer {PERPLEXITY_API_KEY}"},
            json={"model": "sonar", "messages": messages},
            timeout=30,
        )
        resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"]

    # Strip markdown code fences if present
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    return json.loads(content)


async def research_ordinance(facts: dict) -> str:
    city = facts.get("city", "East Bay")
    issue = facts.get("issue", "tenant rights")
    details = facts.get("details", "")

    query = f"{city} California tenant rights ordinance: {issue}. {details}"

    messages = [
        {
            "role": "system",
            "content": (
                "You are a tenant rights legal researcher specializing in East Bay, California. "
                "Given the facts, look up the specific local ordinance that applies and explain: "
                "1) What law applies and its key provisions, "
                "2) Whether the landlord's action appears legal or illegal, "
                "3) What the tenant's rights and options are. "
                "Cite specific ordinance names, section numbers, and rent board contacts where applicable."
            ),
        },
        {"role": "user", "content": query},
    ]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            PERPLEXITY_URL,
            headers={"Authorization": f"Bearer {PERPLEXITY_API_KEY}"},
            json={"model": "sonar-pro", "messages": messages},
            timeout=60,
        )
        resp.raise_for_status()

    return resp.json()["choices"][0]["message"]["content"]
