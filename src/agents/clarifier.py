"""ClarifierAgent - generates one clarifying question and suspends via LangGraph interrupt."""
import json
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.types import interrupt

from src.config import llm_fast as _llm
from src.state import SearchState
from src.prompts.clarifier import SYSTEM_PROMPT
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


def clarifier_agent(state: SearchState) -> dict:
    """Picks the most impactful uncertainty, asks the user via interrupt, appends answer to user_input."""
    features      = state.get("extracted_features") or {}
    uncertainties = features.get("uncertainties", [])
    history       = state.get("clarification_history", [])

    if not uncertainties:
        print("[ClarifierAgent] No uncertainties, skipping.")
        return {}

    context = {
        "original_description": state["user_input"],
        "current_features":     features.get("features", {}),
        "current_category":     features.get("category"),
        "uncertainties":        uncertainties,
        "previously_asked":     [h["question"] for h in history],
    }

    print(f"[ClarifierAgent] Preparing question (round {len(history) + 1})...")

    response = invoke_with_retry(_llm, [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=json.dumps(context, ensure_ascii=False, indent=2)),
    ])

    raw = _strip_markdown_fences(response.content)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        return {
            "errors": state.get("errors", []) + [
                f"ClarifierAgent JSON parse error: {e}. Raw: {raw[:200]}"
            ],
        }

    question = parsed.get("next_question", "").strip()
    if not question:
        return {
            "errors": state.get("errors", []) + ["ClarifierAgent produced empty question"],
        }

    answer = interrupt(question)

    if not answer:
        answer = "(cevap verilmedi)"

    new_entry = {
        "question":              question,
        "answer":                answer,
        "targeted_uncertainty":  parsed.get("targets_uncertainty", ""),
    }

    augmented_input = (
        state["user_input"]
        + f"\n\n[Ek bilgi - Soru: {question} Cevap: {answer}]"
    )

    return {
        "clarification_history": history + [new_entry],
        "user_input":            augmented_input,
    }
