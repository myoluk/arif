"""ES query configuration for MarketplaceMatcher."""
TOP_K          = 5
NUM_CANDIDATES = 50  # kNN candidate pool; must be > TOP_K

SOURCE_FIELDS = ["id", "title", "category", "brand", "price_try", "rating", "review_count"]


def build_query_text(user_input: str, extracted_features: dict) -> str:
    """Builds the embedding query string by concatenating user input with extracted features."""
    parts: list[str] = [user_input.strip()]

    category = extracted_features.get("category")
    if category:
        parts.append(category)

    features: dict = extracted_features.get("features") or {}
    feat_values = [str(v) for v in features.values() if v]
    if feat_values:
        parts.append(" ".join(feat_values))

    return " ".join(parts)


def build_knn_query(query_vector: list[float], category: str | None) -> dict:
    """Builds the ES kNN query body, with an optional category filter."""
    knn: dict = {
        "field":          "embedding",
        "query_vector":   query_vector,
        "k":              TOP_K,
        "num_candidates": NUM_CANDIDATES,
    }

    if category:
        # wildcard instead of exact match to handle compound category names like "demlik & çaydanlık"
        knn["filter"] = {"wildcard": {"category": f"*{category}*"}}

    return {
        "knn":     knn,
        "size":    TOP_K,
        "_source": SOURCE_FIELDS,
    }
