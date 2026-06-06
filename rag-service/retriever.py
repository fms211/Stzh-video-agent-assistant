"""
RAG 检索器 — 基于 bge-large-zh + ChromaDB
负责向量化查询、相似度搜索、结果格式化
"""

import os
from typing import Optional
from sentence_transformers import SentenceTransformer
import chromadb

# 模型缓存目录（D盘）
MODEL_CACHE = "D:/models/bge-large-zh"
CHROMA_PATH = os.path.join(os.path.dirname(__file__), "chroma_db")

# 全局单例（懒加载）
_model: Optional[SentenceTransformer] = None
_client: Optional[chromadb.PersistentClient] = None
_collection = None


def get_model() -> SentenceTransformer:
    """懒加载 bge-large-zh 模型"""
    global _model
    if _model is None:
        print("[RAG] Loading bge-large-zh model...")
        _model = SentenceTransformer(
            "BAAI/bge-large-zh-v1.5",
            cache_folder=MODEL_CACHE,
        )
        print("[RAG] Model loaded.")
    return _model


def get_collection():
    """获取 ChromaDB collection"""
    global _client, _collection
    if _collection is None:
        _client = chromadb.PersistentClient(path=CHROMA_PATH)
        _collection = _client.get_or_create_collection(
            name="stzh_knowledge",
            metadata={"hnsw:space": "cosine"},
        )
        print(f"[RAG] ChromaDB collection loaded, {_collection.count()} entries.")
    return _collection


def retrieve(query: str, top_k: int = 5, score_threshold: float = 0.45) -> list[dict]:
    """
    检索最相关的知识片段

    Args:
        query: 用户查询（口语化或技术化均可）
        top_k: 返回条数，默认 5
        score_threshold: 最低相似度阈值（0-1），默认 0.3

    Returns:
        list of {content, source, score, metadata}
    """
    model = get_model()
    collection = get_collection()

    if collection.count() == 0:
        return []

    # bge 模型建议查询加前缀以提升检索质量
    query_embedding = model.encode(
        [f"为这个句子生成表示以用于检索相关文章：{query}"],
        normalize_embeddings=True,
    )

    results = collection.query(
        query_embeddings=query_embedding.tolist(),
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    # ChromaDB cosine distance: 0=完全相同, 2=完全不同
    # 转换为 similarity score: 1 - distance/2
    hits = []
    for i in range(len(results["ids"][0])):
        distance = results["distances"][0][i]
        score = 1 - distance / 2

        if score < score_threshold:
            continue

        hits.append({
            "content": results["documents"][0][i],
            "metadata": results["metadatas"][0][i],
            "score": round(score, 4),
            "id": results["ids"][0][i],
        })

    return hits
