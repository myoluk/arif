"""Exponential-backoff retry wrapper for LLM calls hitting Gemini rate limits."""
import logging
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)

logger = logging.getLogger(__name__)


def _is_rate_limit_error(exc: BaseException) -> bool:
    """Returns True for 429 / ResourceExhausted errors."""
    type_name = type(exc).__name__
    msg = str(exc).lower()
    return (
        "resourceexhausted" in type_name.lower()
        or "429" in msg
        or "resource has been exhausted" in msg
        or "rate limit" in msg
    )


@retry(
    retry=retry_if_exception(_is_rate_limit_error),
    wait=wait_exponential(multiplier=1, min=4, max=60),
    stop=stop_after_attempt(4),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def invoke_with_retry(llm, messages):
    """Calls llm.invoke(messages) with retry on rate-limit errors; other exceptions propagate immediately."""
    return llm.invoke(messages)
