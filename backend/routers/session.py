import uuid
import os
import json
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/session", tags=["session"])

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"

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

RESEARCH_SYSTEM_PROMPT = """You are a tenant rights legal researcher specializing in East Bay, California housing law.

Given the tenant's facts, research the applicable local and state ordinances using live sources and return a structured JSON response.

Always respond in this exact JSON format with no other text:
{
  "finding": "illegal" | "legal" | "unclear",
  "explanation": "<one sentence explaining the finding with specific numbers from the facts>",
  "controlling_law": "<primary controlling law citation with section number>",
  "legal_cap": "<the maximum allowable amount under the controlling law, e.g. '3% or ~$45/mo'>",
  "laws_applied": [
    {
      "name": "<law name>",
      "tag": "<short tag like 'AB 1482 applies' or 'Oakland RSO controls'>",
      "role": "floor" | "controlling",
      "description": "<one line summary>"
    }
  ],
  "sources": [
    {
      "name": "<source name>",
      "url": "<domain/path only, no https://>",
      "snippet": "<1-2 sentence excerpt from the source>"
    }
  ],
  "action_window_days": <integer>,
  "action_window_text": "<one sentence urging the tenant to act>"
}

Be specific — cite actual ordinance section numbers, current CPI percentages, and real rent board contacts.
Return only valid JSON, no markdown, no prose."""


class CreateSessionResponse(BaseModel):
    session_id: str


class MessageRequest(BaseModel):
    transcript: str


class MessageResponse(BaseModel):
    status: str
    question: str | None = None
    facts: dict | None = None
    verdict: dict | None = None
    timeline: dict | None = None


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
    verdict, citations = await research_ordinance(session["facts"])
    timeline = build_timeline(session["facts"], verdict)

    # Merge Perplexity citations into sources if not already rich
    if citations and len(verdict.get("sources", [])) < 2:
        verdict["sources"] = [
            {"name": url, "url": url.replace("https://", "").split("/")[0], "snippet": ""}
            for url in citations[:3]
        ]

    return MessageResponse(
        status="VERDICT",
        facts=session["facts"],
        verdict=verdict,
        timeline=timeline,
    )


async def run_intake(history: list[dict]) -> dict:
    messages = [{"role": "system", "content": INTAKE_SYSTEM_PROMPT}] + history

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            PERPLEXITY_URL,
            headers={"Authorization": f"Bearer {PERPLEXITY_API_KEY}"},
            json={"model": "sonar", "messages": messages},
            timeout=30,
        )
        resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"].strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    return json.loads(content)


async def research_ordinance(facts: dict) -> tuple[dict, list[str]]:
    city = facts.get("city", "East Bay")
    issue = facts.get("issue", "tenant rights")
    details = facts.get("details", "")

    query = f"{city} California renter situation: {issue}. {details}"

    messages = [
        {"role": "system", "content": RESEARCH_SYSTEM_PROMPT},
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

    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    citations = data.get("citations", [])

    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    verdict = json.loads(content)
    return verdict, citations


def build_timeline(facts: dict, verdict: dict) -> dict:
    issue = facts.get("issue", "")
    action_days = verdict.get("action_window_days", 10)
    action_text = verdict.get("action_window_text", "Take action before the deadline.")

    if "eviction" in issue:
        milestones = [
            {"day": 0,  "label": "Notice received",       "state": "passed"},
            {"day": 3,  "label": "Respond to notice",     "state": "urgent"},
            {"day": 10, "label": "Unlawful detainer risk", "state": "future"},
            {"day": 30, "label": "Court hearing",          "state": "future"},
            {"day": 60, "label": "Resolution",             "state": "future"},
        ]
    else:
        milestones = [
            {"day": 0,  "label": "Notice received",      "state": "passed"},
            {"day": action_days, "label": "Send your letter", "state": "urgent"},
            {"day": 30, "label": "Landlord must respond", "state": "future"},
            {"day": 45, "label": "Rent Review hearing",   "state": "future"},
            {"day": 60, "label": "Resolution",            "state": "future"},
        ]

    return {
        "milestones": milestones,
        "action_window_days": action_days,
        "action_window_text": action_text,
    }
