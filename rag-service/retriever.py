"""
RAG 检索器 — 基于 bge-large-zh + ChromaDB
负责向量化查询、相似度搜索、结果格式化
支持 MQE 多查询扩展 + HyDE 假设文档嵌入
"""

import os
import json
from typing import Optional
from sentence_transformers import SentenceTransformer
import chromadb

# 模型缓存目录（D盘）
MODEL_CACHE = "D:/models/bge-large-zh"
CHROMA_PATH = os.path.join(os.path.dirname(__file__), "chroma_db")

# HyDE LLM 配置（通过环境变量或默认值）
HYDE_LLM_BASE_URL = os.environ.get("HYDE_LLM_BASE_URL", "")
HYDE_LLM_API_KEY = os.environ.get("HYDE_LLM_API_KEY", "")
HYDE_LLM_MODEL = os.environ.get("HYDE_LLM_MODEL", "")

# 全局单例（懒加载）
_model: Optional[SentenceTransformer] = None
_client: Optional[chromadb.PersistentClient] = None
_collections: Optional[dict] = None


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


def get_collection(name: str = "stzh_knowledge"):
    """
    获取 ChromaDB collection（按 name 缓存，单点改动不破坏现有无参调用）

    Args:
        name: collection 名，默认 "stzh_knowledge"。Wiki 层传 "stzh_wiki"。
    """
    global _client, _collections
    if _collections is None:
        _collections = {}
    if name not in _collections:
        if _client is None:
            _client = chromadb.PersistentClient(path=CHROMA_PATH)
        collection = _client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )
        _collections[name] = collection
        print(f"[RAG] ChromaDB collection '{name}' loaded, {collection.count()} entries.")
    return _collections[name]


def _search_single(query: str, top_k: int, score_threshold: float) -> list[dict]:
    """单次向量检索（内部函数）"""
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


def _expand_query(query: str) -> list[str]:
    """
    查询扩展（规则型 MQE）
    不依赖 LLM，基于领域知识生成语义等价表述
    """
    expansions = [query]

    # 口语→技术术语映射（扩充版）
    oral_to_tech = {
        # 运镜
        "镜头往前推": ["推镜", "Dolly In", "推拉"],
        "往前推": ["推镜", "Dolly In"],
        "推进": ["推镜", "Dolly In"],
        "贴近": ["推镜", "Dolly In"],
        "镜头往后拉": ["拉镜", "Dolly Out", "推拉"],
        "往后拉": ["拉镜", "Dolly Out"],
        "远离": ["拉镜", "Dolly Out"],
        "镜头左右摇": ["摇镜", "Pan"],
        "左右摇": ["摇镜", "Pan"],
        "扫过去": ["摇镜", "Pan"],
        "镜头上下摇": ["俯仰", "Tilt"],
        "上下摇": ["俯仰", "Tilt"],
        "从高处往下拍": ["俯仰", "Tilt"],
        "往下拍": ["俯仰", "Tilt"],
        "镜头升高": ["升降", "Pedestal", "Crane"],
        "升高": ["升降", "Pedestal"],
        "镜头降低": ["升降", "Pedestal"],
        "降低": ["升降", "Pedestal"],
        "镜头环绕": ["环绕", "Arc"],
        "环绕": ["环绕", "Arc"],
        "绕着拍": ["环绕", "Arc"],
        "镜头跟随": ["跟拍", "Follow"],
        "跟随": ["跟拍", "Follow"],
        "跟着拍": ["跟拍", "Follow"],
        "镜头平移": ["横移", "Truck"],
        "平移": ["横移", "Truck"],
        "横着移": ["横移", "Truck"],
        "画面稳住": ["定机", "Locked Down"],
        "稳住不晃": ["定机", "Locked Down"],
        "固定镜头": ["定机", "Locked Down"],
        "镜头晃动": ["手持", "Handheld"],
        "晃一晃": ["手持", "Handheld"],
        "手持感": ["手持", "Handheld"],
        "变焦": ["Zoom", "变焦"],
        "景深变化": ["焦点转移", "Rack Focus"],
        "虚化背景": ["焦点转移", "Rack Focus"],
        "眩晕效果": ["眩晕变焦", "Dolly Zoom"],
        "航拍": ["航拍", "Aerial", "Drone"],
        "无人机": ["航拍", "Aerial", "Drone"],
        # 风格
        "电影感": ["电影质感", "Cinematic"],
        "赛博朋克": ["赛博朋克", "Cyberpunk"],
        "水墨画": ["水墨画", "Watercolor", "Ink painting"],
        "动漫风": ["动漫风格", "Anime"],
        "复古": ["复古", "Vintage", "Retro"],
    }

    # 1. 口语→技术术语匹配
    for oral, techs in oral_to_tech.items():
        if oral in query:
            for tech in techs:
                if tech not in expansions:
                    expansions.append(tech)

    # 2. 添加英文关键词（如果查询包含中文运镜术语）
    en_terms = {
        "推镜": "Dolly", "拉镜": "Dolly Out", "摇镜": "Pan",
        "俯仰": "Tilt", "变焦": "Zoom", "升降": "Pedestal",
        "横移": "Truck", "跟拍": "Follow", "环绕": "Arc",
        "定机": "Locked Down", "手持": "Handheld",
        "焦点转移": "Rack Focus", "眩晕变焦": "Dolly Zoom",
        "航拍": "Aerial",
    }
    for cn, en in en_terms.items():
        if cn in query and en not in expansions:
            expansions.append(en)

    # 3. 添加"运镜"/"风格"等上下文词（如果查询很短）
    if len(query) < 8:
        context_words = ["运镜", "镜头", "拍摄"]
        for w in context_words:
            expanded = f"{query} {w}"
            if expanded not in expansions:
                expansions.append(expanded)

    return expansions[:5]  # 最多 5 个扩展


def _generate_hypothetical(query: str) -> str:
    """
    HyDE：生成假设性知识条目（规则型，不依赖 LLM）
    基于查询生成一个"理想答案"的结构化描述，用于向量检索
    """
    # 运镜类查询的假设文档模板
    camera_templates = {
        "推镜": "推镜（Dolly In）：摄影机向前移动靠近被摄主体，增强压迫感和沉浸感。适用于人物情绪特写、产品展示、悬疑氛围营造。",
        "拉镜": "拉镜（Dolly Out）：摄影机向后移动远离被摄主体，释放空间感。适用于场景全貌展示、情感疏离、结尾收束。",
        "摇镜": "摇镜（Pan）：摄影机水平旋转扫过画面，引导观众视线。适用于环境介绍、跟随动作、对话场景。",
        "俯仰": "俯仰（Tilt）：摄影机垂直旋转上下拍摄。俯拍展示全景，仰拍制造压迫感或崇敬感。",
        "变焦": "变焦（Zoom）：镜头焦距变化，拉近或推远画面。快速变焦制造冲击，缓慢变焦引导注意力。",
        "升降": "升降（Pedestal/Crane）：摄影机垂直升降。升高俯瞰全局，降低贴近地面视角。",
        "横移": "横移（Truck）：摄影机水平移动，平行于被摄主体。适用于展示空间关系、跟随移动主体。",
        "跟拍": "跟拍（Follow）：摄影机跟随主体移动。适用于动态场景、行走对话、追逐场面。",
        "环绕": "环绕（Arc）：摄影机围绕主体做弧形运动。适用于360度展示、强调主体、制造戏剧张力。",
        "定机": "定机（Locked Down）：摄影机完全固定不动。适用于观察性拍摄、让演员表演、营造静态美感。",
        "手持": "手持（Handheld）：手持摄影机拍摄，带有自然晃动。适用于纪实感、紧张氛围、主观视角。",
        "焦点转移": "焦点转移（Rack Focus）：在不同主体间切换焦点。引导观众注意力，揭示画面信息。",
        "眩晕变焦": "眩晕变焦（Dolly Zoom）：推镜同时反向变焦，背景透视扭曲。制造眩晕、顿悟、心理冲击。",
        "航拍": "航拍（Aerial/Drone）：无人机或直升机高空拍摄。适用于宏大场景、环境全貌、壮观开场。",
    }

    # 风格类查询的假设文档模板
    style_templates = {
        "电影质感": "电影质感（Cinematic）：使用宽画幅、浅景深、专业灯光和调色，营造大银幕视觉效果。常用2.35:1画幅，低饱和度色调，黄金时刻光线。",
        "赛博朋克": "赛博朋克（Cyberpunk）：霓虹灯光、雨夜街道、高科技与低生活对比。色调以蓝紫粉为主，高对比度，体积光效果。",
        "水墨画": "水墨画风格（Watercolor/Ink）：中国传统水墨意境，黑白灰为主色调，留白构图，晕染效果，禅意美学。",
        "动漫风格": "动漫风格（Anime）：日式动漫视觉特征，线条清晰，色彩鲜明，夸张表情，动态构图。",
        "复古": "复古风格（Vintage/Retro）：胶片质感、颗粒噪点、褪色调色、怀旧氛围。模仿60-80年代视觉风格。",
    }

    query_lower = query.lower()

    # 匹配运镜
    for key, template in camera_templates.items():
        if key in query:
            return template

    # 匹配风格
    for key, template in style_templates.items():
        if key in query:
            return template

    # 通用模板：将查询包装成知识条目格式
    return f"关于「{query}」的专业知识和应用指南。"


def retrieve(query: str, top_k: int = 5, score_threshold: float = 0.45, enable_mqe: bool = True, enable_hyde: bool = True) -> list[dict]:
    """
    检索最相关的知识片段（支持 MQE + HyDE）

    Args:
        query: 用户查询（口语化或技术化均可）
        top_k: 返回条数，默认 5
        score_threshold: 最低相似度阈值（0-1），默认 0.45
        enable_mqe: 是否启用多查询扩展，默认 True
        enable_hyde: 是否启用假设文档嵌入，默认 True

    Returns:
        list of {content, source, score, metadata}
    """
    collection = get_collection()
    if collection.count() == 0:
        return []

    # 收集所有查询变体
    queries = [query]

    if enable_mqe:
        expansions = _expand_query(query)
        for q in expansions:
            if q not in queries:
                queries.append(q)

    if enable_hyde:
        hypothetical = _generate_hypothetical(query)
        if hypothetical and hypothetical not in queries:
            queries.append(hypothetical)

    # 所有查询变体检索 → 合并去重
    all_hits = {}

    for q in queries:
        hits = _search_single(q, top_k=top_k * 2, score_threshold=score_threshold)
        for hit in hits:
            hit_id = hit["id"]
            # 同一条知识保留最高分
            if hit_id not in all_hits or hit["score"] > all_hits[hit_id]["score"]:
                all_hits[hit_id] = hit

    # 按分数排序，取 top_k
    merged = sorted(all_hits.values(), key=lambda x: x["score"], reverse=True)
    return merged[:top_k]
