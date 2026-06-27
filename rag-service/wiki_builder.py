"""
Wiki 知识层构建器
将原始知识库条目提炼为结构化 Wiki 页面
参考 hello-agents-fms/改进建议/llm-wiki.md
"""

import os
import json
import chromadb

CHROMA_PATH = os.path.join(os.path.dirname(__file__), "chroma_db")

# Wiki 页面模板
WIKI_TEMPLATES = {
    "camera": {
        "type": "entity",
        "subtype": "camera",
        "fields": ["name_cn", "name_en", "category", "action", "definition", "scenes", "effect", "equipment", "aliases", "usage_notes", "classic_directors"],
    },
    "style": {
        "type": "entity",
        "subtype": "style",
        "fields": ["name_cn", "name_en", "features", "prompt_prefix", "suitable_themes", "param搭配"],
    },
    "keyword_expand": {
        "type": "concept",
        "subtype": "keyword",
        "fields": ["name_cn", "name_en", "description", "usage"],
    },
    "element_tag": {
        "type": "entity",
        "subtype": "tag",
        "fields": ["name_cn", "category", "description", "usage"],
    },
}


def build_wiki_from_knowledge_base():
    """
    从原始知识库构建 Wiki 页面
    将现有 ChromaDB 条目标记为 kind=wiki，并添加 Wiki 元数据
    """
    client = chromadb.PersistentClient(path=CHROMA_PATH)

    # 获取原始知识库
    try:
        kb_collection = client.get_collection("stzh_knowledge")
    except Exception:
        print("[Wiki] 知识库不存在，请先运行 ingest.py")
        return 0

    # 创建 Wiki collection
    try:
        client.delete_collection("stzh_wiki")
    except Exception:
        pass

    wiki_collection = client.create_collection(
        name="stzh_wiki",
        metadata={"hnsw:space": "cosine"},
    )

    # 读取所有知识库条目
    all_data = kb_collection.get(include=["documents", "metadatas", "embeddings"])

    wiki_count = 0
    for i, (doc, meta, emb) in enumerate(zip(
        all_data["documents"],
        all_data["metadatas"],
        all_data["embeddings"]
    )):
        # 为每个条目创建 Wiki 页面
        wiki_meta = {
            **meta,
            "kind": "wiki",
            "wiki_type": meta.get("kb_type", "general"),
            "source": meta.get("source", "unknown"),
        }

        # 添加 Wiki 格式的内容
        wiki_content = _format_wiki_content(doc, meta)

        wiki_collection.add(
            ids=[f"wiki_{meta.get('kb_id', i)}"],
            documents=[wiki_content],
            embeddings=[emb],
            metadatas=[wiki_meta],
        )
        wiki_count += 1

    print(f"[Wiki] 构建完成: {wiki_count} 个 Wiki 页面")
    return wiki_count


def _format_wiki_content(content: str, metadata: dict) -> str:
    """
    将原始知识条目格式化为 Wiki 页面格式
    添加 YAML frontmatter 和结构化内容
    """
    kb_type = metadata.get("kb_type", "general")
    name_cn = metadata.get("name_cn", "")
    name_en = metadata.get("name_en", "")

    # 构建 Wiki 页面
    lines = []

    # YAML frontmatter
    lines.append("---")
    lines.append(f"type: {WIKI_TEMPLATES.get(kb_type, {}).get('type', 'entity')}")
    lines.append(f"subtype: {WIKI_TEMPLATES.get(kb_type, {}).get('subtype', 'general')}")
    lines.append(f"title: {name_cn} {('/ ' + name_en) if name_en else ''}")
    lines.append(f"source: {metadata.get('source', 'unknown')}")
    lines.append(f"kb_type: {kb_type}")
    if metadata.get("tags"):
        lines.append(f"tags: {metadata['tags']}")
    lines.append("---")
    lines.append("")

    # 标题
    lines.append(f"# {name_cn} {('(' + name_en + ')') if name_en else ''}")
    lines.append("")

    # 内容
    lines.append(content)
    lines.append("")

    # 相关链接（模拟 wikilink）
    if kb_type == "camera":
        lines.append("## 相关运镜")
        lines.append("- [[其他运镜]] — 查看运镜库完整列表")
    elif kb_type == "style":
        lines.append("## 相关风格")
        lines.append("- [[其他风格]] — 查看风格库完整列表")

    return "\n".join(lines)


def search_with_wiki(query: str, top_k: int = 5, score_threshold: float = 0.45) -> list[dict]:
    """
    Wiki 优先的混合检索
    1. 检索 Wiki 页面（kind=wiki）
    2. 检索原始知识库（kind!=wiki）
    3. Wiki 页面加权 boost
    4. 合并去重
    """
    client = chromadb.PersistentClient(path=CHROMA_PATH)

    results = []

    # 1. 检索 Wiki 页面
    try:
        wiki_collection = client.get_collection("stzh_wiki")
        if wiki_collection.count() > 0:
            # Wiki 检索逻辑（简化版，实际应使用向量检索）
            wiki_data = wiki_collection.get(include=["documents", "metadatas"])
            for doc, meta in zip(wiki_data["documents"], wiki_data["metadatas"]):
                # 简单关键词匹配（实际应使用向量相似度）
                if any(kw in doc.lower() for kw in query.lower().split()):
                    results.append({
                        "content": doc,
                        "metadata": meta,
                        "score": 0.8,  # Wiki 默认高分
                        "id": f"wiki_{meta.get('kb_id', 'unknown')}",
                        "kind": "wiki",
                    })
    except Exception:
        pass

    # 2. 如果 Wiki 结果不足，补充原始知识库
    if len(results) < top_k:
        try:
            kb_collection = client.get_collection("stzh_knowledge")
            # 这里应该使用向量检索，简化为返回空
            pass
        except Exception:
            pass

    return results[:top_k]


if __name__ == "__main__":
    print("=== Wiki 知识层构建 ===")
    count = build_wiki_from_knowledge_base()
    print(f"构建完成: {count} 个 Wiki 页面")
