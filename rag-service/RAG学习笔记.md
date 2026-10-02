# 腾昇智和 · RAG原理与当前服务

文档按main源码核对2026-10-02。Python RAG是**可选共享知识库**，不等于账户私有项目记忆；阶段4尚未完成。本次不安装模型、访问个人语料或重建索引。

## 原理与本项目实现

RAG先把资料编码并索引，再为当前问题取相关片段，作为模型参考。它能补充上下文，但检索分数和引用本身不证明资料真实、最新或模型正确采用。

| 层次 | 当前实现 |
|---|---|
| 资料 | CSV/XLSX/DOCX，分别由ingest加载；有“重构版”和原始目录规则 |
| 表示 | Sentence Transformers的 `BAAI/bge-large-zh-v1.5`，归一化embedding |
| 存储 | `rag-service/chroma_db/`，主集合 `stzh_knowledge` |
| 检索 | 余弦距离、top-k与阈值，MQE词法扩展及可选HyDE |
| Wiki层 | 从主库组织 `stzh_wiki`，可独立构建/检索 |
| HTTP | FastAPI/Uvicorn，默认5000 |
| Web接入 | JWT后的Express `/api/rag/*` 转发，再作为共享资料进入当前请求 |

本项目Python代码的分数计算是 `score = 1 - distance / 2`，不是概率或事实可信度。默认top_k=5、score_threshold=0.45，阈值应根据自己的固定语料评测，不能从单例分数推导生产质量。

## 当前文件

- [ingest.py](ingest.py)：加载资料、编码并写主集合。
- [retriever.py](retriever.py)：模型/集合懒加载、单次搜索、查询扩展与HyDE。
- [wiki_builder.py](wiki_builder.py)：Wiki集合组织及检索。
- [main.py](main.py)：FastAPI端点与后台Wiki任务。
- [requirements.txt](requirements.txt)：固定Python依赖。
- [Web检索客户端](../app/lib/rag-client.ts)、[Express检索路由](../server/routes/retrieval.js)：身份、输入校验和资料状态。

## 首次准备

准备能安装固定依赖的Python环境、模型下载网络/磁盘/内存和自己的语料。仓库没有锁定Python解释器版本，本次未验证这些依赖在新机器上的安装。

~~~powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r rag-service/requirements.txt
~~~

macOS/Linux激活使用 `source .venv/bin/activate`。不要因为有启动脚本就假定模型和语料随仓库提供。

当前源码仍有开发机绝对路径：`ingest.py` 的KB_ROOT、KB_REFINED及MODEL_CACHE，`retriever.py` 的MODEL_CACHE。首次运行前需在自己的运行副本配置这些实际路径；不存在 `RAG_KB_ROOT` 等自动环境变量替代入口。本次文档任务不修改Python源码。

入库：

~~~bash
npm run rag:ingest
~~~

**ingest会删除并重建主集合**，不是无损增量更新；先备份要保留的索引，再对自己的语料运行。不能在已有用户知识库上把该命令当只读检查。资料条数/大小取决于本机，旧开发库数字不能当新克隆事实。

## 启动与访问

~~~bash
npm run rag:start
~~~

脚本实际在rag-service目录运行 `python main.py`；FastAPI监听 `0.0.0.0:5000`。服务端可设：

~~~dotenv
STZH_RAG_URL=http://127.0.0.1:5000
~~~

这项由Express读取；PythonHyDE的变量需由启动Python的进程环境提供，Python没有读取server/.env.local的逻辑：

~~~dotenv
HYDE_LLM_BASE_URL=<可用的兼容模型API基址>
HYDE_LLM_API_KEY=<仅HyDE需要的模型密钥>
HYDE_LLM_MODEL=<模型ID>
~~~

HyDE在配置齐全时可能调用外部文字模型，产生网络/额度消耗；未配置不代表HyDE效果已验证。MQE是代码内的有限查询扩展，不等于任意语义理解。

## HTTP与资料边界

| Python路径 | 行为 |
|---|---|
| `GET /rag/health` | status与entries；空集合仍可能返回ok，需要核对条数 |
| `POST /rag/retrieve` | query、top_k、score_threshold、enable_mqe/enable_hyde；results/query/total |
| `POST /wiki/build` | 后台开始构建，立即返回started，不证明构建已完成 |
| `POST /wiki/search` | Wiki优先检索 |

Web使用鉴权 `POST /api/rag/retrieve` 与 `GET /api/rag/health`。Express检索请求当前接受query/top_k/score_threshold（top_k1–20），不直接透传任意Python选项；返回scope=shared。Python服务本身没有应用JWT，生产作为内部服务，不能以其CORS设置当账户权限保护。

Web客户端对部分短消息/对话性输入跳过检索，步骤可显式请求；默认5条/0.45，检索超时与未命中分别展示。Python不可达、响应错误与0命中不是同一种结果，不能悄悄写成“已查知识库、无资料”。

## 调参与验收

先固定语料/查询与期望来源，再比较分块、top-k、阈值和扩展。记录实际模型版本、条数、延迟、召回、误召回及失败，避免为单例不断改门槛直到通过。

账户私有记忆使用独立SQLite/FTS范围、来源和版本检查，见[记忆API](../docs/knowledge/studio-memory-api.md)；把共享RAG片段送给模型不会授予访问私有会话或执行媒体的权限。

路径可移植化、真实语料效果、生产性能和新机安装未由本轮验证；历史有限本机检索记录保留在[更新索引](../更新md/README.md)。仓库当前检索路由测试与运行边界见[验证指南](../docs/TESTING.md)。
