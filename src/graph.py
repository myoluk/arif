"""
arif search pipeline as a LangGraph state machine.

    intake ──(image)──→ visual ──→ extract ──(conf ≥ 0.75)──→ match → rank → END
           │                            │
           └──(text)────────────────────┘
                                        └─(low conf, rounds < 3)─→ clarify ─→ extract
"""
from langgraph.graph import StateGraph, END

from src.config import CONFIDENCE_THRESHOLD, MAX_CLARIFICATION_ROUNDS
from src.state import SearchState
from src.agents.intake import intake_router
from src.agents.extractor import concept_extractor
from src.agents.clarifier import clarifier_agent
from src.agents.matcher import marketplace_matcher
from src.agents.ranker import result_ranker
from src.agents.visual import visual_reconstructor


def _route_after_extract(state: SearchState) -> str:
    """Routes to 'match' when confidence is sufficient or max rounds reached, else 'clarify'."""
    confidence = state.get("confidence_score") or 0.0
    history    = state.get("clarification_history", [])

    if confidence >= CONFIDENCE_THRESHOLD:
        print(f"[Router] Confidence sufficient ({confidence} >= {CONFIDENCE_THRESHOLD}) - proceeding to match.")
        return "match"

    if len(history) >= MAX_CLARIFICATION_ROUNDS:
        print(f"[Router] Max clarification rounds reached ({MAX_CLARIFICATION_ROUNDS}) - proceeding to match.")
        return "match"

    print(f"[Router] Confidence low ({confidence} < {CONFIDENCE_THRESHOLD}) - routing to clarify.")
    return "clarify"


def _route_after_intake(state: SearchState) -> str:
    """Routes to 'visual' if image data is present, otherwise directly to 'extract'."""
    if state.get("image_data"):
        print("[Router] Image detected - routing to visual.")
        return "visual"
    return "extract"


def build_graph(checkpointer=None):
    """Builds and compiles the search pipeline graph.

    Pass a MemorySaver checkpointer to enable interrupt/resume (required for API mode).
    """
    workflow = StateGraph(SearchState)

    workflow.add_node("intake",  intake_router)
    workflow.add_node("visual",  visual_reconstructor)
    workflow.add_node("extract", concept_extractor)
    workflow.add_node("clarify", clarifier_agent)
    workflow.add_node("match",   marketplace_matcher)
    workflow.add_node("rank",    result_ranker)

    workflow.set_entry_point("intake")

    workflow.add_conditional_edges(
        "intake",
        _route_after_intake,
        {"visual": "visual", "extract": "extract"},
    )
    workflow.add_edge("visual", "extract")
    workflow.add_conditional_edges(
        "extract",
        _route_after_extract,
        {"clarify": "clarify", "match": "match"},
    )
    workflow.add_edge("clarify", "extract")
    workflow.add_edge("match", "rank")
    workflow.add_edge("rank", END)

    return workflow.compile(checkpointer=checkpointer)
