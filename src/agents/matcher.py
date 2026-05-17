"""MarketplaceMatcher - kNN product search via Elasticsearch and Trendyol embeddings."""
from __future__ import annotations

from elasticsearch import Elasticsearch
from sentence_transformers import SentenceTransformer

from src.config import ES_URL, ES_INDEX
from src.state import SearchState
from src.prompts.matcher import build_query_text, build_knn_query

_MODEL_NAME = "Trendyol/TY-ecomm-embed-multilingual-base-v1.2.0"
_model: SentenceTransformer | None = None
_es:    Elasticsearch | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print("[Matcher] Loading embedding model...")
        _model = SentenceTransformer(
            _MODEL_NAME,
            trust_remote_code=True,  # required by Trendyol model
            truncate_dim=768,
        )
        print("[Matcher] Model ready")
    return _model


def _get_es() -> Elasticsearch:
    global _es
    if _es is None:
        _es = Elasticsearch(ES_URL, request_timeout=10)
    return _es


_SIMILARITY_THRESHOLD = 0.65


def marketplace_matcher(state: SearchState) -> dict:
    """Encodes the query and retrieves the top-5 nearest products from Elasticsearch."""
    features   = state.get("extracted_features") or {}
    user_input = state["user_input"]
    category   = (features.get("category") or "").lower().strip() or None

    print(f"[Matcher] Searching category={category!r}")

    vector     = _get_model().encode(
        build_query_text(user_input, features),
        normalize_embeddings=True,
    ).tolist()

    try:
        response = _get_es().search(index=ES_INDEX, body=build_knn_query(vector, category))
    except Exception as e:
        print(f"[Matcher] ES error: {e}")
        return {
            "search_results": [],
            "errors": state.get("errors", []) + [f"MarketplaceMatcher ES error: {e}"],
        }

    all_hits = response["hits"]["hits"]
    results  = [
        {**hit["_source"], "score": round(hit["_score"], 4)}
        for hit in all_hits
        if hit["_score"] >= _SIMILARITY_THRESHOLD
    ]

    print(f"[Matcher] {len(results)}/{len(all_hits)} results above threshold (>={_SIMILARITY_THRESHOLD})")
    for i, r in enumerate(results, 1):
        print(f"  {i}. [{r['score']}] {r['title'][:60]}")

    return {"search_results": results}
