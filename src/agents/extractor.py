"""ConceptExtractor - converts a free-form Turkish description into structured product features."""
import json
from langchain_core.messages import SystemMessage, HumanMessage

from src.config import llm_fast as _llm
from src.state import SearchState
from src.prompts.extractor import SYSTEM_PROMPT
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


def concept_extractor(state: SearchState) -> dict:
    """Extracts category, features, uncertainties, and confidence from user_input."""
    user_input = state["user_input"]
    print("[ConceptExtractor] Extracting features...")

    response = invoke_with_retry(_llm, [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_input),
    ])

    raw_text = _strip_markdown_fences(response.content)

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as e:
        print(f"[ConceptExtractor] JSON parse error: {e}")
        return {
            "extracted_features": None,
            "confidence_score": 0.0,
            "errors": state.get("errors", []) + [
                f"ConceptExtractor JSON parse error: {e}. Raw: {raw_text[:200]}"
            ],
        }

    # confidence lives at top-level state, not nested inside extracted_features
    confidence    = parsed.pop("confidence", 0.0)
    uncertainties = parsed.get("uncertainties", [])

    print(f"[ConceptExtractor] category={parsed.get('category')} confidence={confidence}")
    if uncertainties:
        print(f"[ConceptExtractor] {len(uncertainties)} uncertainties detected")

    return {
        "extracted_features": parsed,
        "confidence_score":   confidence,
    }
