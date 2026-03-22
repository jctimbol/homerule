import os
import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/session", tags=["artifact"])

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"

# Imported at request time to avoid circular import
from routers.session import sessions

LETTER_SYSTEM_PROMPT = """You are a tenant rights attorney drafting a formal dispute letter on behalf of a renter.

Write a professional, firm dispute letter based on the tenant's facts and the legal verdict provided.

Rules:
- Use formal letter format with placeholders in brackets for personal info: [Your Name], [Your Address], [Date], [Landlord Name], [Landlord Address], [Unit Address]
- Cite the specific ordinance section numbers and legal caps from the verdict
- State the violation clearly and demand a specific remedy
- Mention the relevant rent board or agency the tenant will contact if unresolved
- Keep it to 3-4 paragraphs — firm but professional
- Do not add any commentary or explanation outside the letter itself
- Return only the letter text"""


@router.post("/{session_id}/artifact")
async def generate_artifact(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    facts = session.get("facts", {})
    verdict = session.get("verdict")

    if not verdict:
        raise HTTPException(status_code=400, detail="No verdict found for this session")

    city = facts.get("city", "your city")
    issue = facts.get("issue", "tenant rights violation")
    details = facts.get("details", "")
    controlling_law = verdict.get("controlling_law", "applicable local ordinance")
    legal_cap = verdict.get("legal_cap", "the legal maximum")
    explanation = verdict.get("explanation", "")
    increase_amount = facts.get("increase_amount", "the proposed increase")

    prompt = f"""Write a dispute letter for a tenant in {city}, California.

Facts:
- Issue: {issue}
- Details: {details}
- Increase amount: {increase_amount}
- Tenancy length: {facts.get("tenancy_length", "unknown")}

Legal finding: {explanation}
Controlling law: {controlling_law}
Legal cap: {legal_cap}"""

    messages = [
        {"role": "system", "content": LETTER_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            PERPLEXITY_URL,
            headers={"Authorization": f"Bearer {PERPLEXITY_API_KEY}"},
            json={"model": "sonar", "messages": messages},
            timeout=30,
        )
        resp.raise_for_status()

    letter = resp.json()["choices"][0]["message"]["content"].strip()
    session["artifact"] = letter

    return {"artifact_text": letter}
