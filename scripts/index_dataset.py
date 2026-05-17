"""Indexes data/products.json into Elasticsearch (arif-products) with Trendyol embeddings."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from elasticsearch import Elasticsearch, helpers
from sentence_transformers import SentenceTransformer
from src.config import ES_URL, ES_INDEX

MODEL_NAME    = "Trendyol/TY-ecomm-embed-multilingual-base-v1.2.0"
EMBEDDING_DIM = 768

INDEX_MAPPING = {
    "settings": {
        "number_of_shards":   1,
        "number_of_replicas": 0,
    },
    "mappings": {
        "properties": {
            "title":           {"type": "text"},
            "description":     {"type": "text"},
            "features":        {"type": "text"},
            "category":        {"type": "keyword"},
            "brand":           {"type": "keyword"},
            "price_try":       {"type": "float"},
            "rating":          {"type": "float"},
            "review_count":    {"type": "integer"},
            "available_sizes": {"type": "keyword"},
            "embedding": {
                "type":       "dense_vector",
                "dims":       EMBEDDING_DIM,
                "index":      True,
                "similarity": "cosine",
            },
        }
    },
}


def build_text(product: dict) -> str:
    parts = [
        product.get("title") or "",
        product.get("description") or "",
        " ".join(product["features"]) if product.get("features") else "",
    ]
    return " ".join(p for p in parts if p)


def main() -> None:
    parser = argparse.ArgumentParser(description="Index products JSON into Elasticsearch.")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=ROOT / "data",
        metavar="DIR",
        help="Data directory containing products.json and images/ (default: data/)",
    )
    args = parser.parse_args()
    data_dir: Path      = args.data_dir
    products_path: Path = data_dir / "products.json"

    if not products_path.exists():
        print(f"[Index] File not found: {products_path}.")
        sys.exit(1)

    products = json.loads(products_path.read_text(encoding="utf-8"))
    print(f"[Index] Loaded {len(products)} products from {products_path}")
    print(f"[Index] Images: {data_dir / 'images'}")

    es = Elasticsearch(ES_URL, request_timeout=30)
    try:
        version = es.info()["version"]["number"]
        print(f"[ES] Connected - Elasticsearch {version}")
    except Exception as e:
        print(f"[ES] Connection failed: {e}")
        sys.exit(1)

    if es.indices.exists(index=ES_INDEX):
        es.indices.delete(index=ES_INDEX)
        print(f"[ES] Deleted index '{ES_INDEX}'")
    es.indices.create(index=ES_INDEX, body=INDEX_MAPPING)
    print(f"[ES] Created index '{ES_INDEX}'")

    print(f"\n[Embed] Loading model: {MODEL_NAME}")
    # trust_remote_code required by Trendyol model
    model = SentenceTransformer(MODEL_NAME, trust_remote_code=True, truncate_dim=EMBEDDING_DIM)

    texts = [build_text(p) for p in products]
    print(f"[Embed] Encoding {len(texts)} texts...")
    embeddings = model.encode(texts, batch_size=32, show_progress_bar=True, normalize_embeddings=True)
    print(f"[Embed] Done - shape: {embeddings.shape}")

    def actions():
        for product, emb in zip(products, embeddings):
            doc = {k: v for k, v in product.items() if k != "images"}
            if doc.get("category"):
                doc["category"] = doc["category"].lower().strip()
            doc["embedding"] = emb.tolist()
            yield {"_index": ES_INDEX, "_id": product["id"], "_source": doc}

    success, failed = helpers.bulk(es, actions(), chunk_size=50, stats_only=True)
    es.indices.refresh(index=ES_INDEX)
    print(f"\n[ES] Indexed {success} products" + (f", {failed} errors" if failed else ""))


if __name__ == "__main__":
    main()
