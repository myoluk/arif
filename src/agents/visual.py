"""VisualReconstructor - generates a Turkish product description from an image via Gemini Vision."""
from langchain_core.messages import HumanMessage, SystemMessage

from src.config import APP_ENV, llm_pro
from src.state import SearchState
from src.prompts.visual import SYSTEM_PROMPT
from src.utils.retry import invoke_with_retry


def visual_reconstructor(state: SearchState) -> dict:
    """Calls Gemini Vision on image_data and merges the description into user_input."""
    image_data = state.get("image_data")

    if APP_ENV == "local":
        print("[Visual] Gemini Vision unavailable in local mode - skipping.")
        return {
            "errors": state.get("errors", []) + [
                "VisualReconstructor: image analysis not supported in local mode."
            ],
        }

    if not image_data:
        print("[Visual] No image data - skipping.")
        return {}

    # image_data is a data URI: data:<mime>;base64,<b64>
    mime_type = image_data.split(":")[1].split(";")[0] if ";" in image_data else "image/jpeg"
    print(f"[Visual] Analyzing image ({mime_type})")

    response = invoke_with_retry(llm_pro, [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=[
            {"type": "image_url", "image_url": {"url": image_data}},
            {"type": "text",      "text": "Bu görseldeki ürünü tarif et."},
        ]),
    ])

    visual_description = response.content.strip()
    print(f"[Visual] Description: {visual_description[:80]}...")

    user_input = state.get("user_input", "").strip()
    augmented  = f"{visual_description}. Ek bilgi: {user_input}" if user_input else visual_description
    return {"user_input": augmented}
