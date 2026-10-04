# 模型厂商连接

按main源码核对：2026-10-02。当前入口为模型与角色中心，依据 [provider-presets.ts](../../app/lib/provider-presets.ts)、[ModelRoleCenter](../../app/components/ModelRoleCenter.tsx)、[模型路由](../../server/routes/creative-agent.js)、[发现](../../server/lib/provider-discovery.js)和[地址校验](../../server/lib/provider-host.js)。

## 保存、列表和验证

1. 选择厂商，分别核对官网、API基址与协议。官网只打开控制台，不自动成为API。
2. 输入个人密钥，获取模型列表并选择模型；没有可用列表接口时可手填模型ID。
3. 服务端按账户加密保存连接，返回密钥存在状态与脱敏提示，原密钥不返回。
4. 连接验证会执行一次文字模型调用；列表可读、保存成功不证明推理通过。
5. API地址、协议、模型或密钥变化后旧验证失效。使用已保存密钥获取列表不能把它发送到改后的地址；新地址须重新核对/填写密钥。
6. 设置输出和上下文限制时按实际厂商能力填写；本地容量估算不是精确token计数或协议支持保证。

主要路由是 `/api/model-providers`、`POST /api/model-providers/discover-models`、`POST /api/model-providers/:id/test` 与 `POST /api/model/chat`。旧 `/api/llm/providers` 是兼容接口。

## 网络策略与部署

模型地址默认拒绝本机、内网和特殊地址。列表发现检查全部DNS结果，将核准地址固定到本次连接，保持TLS域名校验并拒绝重定向。

部署者可配置 `STZH_TRUSTED_MODEL_GATEWAYS`，值为“准确域名 → 经核实IP数组”的JSON。例外要求HTTPS、443端口和全部DNS结果匹配；占位结构为：

~~~text
{"<已核实的准确域名>":["<该环境核实的网关IP>"]}
~~~

该结构需要替换为真实有效配置，不是可直接复制的网关许可。不要沿用开发机历史DNS/IP。`STZH_ALLOW_PRIVATE_MODEL_URLS` 为部署者主动允许本地模型的另一路策略，按目标环境单独配置，不作为公网连接的默认修复。

模型密文依赖 `STZH_LLM_ENCRYPTION_KEY`；切换数据目录或更换加密材料不会迁移原连接。详见[后端配置](../../BACKEND_SETUP.md)。

## 请求生命周期

页面只应用当前账户最新读取结果；卸载/切换账户时取消旧请求。写入/验证操作捕获发起时账户，同一操作进行中防重复提交。

500、断线或回包丢失时先只读当前列表、核对实际状态并保留改稿，不能认为写入未生效或自动再次收费验证。4xx输入错误修正后由用户决定重试；本地取消不证明服务器/上游已撤销。

## 故障位置与证据

| 现象 | 核对 |
|---|---|
| DNS/内网拒绝 | 实际DNS、协议/端口与部署名单，不直接关闭全部校验 |
| 401/403 | 当前厂商密钥、列表/推理权限及区域 |
| 列表404/405 | API基址、协议、厂商是否提供列表 |
| 保存失败 | 加密材料、当前账户和实际列表状态 |
| 推理失败 | 模型ID、输出预算、协议、上游配额与网络 |
| Coze限流 | 独立Coze配置和配额，模型列表恢复不能证明Coze恢复 |

旧本机18080预览、未跟踪启动脚本及忽略的输出报告不是新克隆自带环境。有限MiMo/组件行为的历史证据保留在[更新记录](../../更新md/README.md)，不能升级为其他厂商或本次验证。当前测试入口为[provider-discovery测试](../../server/test/model-provider-discovery.test.js)与[生命周期测试](../../test/model-center-lifecycle.test.js)；本次不调用真实模型。阶段4独立质量与生产验收继续开放。
