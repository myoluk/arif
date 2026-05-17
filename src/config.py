"""LLM configuration - three runtime modes: local, dev, test."""
import os
from dotenv import load_dotenv

load_dotenv()

APP_ENV = os.getenv("APP_ENV", "dev").lower()
assert APP_ENV in ("local", "dev", "test"), (
    f"APP_ENV='{APP_ENV}' is invalid. Must be 'local', 'dev', or 'test'."
)

CONFIDENCE_THRESHOLD     = 0.75
MAX_CLARIFICATION_ROUNDS = 3

ES_URL       = os.getenv("ES_URL",       "http://localhost:9200")
ES_INDEX     = os.getenv("ES_INDEX",     "arif-products")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# 10 fixed categories - keep in sync with docs/dataset-spec.md
CATEGORIES = [
    "demlik & çaydanlık",
    "spor ayakkabı",
    "sofra ve mutfak",
    "aydınlatma",
    "ev tekstili",
    "oyuncak",
    "elektrikli ev aletleri",
    "kişisel bakım",
    "ev dekor",
    "ofis/kırtasiye",
]


def _check_key(key):
    if not key or key == "your_api_key_here":
        raise RuntimeError(
            "\n\nGEMINI_API_KEY not found.\n"
            "  1. Copy .env.example to .env\n"
            "  2. Get a key at https://aistudio.google.com/apikey\n"
            "  3. Set GEMINI_API_KEY=... in .env\n"
        )


if APP_ENV == "local":
    from langchain_ollama import ChatOllama

    llm_fast = ChatOllama(model="gemma4:e4b", temperature=0.2)
    llm_pro  = ChatOllama(model="gemma4:e4b", temperature=0.5)
    GEMINI_API_KEY = None

elif APP_ENV == "dev":
    from langchain_google_genai import ChatGoogleGenerativeAI

    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    _check_key(GEMINI_API_KEY)

    llm_fast = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash-lite",
        google_api_key=GEMINI_API_KEY,
        temperature=0.2,
    )
    llm_pro = ChatGoogleGenerativeAI(  # intentionally same model as fast to conserve dev quota
        model="gemini-2.5-flash-lite",
        google_api_key=GEMINI_API_KEY,
        temperature=0.5,
    )

else:  # test
    from langchain_google_genai import ChatGoogleGenerativeAI

    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    _check_key(GEMINI_API_KEY)

    llm_fast = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=GEMINI_API_KEY,
        temperature=0.2,
    )
    llm_pro = ChatGoogleGenerativeAI(
        model="gemini-2.5-pro",
        google_api_key=GEMINI_API_KEY,
        temperature=0.5,
    )


def _model_name(llm) -> str:
    """Returns model name from a LangChain LLM instance."""
    return getattr(llm, 'model_name', None) or getattr(llm, 'model', 'unknown')


print(f"[Config] Mode: {APP_ENV.upper()} | fast={_model_name(llm_fast)}")
