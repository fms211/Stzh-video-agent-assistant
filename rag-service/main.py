"""
RAG 检索服务 — FastAPI 入口
启动: python main.py
端口: localhost:5000
支持: RAG 检索 + MQE + HyDE + Wiki 知识层
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from retriever import retrieve, get_collection
from wiki_builder import build_wiki_from_knowledge_base, search_with_wiki

app = FastAPI(title="腾昇智和 RAG 服务", version="2.0.0")

# 线程池（用于运行阻塞操作）
executor = ThreadPoolExecutor(max_workers=2)

# CORS — 允许 Next.js 前端调用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 5
    score_threshold: float = 0.45
    enable_mqe: bool = True
    enable_hyde: bool = True


class RetrieveResult(BaseModel):
    id: str
    content: str
    metadata: dict
    score: float


class RetrieveResponse(BaseModel):
    results: list[RetrieveResult]
    query: str
    total: int


@app.get("/rag/health")
async def health():
    """健康检查"""
    collection = get_collection()
    return {
        "status": "ok",
        "entries": collection.count(),
    }


@app.post("/wiki/build")
async def build_wiki(background_tasks: BackgroundTasks):
    """构建 Wiki 知识层（后台任务，立即返回）"""
    background_tasks.add_task(build_wiki_from_knowledge_base)
    return {"status": "started", "message": "Wiki 构建已在后台启动，请稍后检查"}


@app.post("/wiki/search")
async def wiki_search(req: RetrieveRequest):
    """Wiki 优先检索"""
    results = search_with_wiki(
        query=req.query,
        top_k=req.top_k,
        score_threshold=req.score_threshold,
    )
    return RetrieveResponse(
        results=[RetrieveResult(**r) for r in results],
        query=req.query,
        total=len(results),
    )


@app.post("/rag/retrieve", response_model=RetrieveResponse)
async def retrieve_endpoint(req: RetrieveRequest):
    """
    检索最相关的知识片段

    请求示例:
    {
        "query": "镜头往前推，贴近人物情绪",
        "top_k": 5,
        "score_threshold": 0.45
    }
    """
    results = retrieve(
        query=req.query,
        top_k=req.top_k,
        score_threshold=req.score_threshold,
        enable_mqe=req.enable_mqe,
        enable_hyde=req.enable_hyde,
    )

    return RetrieveResponse(
        results=[RetrieveResult(**r) for r in results],
        query=req.query,
        total=len(results),
    )


if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  腾昇智和 RAG 服务启动")
    print("  http://localhost:5000")
    print("  文档: http://localhost:5000/docs")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=5000)
