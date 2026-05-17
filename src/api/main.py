"""FastAPI backend for the arif search pipeline."""
import base64
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from langgraph.types import Command

IMAGES_DIR = Path(__file__).parent.parent.parent / "data" / "images"

from src.config import FRONTEND_URL
from src.graph import build_graph
from src.state import initial_state
from src.api.session import checkpointer, create_session, session_exists, thread_config

app = FastAPI(title="arif API", version="0.1.0", description="agentic retrieval with intelligent feedback")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)

graph = build_graph(checkpointer=checkpointer)


class AnswerRequest(BaseModel):
    session_id: str
    answer: str = Field(..., min_length=1, max_length=100)


class SearchResponse(BaseModel):
    session_id:         str
    status:             str           # "clarifying" | "results"
    question:           str | None = None
    results:            list | None = None
    extracted_features: dict | None = None


def _check_interrupt(result: dict, session_id: str) -> SearchResponse | None:
    """Detects a LangGraph interrupt in the result dict."""
    if "__interrupt__" in result:
        question = result["__interrupt__"][0].value
        print(f"[API] Interrupt detected: {question!r}")
        return _clarify_response(session_id, question)
    return None


def _results_response(session_id: str, state: dict) -> SearchResponse:
    """Builds a completed-search response from final pipeline state."""
    return SearchResponse(
        session_id=session_id,
        status="results",
        results=state.get("ranked_results") or [],
        extracted_features=state.get("extracted_features"),
    )


def _clarify_response(session_id: str, question: str) -> SearchResponse:
    return SearchResponse(session_id=session_id, status="clarifying", question=question)


@app.get("/health")
def health():
    return {"status": "ok", "service": "arif-api"}



@app.get("/images/{filename}")
def get_image(filename: str):
    """Serves product images from data/images/."""
    path = IMAGES_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    return FileResponse(path)


@app.post("/search", response_model=SearchResponse)
async def search(
    user_input: Annotated[str, Form(max_length=200)] = "",
    image: UploadFile | None = File(None),
):
    """Starts a new search session; returns a clarifying question or ranked results."""
    if not user_input.strip() and image is None:
        raise HTTPException(status_code=422, detail="user_input or image is required")

    image_data: str | None = None
    if image is not None:
        image_bytes = await image.read()
        if image_bytes:
            mime       = (image.content_type or "image/jpeg").split(";")[0]
            image_data = f"data:{mime};base64,{base64.b64encode(image_bytes).decode()}"

    session_id = create_session()
    config     = thread_config(session_id)
    state      = initial_state(user_input=user_input, image_data=image_data)
    result     = graph.invoke(state, config=config)

    interrupted = _check_interrupt(result, session_id)
    return interrupted if interrupted else _results_response(session_id, result)


@app.post("/answer", response_model=SearchResponse)
def answer(body: AnswerRequest):
    """Resumes a paused session with the user's answer; returns next question or results."""
    if not session_exists(body.session_id):
        raise HTTPException(status_code=404, detail="Session not found or expired")

    config = thread_config(body.session_id)
    result = graph.invoke(Command(resume=body.answer or "(cevap verilmedi)"), config=config)

    interrupted = _check_interrupt(result, body.session_id)
    return interrupted if interrupted else _results_response(body.session_id, result)
