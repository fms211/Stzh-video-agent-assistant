"""
知识库加载脚本 — 解析 xlsx/csv/docx → 分块 → 存入 ChromaDB
运行: python ingest.py
"""

import os
import sys
import pandas as pd
from docx import Document as DocxDocument

# 知识库路径
KB_ROOT = r"E:\HuaweiMoveData\Users\fms\Desktop\圳潮漫剧AIGC\腾昇智和Agent汇总\我们构建的知识库"
KB_REFINED = os.path.join(KB_ROOT, "重构版")

# ChromaDB 路径
CHROMA_PATH = os.path.join(os.path.dirname(__file__), "chroma_db")
MODEL_CACHE = "D:/models/bge-large-zh"


def load_csv_chunks(filepath: str) -> list[dict]:
    """加载 CSV 文件，每行一条知识"""
    df = pd.read_csv(filepath, encoding="utf-8")
    chunks = []
    filename = os.path.basename(filepath)

    for _, row in df.iterrows():
        # 优先用 search_blob，没有则拼接所有列
        if "search_blob" in df.columns and pd.notna(row.get("search_blob")):
            content = str(row["search_blob"])
        else:
            content = " | ".join(str(v) for v in row.values if pd.notna(v))

        # 提取元数据
        name_cn = str(row.get("运镜名称", row.iloc[1] if len(row) > 1 else ""))
        name_en = str(row.get("英文名", row.iloc[2] if len(row) > 2 else ""))
        kb_id = str(row.get("id", row.iloc[0] if len(row) > 0 else ""))

        chunks.append({
            "id": f"csv_{filename}_{kb_id}",
            "content": content,
            "metadata": {
                "source": filename,
                "kb_type": "camera_motion",
                "name_cn": name_cn,
                "name_en": name_en,
                "kb_id": kb_id,
            },
        })

    return chunks


def load_xlsx_chunks(filepath: str) -> list[dict]:
    """加载 XLSX 文件，每行一条知识"""
    df = pd.read_excel(filepath, engine="openpyxl")
    chunks = []
    filename = os.path.basename(filepath)

    # 推断知识库类型
    if "运镜" in filename:
        kb_type = "camera_motion"
    elif "艺术家" in filename or "Midlibrary" in filename:
        kb_type = "artist_style"
    elif "关键词" in filename or "扩写" in filename:
        kb_type = "keyword_expand"
    elif "Prompt" in filename or "参数" in filename:
        kb_type = "image_prompt"
    else:
        kb_type = "general"

    for idx, row in df.iterrows():
        content = " | ".join(str(v) for v in row.values if pd.notna(v))

        # 尝试提取名称字段
        name_cn = ""
        name_en = ""
        for col in df.columns:
            col_lower = str(col).lower()
            if "名称" in str(col) or "中文" in str(col):
                name_cn = str(row[col]) if pd.notna(row[col]) else ""
            if "英文" in str(col) or "english" in col_lower or "name_en" in col_lower:
                name_en = str(row[col]) if pd.notna(row[col]) else ""

        chunks.append({
            "id": f"xlsx_{filename}_{idx}",
            "content": content,
            "metadata": {
                "source": filename,
                "kb_type": kb_type,
                "name_cn": name_cn,
                "name_en": name_en,
                "kb_id": str(idx),
            },
        })

    return chunks


def load_docx_chunks(filepath: str) -> list[dict]:
    """
    加载 DOCX 文件，按 [MAP] 分割条目
    每个 [MAP] 开始到下一个 [MAP] 为一个 chunk
    """
    doc = DocxDocument(filepath)
    chunks = []
    filename = os.path.basename(filepath)

    # 推断知识库类型
    if "运镜" in filename:
        kb_type = "camera_motion"
    elif "关键词" in filename:
        kb_type = "keyword_expand"
    elif "Prompt" in filename or "参数" in filename:
        kb_type = "image_prompt"
    elif "元素标签" in filename:
        kb_type = "element_tag"
    elif "角色" in filename:
        kb_type = "character"
    else:
        kb_type = "general"

    # 提取所有段落文本
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]

    # 按 [MAP] 分割条目
    current_entry = []
    current_map = ""
    entry_idx = 0

    for para in paragraphs:
        if para.startswith("[MAP]"):
            # 保存上一条
            if current_entry:
                content = "\n".join(current_entry)
                chunks.append({
                    "id": f"docx_{filename}_{entry_idx}",
                    "content": content,
                    "metadata": {
                        "source": filename,
                        "kb_type": kb_type,
                        "name_cn": _extract_map_field(current_map, "name_cn"),
                        "name_en": _extract_map_field(current_map, "name_en"),
                        "kb_id": _extract_map_field(current_map, "id"),
                    },
                })
                entry_idx += 1

            current_map = para
            current_entry = [para]
        else:
            current_entry.append(para)

    # 最后一条
    if current_entry:
        content = "\n".join(current_entry)
        chunks.append({
            "id": f"docx_{filename}_{entry_idx}",
            "content": content,
            "metadata": {
                "source": filename,
                "kb_type": kb_type,
                "name_cn": _extract_map_field(current_map, "name_cn"),
                "name_en": _extract_map_field(current_map, "name_en"),
                "kb_id": _extract_map_field(current_map, "id"),
            },
        })

    return chunks


def _extract_map_field(map_line: str, field: str) -> str:
    """从 [MAP] 行提取字段值"""
    if not map_line:
        return ""
    for part in map_line.split("|"):
        part = part.strip()
        if part.startswith(f"{field}="):
            return part[len(field) + 1:]
    return ""


def collect_all_chunks() -> list[dict]:
    """收集所有知识库文件的 chunks"""
    all_chunks = []

    # 优先使用重构版
    if os.path.exists(KB_REFINED):
        print(f"[Ingest] Scanning refined KB: {KB_REFINED}")
        for f in os.listdir(KB_REFINED):
            fp = os.path.join(KB_REFINED, f)
            if f.endswith(".csv"):
                print(f"  Loading CSV: {f}")
                all_chunks.extend(load_csv_chunks(fp))
            elif f.endswith(".xlsx"):
                print(f"  Loading XLSX: {f}")
                all_chunks.extend(load_xlsx_chunks(fp))
            elif f.endswith(".docx"):
                print(f"  Loading DOCX: {f}")
                all_chunks.extend(load_docx_chunks(fp))

    # 回退加载根目录（补充重构版没有的文件）
    print(f"[Ingest] Scanning root KB: {KB_ROOT}")
    existing_sources = {c["metadata"]["source"] for c in all_chunks}
    for f in os.listdir(KB_ROOT):
        fp = os.path.join(KB_ROOT, f)
        if not os.path.isfile(fp):
            continue
        # 跳过重构版已有的
        base_name = f.replace("Coze_", "").replace("KB_Bridge_", "")
        if any(base_name in es for es in existing_sources):
            continue
        if f.endswith(".csv"):
            print(f"  Loading CSV: {f}")
            all_chunks.extend(load_csv_chunks(fp))
        elif f.endswith(".xlsx"):
            print(f"  Loading XLSX: {f}")
            all_chunks.extend(load_xlsx_chunks(fp))
        elif f.endswith(".docx"):
            print(f"  Loading DOCX: {f}")
            all_chunks.extend(load_docx_chunks(fp))

    return all_chunks


def ingest():
    """主函数：加载知识库 → 向量化 → 存入 ChromaDB"""
    from sentence_transformers import SentenceTransformer
    import chromadb

    print("=" * 60)
    print("  腾昇智和 RAG 知识库加载")
    print("=" * 60)

    # 1. 收集所有 chunks
    chunks = collect_all_chunks()
    print(f"\n[Ingest] Total chunks: {len(chunks)}")

    if not chunks:
        print("[Ingest] No chunks found. Check KB paths.")
        sys.exit(1)

    # 2. 加载模型
    print("\n[Ingest] Loading bge-large-zh model...")
    model = SentenceTransformer("BAAI/bge-large-zh-v1.5", cache_folder=MODEL_CACHE)
    print("[Ingest] Model loaded.")

    # 3. 向量化
    print("\n[Ingest] Encoding chunks...")
    texts = [c["content"] for c in chunks]
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
    print(f"[Ingest] Encoded {len(embeddings)} vectors.")

    # 4. 存入 ChromaDB
    print("\n[Ingest] Storing in ChromaDB...")
    client = chromadb.PersistentClient(path=CHROMA_PATH)

    # 删除旧 collection 重建
    try:
        client.delete_collection("stzh_knowledge")
        print("[Ingest] Deleted old collection.")
    except Exception:
        pass

    collection = client.create_collection(
        name="stzh_knowledge",
        metadata={"hnsw:space": "cosine"},
    )

    # 批量写入（ChromaDB 单批上限 ~5000）
    batch_size = 500
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        batch_emb = embeddings[i : i + batch_size]
        collection.add(
            ids=[c["id"] for c in batch],
            documents=[c["content"] for c in batch],
            embeddings=batch_emb.tolist(),
            metadatas=[c["metadata"] for c in batch],
        )
        print(f"  Batch {i // batch_size + 1}: {len(batch)} entries stored.")

    print(f"\n[Ingest] Done! Total entries in ChromaDB: {collection.count()}")
    print(f"[Ingest] Database path: {CHROMA_PATH}")


if __name__ == "__main__":
    ingest()
