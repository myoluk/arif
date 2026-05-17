"""LangGraph session management - maps session IDs to MemorySaver thread IDs."""
import uuid
from langgraph.checkpoint.memory import MemorySaver

# Shared across the FastAPI app lifetime; replace with Redis/SQL saver for production.
checkpointer = MemorySaver()

_sessions: dict[str, str] = {}


def create_session() -> str:
    """Creates a new session and returns its ID."""
    session_id = str(uuid.uuid4())
    _sessions[session_id] = session_id
    return session_id


def session_exists(session_id: str) -> bool:
    return session_id in _sessions


def thread_config(session_id: str, recursion_limit: int = 25) -> dict:
    """Returns the config dict expected by graph.invoke()."""
    return {
        "configurable": {"thread_id": session_id},
        "recursion_limit": recursion_limit,
    }
