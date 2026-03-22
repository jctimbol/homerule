import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/session", tags=["artifact"])

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"

from routers.session import sessions


class ArtifactRequest(BaseModel):
    artifact_type: str = "dispute_letter"


# ── System prompts ────────────────────────────────────────────────────────────

DISPUTE_LETTER_PROMPT = """You are a tenant rights attorney drafting a formal dispute letter on behalf of a renter.

Write a professional, firm dispute letter based on the tenant's facts and the legal verdict provided.

Rules:
- Use formal letter format with placeholders in brackets for personal info: [Your Name], [Your Address], [Date], [Landlord Name], [Landlord Address], [Unit Address]
- Cite the specific ordinance section numbers and legal caps from the verdict
- State the violation clearly and demand a specific remedy
- Mention the relevant rent board or agency the tenant will contact if unresolved
- Keep it to 3-4 paragraphs — firm but professional
- Do not add any commentary or explanation outside the letter itself
- Return only the letter text"""

RIGHTS_SUMMARY_PROMPT = """You are a tenant rights advisor summarizing the protections that still apply to a renter even when their landlord's action was found to be legal.

Given the tenant's facts and city, write a clear, practical summary of what rights they do have. Cover:
1. Notice requirements — what advance notice the landlord must always give for future increases or changes
2. Habitability rights — the landlord's ongoing repair and maintenance obligations
3. Retaliation protections — the tenant cannot be evicted or harassed for exercising their rights
4. Security deposit rules — limits on what can be deducted
5. Just cause eviction protections — whether they apply in this city and what it means
6. Any upcoming milestones — e.g. if they'll hit 12 months of tenancy and AB 1482 may become relevant

Format as clearly labeled sections. Be specific to the city. Use plain language.
Return only the summary text, no preamble."""

CONFIRMATION_LETTER_PROMPT = """You are a tenant drafting a brief confirmation letter to their landlord.

The rent increase was found to be legal. Write a short, neutral letter that:
- Acknowledges receipt of the rent increase notice
- Confirms the new rent amount and effective date
- Notes the date the notice was received
- Creates a clear paper trail without being adversarial

Use placeholders in brackets: [Your Name], [Your Address], [Date], [Landlord Name / Property Manager], [Unit Address], [New Rent Amount], [Effective Date]

Keep it to 2 short paragraphs. Professional and neutral in tone.
Return only the letter text, no preamble."""

SITUATION_SUMMARY_PROMPT = """You are preparing a one-page intake brief that a tenant will bring to a free legal aid appointment.

The situation is legally unclear and the tenant needs professional guidance. Write a concise, factual summary that:
1. States the tenant's situation in plain terms (city, unit type, issue, amounts, dates)
2. Identifies the specific legal question that is unclear (e.g. whether the unit is covered by AB 1482, whether the exemption notice was properly served)
3. Lists the key facts the attorney will need to verify
4. Notes the relevant laws that may apply and why the outcome is uncertain
5. Suggests 2-3 specific questions the tenant should ask the attorney

Format clearly with labeled sections. This is for Bay Area Legal Aid, Centro Legal de la Raza, or a similar East Bay tenant legal clinic.
Return only the brief, no preamble."""

WATCH_FOR_PROMPT = """You are a tenant rights advisor explaining to a renter what specific conditions would change their currently unclear legal situation.

Given the facts and the unclear verdict, write a plain-language explanation of:
1. The exact condition(s) that would make the landlord's action ILLEGAL — e.g. "If your building was built before [year]..." or "If your landlord did not serve the AB 1482 exemption notice..."
2. How the tenant can find out whether that condition applies to them (e.g. check building permits, ask the city, review their lease)
3. What to do if they discover the condition is met

Be specific and actionable. Use plain language. No legal jargon without explanation.
Return only the explanation, no preamble."""


# ── Helpers ───────────────────────────────────────────────────────────────────

def build_context(facts: dict, verdict: dict) -> str:
    return f"""City: {facts.get("city", "unknown")}
Issue: {facts.get("issue", "unknown")}
Details: {facts.get("details", "")}
Tenancy length: {facts.get("tenancy_length", "unknown")}
Unit type: {facts.get("building_type", "unknown")}

Legal finding: {verdict.get("finding", "unclear")}
Explanation: {verdict.get("explanation", "")}
Controlling law: {verdict.get("controlling_law", "")}
Legal cap: {verdict.get("legal_cap", "")}"""


async def call_ai(system_prompt: str, user_content: str, model: str = "sonar") -> str:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            PERPLEXITY_URL,
            headers={"Authorization": f"Bearer {PERPLEXITY_API_KEY}"},
            json={"model": model, "messages": messages, "temperature": 0},
            timeout=30,
        )
        resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/{session_id}/artifact")
async def generate_artifact(session_id: str, body: ArtifactRequest = ArtifactRequest()):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    facts = session.get("facts", {})
    verdict = session.get("verdict")

    if not verdict:
        raise HTTPException(status_code=400, detail="No verdict found for this session")

    ctx = build_context(facts, verdict)
    artifact_type = body.artifact_type

    if artifact_type == "dispute_letter":
        prompt = f"""Write a dispute letter for this tenant.\n\n{ctx}\nIncrease amount: {facts.get("increase_amount", "unknown")}"""
        text = await call_ai(DISPUTE_LETTER_PROMPT, prompt)

    elif artifact_type == "rights_summary":
        text = await call_ai(RIGHTS_SUMMARY_PROMPT, ctx)

    elif artifact_type == "confirmation_letter":
        text = await call_ai(CONFIRMATION_LETTER_PROMPT, ctx)

    elif artifact_type == "situation_summary":
        text = await call_ai(SITUATION_SUMMARY_PROMPT, ctx)

    elif artifact_type == "watch_for":
        text = await call_ai(WATCH_FOR_PROMPT, ctx)

    else:
        raise HTTPException(status_code=400, detail=f"Unknown artifact_type: {artifact_type}")

    session["artifact"] = text
    return {"artifact_text": text}
