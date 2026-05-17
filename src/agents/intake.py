"""Input router - detects modality (text/image) and normalises user_input."""
from src.state import SearchState


def intake_router(state: SearchState) -> dict:
    """Classifies input modality based on presence of image_data or user_input."""
    user_input = state.get("user_input", "")
    image_data = state.get("image_data")

    if image_data:
        print("[IntakeRouter] Image input detected.")
        return {"input_modality": "image"}

    if not user_input or not user_input.strip():
        return {
            "input_modality": "unknown",
            "errors": state.get("errors", []) + ["Empty input received"],
        }

    print(f"[IntakeRouter] Text input received ({len(user_input)} chars)")
    return {"input_modality": "text"}
