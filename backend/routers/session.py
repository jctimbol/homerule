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

Given the tenant's facts, work through the following checklist IN ORDER before deciding on a finding. Missing a step is a legal error.

STEP 1 — LOCAL RENT CONTROL
Check whether the city has a local RSO and whether this specific unit is covered. Use the city-specific rules below. If building age is unknown and the RSO has a construction date cutoff, return "unclear" — do NOT assume coverage.

BERKELEY RSO (Berkeley Rent Stabilization Board)
- Covers: Multi-unit buildings with Certificate of Occupancy BEFORE June 30, 1980, where tenancy began before January 1, 1996
- Rent ceiling + just cause: pre-1980 units, pre-1996 tenancy only
- Just cause only (no rent ceiling): SFHs, condos, units built after 1980 but before Feb 1995, or tenancy began on/after Jan 1, 1996
- Fully exempt: owner-occupied 4-or-fewer-unit buildings, "Golden Duplexes" (two-unit, owner-occupied since Dec 31 1979), ADUs on owner-occupied SFH lots (tenancy post-Nov 7 2018)
- Annual cap: 65% of Bay Area CPI, max 5%. 2026 AGA = 1.0%. 2025 AGA = 2.1%.
- If building age unknown → unclear (cannot assume pre-1980 coverage)

OAKLAND RSO (Oakland Rent Adjustment Program)
- Covers: Multi-unit buildings with Certificate of Occupancy BEFORE January 1, 1983, primary residences only
- SFHs and condos: exempt from rent cap but subject to Just Cause eviction protections
- Annual cap: 60% of Bay Area CPI, max 3%. 2025–2026 cap = 0.8%. 2024–2025 cap = 2.3%.
- Banking allowed but capped at 3x current year CPI; banking window is 5 years (as of Jan 1, 2026)
- Landlord must include current Business Tax Certificate with notice; if delinquent on business taxes, increase is void
- If building age unknown → unclear (cannot assume pre-1983 coverage)

ALAMEDA RSO (City of Alameda Rent Program)
- Covers: Multi-unit properties (2+ units) with Certificate of Occupancy BEFORE February 1, 1995
- SFHs and condos: not covered by local rent ceiling; AB 1482 may apply
- Annual cap: 70% of Bay Area CPI, min 1%, max 5%. Sep 2025 AGA = 1.0%. Sep 2024 AGA = 2.7%.
- Banking allowed but single increase cannot exceed AGA + 3% in any year
- If building age unknown → unclear (cannot assume pre-1995 coverage)

HAYWARD RSO (Residential Rent Stabilization and Tenant Protection Ordinance)
- Covers: Multi-unit buildings with Certificate of Occupancy BEFORE July 1, 1979 only
- SFHs, condos, townhomes: not covered by local ordinance; AB 1482 may apply
- Annual cap: flat 5% per year (not CPI-tied). Banking allowed up to 10 years; combined banked + current cannot exceed 10% in one year
- The 1979 cutoff is older than most cities — a large share of Hayward rentals are NOT covered
- If building age unknown → return "unclear", do NOT assume coverage

SAN LEANDRO — No binding RSO until January 1, 2027
- Current program (until Jan 1, 2027): advisory Rent Review Program only — no hard rent cap; mediation only for increases >7%
- AB 1482 is the operative statewide cap for eligible San Leandro units right now
- New RSO takes effect Jan 1, 2027: cap = lower of 3% or 65% CPI; covers pre-Feb 1, 1995 multi-unit buildings
- Until 2027, treat San Leandro as having no local RSO — proceed to STEP 2

FREMONT — No local RSO
- Fremont has an advisory Rent Review Program only — no binding rent cap
- AB 1482 is the operative statewide cap for eligible Fremont units
- Proceed directly to STEP 2

STEP 2 — AB 1482 (California Tenant Protection Act, Civil Code §1947.12)
If no local RSO applies (or the unit is exempt from the local RSO), check AB 1482. Current cap: 5% + Bay Area CPI, max 10%. For 2025–2026 the Bay Area CPI is approximately 3.3%, making the AB 1482 cap approximately 8.3%. Check these exemptions before applying it:
- Single-family homes where the owner has served the required AB 1482 exemption notice (Civil Code §1946.2) → EXEMPT
- Condos where the owner has served the exemption notice → EXEMPT
- Buildings with a certificate of occupancy issued within the last 15 years (i.e., built after ~2010) → EXEMPT
- Duplexes where the owner occupies one unit → EXEMPT
If exemption status is unknown (e.g. SFH but no info on whether notice was served, or building age unknown), return "unclear" — do not assume exempt or covered.
If the unit is exempt from AB 1482 AND there is no local RSO, there is no rent cap. Raising rent to any amount with proper notice is LEGAL.

STEP 3 — NOTICE REQUIREMENTS
Even if no rent cap applies, check whether the landlord gave proper advance notice:
- Increase ≤10%: 30 days written notice required
- Increase >10%: 90 days written notice required
A rent increase that is otherwise legal can still be procedurally defective if notice was inadequate.

STEP 4 — FINDING
Only return "illegal" if a specific cap or notice requirement is demonstrably violated given the facts provided. If the facts are insufficient to confirm a violation (e.g. exemption status unknown), return "unclear" — never assume the worst. If no cap applies and notice was proper, return "legal".

Always respond in this exact JSON format with no other text:
{
  "finding": "illegal" | "legal" | "unclear",
  "explanation": "<one sentence explaining the finding with specific numbers from the facts>",
  "controlling_law": "<primary controlling law citation with section number>",
  "legal_cap": "<the maximum allowable amount under the controlling law, or 'No cap applies' if exempt>",
  "laws_applied": [
    {
      "name": "<law name>",
      "tag": "<short tag like 'AB 1482 exempt' or 'Oakland RSO controls'>",
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


class ResearchCityRequest(BaseModel):
    city: str


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
    session["verdict"] = verdict
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


@router.post("/{session_id}/research", response_model=MessageResponse)
async def research_for_city(session_id: str, body: ResearchCityRequest):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    original_facts = sessions[session_id].get("facts", {})
    original_city = original_facts.get("city", "")
    facts = {**original_facts, "city": body.city}
    if original_city and original_city != body.city and "details" in facts:
        facts["details"] = facts["details"].replace(original_city, body.city)
    verdict, citations = await research_ordinance(facts)
    timeline = build_timeline(facts, verdict)

    if citations and len(verdict.get("sources", [])) < 2:
        verdict["sources"] = [
            {"name": url, "url": url.replace("https://", "").split("/")[0], "snippet": ""}
            for url in citations[:3]
        ]

    return MessageResponse(status="VERDICT", facts=facts, verdict=verdict, timeline=timeline)


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
            json={"model": "sonar-pro", "messages": messages, "temperature": 0},
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
    finding = verdict.get("finding", "unclear")
    action_days = verdict.get("action_window_days", 10)
    action_text = verdict.get("action_window_text", "Take action before the deadline.")

    if finding == "illegal":
        urgent_label = "Send your letter"
    elif finding == "legal":
        urgent_label = "Review your options"
    else:
        urgent_label = "Get free legal advice"

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
            {"day": 0,          "label": "Notice received",      "state": "passed"},
            {"day": action_days, "label": urgent_label,           "state": "urgent"},
            {"day": 30,         "label": "Landlord must respond", "state": "future"},
            {"day": 45,         "label": "Rent Review hearing",   "state": "future"},
            {"day": 60,         "label": "Resolution",            "state": "future"},
        ]

    return {
        "milestones": milestones,
        "action_window_days": action_days,
        "action_window_text": action_text,
    }
