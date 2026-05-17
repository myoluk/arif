"""Shared LangGraph state definition for the arif search pipeline."""
from typing import TypedDict, Optional, List, Literal


class SearchState(TypedDict):
    user_input:             str
    input_modality:         Literal["text", "image", "audio", "unknown"]
    image_data:             Optional[str]   # data URI (data:<mime>;base64,...)
    extracted_features:     Optional[dict]
    confidence_score:       Optional[float] # 0.0–1.0
    clarification_history:  List[dict]
    search_results:         List[dict]
    ranked_results:         List[dict]
    errors:                 List[str]


def initial_state(user_input: str = "", image_data: str | None = None) -> SearchState:
    """Returns a blank state for a new search session."""
    return {
        "user_input":            user_input,
        "input_modality":        "unknown",
        "image_data":            image_data,
        "extracted_features":    None,
        "confidence_score":      None,
        "clarification_history": [],
        "search_results":        [],
        "ranked_results":        [],
        "errors":                [],
    }
