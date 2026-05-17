"""ResultRanker - re-ranks ES candidates by LLM intent matching and adds Turkish justifications."""
import json
from langchain_core.messages import SystemMessage, HumanMessage

from src.config import llm_pro as _llm
from src.state import SearchState
from src.prompts.ranker import SYSTEM_PROMPT
from src.utils.retry import invoke_with_retry


def _strip_markdown_fences(text: str) -> str:
    """Strips Gemini's occasional markdown code fences from JSON output."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def result_ranker(state: SearchState) -> dict:
    """Reorders search_results by relevance and appends a reason string to each product."""
    candidates = state.get("search_results") or []

    if not candidates:
        print("[Ranker] No candidates, skipping.")
        return {"ranked_results": []}

    context = {
        "user_input":         state["user_input"],
        "extracted_features": state.get("extracted_features") or {},
        "candidates":         candidates,
    }

    print(f"[Ranker] Ranking {len(candidates)} candidates...")

    response = invoke_with_retry(_llm, [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=json.dumps(context, ensure_ascii=False, indent=2)),
    ])

    raw = _strip_markdown_fences(response.content)

    try:
        ranked = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[Ranker] JSON parse error: {e}")
        # fallback: preserve original order without reason field
        fallback = [
            {k: v for k, v in c.items() if k in ("id", "title", "category", "price_try", "score")}
            for c in candidates
        ]
        return {
            "ranked_results": fallback,
            "errors": state.get("errors", []) + [f"ResultRanker JSON parse error: {e}"],
        }

    # Guard against LLM hallucinating IDs not in the original candidate set.
    original_ids   = {c["id"] for c in candidates}
    original_score = {c["id"]: c["score"] for c in candidates}
    ranked = [r for r in ranked if r.get("id") in original_ids]

    # Restore original ES scores - LLM must not alter them.
    for r in ranked:
        r["score"] = original_score.get(r["id"], r.get("score", 0.0))

    print(f"[Ranker] Ranking complete:")
    for i, r in enumerate(ranked, 1):
        print(f"  {i}. {r.get('title', '?')[:55]} [{r['score']}] - {r.get('reason', '')}")

    return {"ranked_results": ranked}
