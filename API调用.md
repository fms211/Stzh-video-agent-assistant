# 通过 API 调用智能体
将 AI 编程生成的智能体部署为 API 服务后，你可以通过 OpenAPI 方式将智能体的 AI 功能灵活集成到应用中。
## 前提条件
已将 AI 编程生成的智能体部署为 API 服务。具体可参考[部署智能体](https://docs.coze.cn/api/open/docs/guides/deploy_agent_as_api_service)。
## **获取 API 访问信息**
部署成功后，扣子编程会自动生成 API 服务，你可以在**部署总览**页面获取访问  API 的相关信息。
### **查看 API 访问信息**
获取该服务的 API 访问地址、请求Header、请求参数等详细信息。

1. 在部署的**总览**页面，单击某条部署记录右侧的更多按钮，选择**查看**。
   ![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/eef320d3063c4f90a0bd05f32110ba72~tplv-goo7wpa0wc-image.image)
2. 在**API 请求示例及接口说明**页面，查看该服务的 API 访问信息。
   ![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/52d94dd609844ba98b4e7b9a4429f929~tplv-goo7wpa0wc-image.image)

### **创建 API Token**
你需要创建 API Token，调用 API 时需要使用 API Token 进行身份验证。你需要将创建的 API Token  包含在请求头的 `Authorization` 参数中。

1. 在智能体开发页面，在右侧单击➕打开新的标签页，在弹出的标签页中选择**部署**。
2. 在部署的**总览**页面，单击某条部署记录右侧的更多按钮，选择**查看**。
3. 在**API 请求示例及接口说明**页面，单击**管理 API Token**，单击**创建 API Token** 生成新的 API Token。复制并妥善保存 API Token。 
   * 生成的令牌仅在此时展示一次，请即刻复制并妥善保存。
   * 请妥善保存该 API Token，不要在浏览器或其他客户端代码中暴露 API Token。
   * 每个项目最多能创建 10 个 API Token，API Token 的有效期为永久有效。
   * 暂时不支持在部署详情页面直接调用和调试 API。

   ![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/b009fab8cedb4c1a8b1849a0b4525778~tplv-goo7wpa0wc-image.image)
4. （可选）你也可以在 **API Token** 页面查看已创建的 API Token 列表，删除不再使用的 API Token。

## 调用智能体 API
部署完成后，你可以在你的应用程序或网页中通过 HTTP 请求来调用智能体的 API，以便集成智能体的 AI 能力。
**接口说明**
调用智能体的 API 请求地址的格式为 `https://<your_domain>/stream_run`，是一个流式响应 API。调用该 API 时，服务端不会一次性发送所有数据，而是以数据流的形式逐条发送数据给客户端，数据流中包含智能体执行过程中触发的各种事件，直至处理完毕或处理中断。
API 的请求参数由 AI 编程自动生成，具体参数说明可在部署详情页的 **API 请求示例及接口说明**页面查看。
AI 编程项目中不兼容低代码 API 文档中的[上传文件](https://docs.coze.cn/api/open/docs/developer_guides/upload_files)等 API 。

**调用方法**

1. 复制扣子编程提供的 Curl 请求命令。
   ![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/0c99f0481c2d44edadc4a2f961d9b111~tplv-goo7wpa0wc-image.image)
2. 将 header 中的 `<YOUR_TOKEN>` 替换为你在[创建 API Token](https://docs.coze.cn/api/open/docs/guides/deploy_agent_as_api_service#067c13f8)中获取的 API Token。
3. 通过 Postman 或相关工具调用对应的 API 。
   以下是某个智能体的 API 请求示例和返回示例。
   
   <div type="doc-tabs">
   <div type="tab-item" title="请求示例" key="JmhJ1fQAUn">
   
   ```JSON
   curl --location --request POST "https://m48gym***.coze.site/stream_run" \
     --header "Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjEwOGU2OTE3LWQwNGYtNDg3Zi1hYjdhLWY0NWIwYWQ4YmM0MCJ9.eyJpc3MiOiJodHRwczovL2FwaS5jb3plLmNuIiwiYXVkIjpbIkgzOVZkS3BwUmVKVXdjMU81VmtraWZkZW9CajZrVlRBIl0sImV4cCI6ODIxMDI2Njg3Njc5OSwiaWF0IjoxNzY2NTU2NzI4LCJzdWIiOiJzcGlmZmU6Ly9hcGkuY296ZS5jbi93b3JrbG9hZF9******" \
     --header "Content-Type: application/json" \
     --data '{
         "content": {
           "query": {
             "prompt": [
               {
                 "type": "text",
                 "content": {
                   "text": "今天天气真好，我们去爬山吧"
                 }
               }
             ]
           }
         },
         "type": "query",
         "project_id": 75872598284063***
       }'
   ```
   
   
   </div>
   <div type="tab-item" title="返回示例" key="tCpTVmyAUn">
   
   ```JSON
   event: message
   data: {"type": "message_start", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "08a1c13d-9dd9-41d1-a065-b40057a***", "sequence_id": 1, "finish": true, "content": {"answer": null, "thinking": null, "tool_request": null, "tool_response": null, "message_start": {"local_msg_id": "", "msg_id": "", "execute_id": "97574940-5ba9-421a-985a-6c5ba***"}, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 2, "finish": false, "content": {"answer": "It", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 3, "finish": false, "content": {"answer": "'s", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 4, "finish": false, "content": {"answer": " a", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 5, "finish": false, "content": {"answer": " nice", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 6, "finish": false, "content": {"answer": " day", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 7, "finish": false, "content": {"answer": " today", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 8, "finish": false, "content": {"answer": "!", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 9, "finish": false, "content": {"answer": " How", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 10, "finish": false, "content": {"answer": " about", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 11, "finish": false, "content": {"answer": " we", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 12, "finish": false, "content": {"answer": " go", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 13, "finish": false, "content": {"answer": " hiking", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 14, "finish": false, "content": {"answer": "?", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 15, "finish": false, "content": {"answer": " 🥾", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 16, "finish": false, "content": {"answer": "  \n\n", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 17, "finish": false, "content": {"answer": "H", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 18, "finish": false, "content": {"answer": "iking", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 19, "finish": false, "content": {"answer": " means", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 20, "finish": false, "content": {"answer": " walking", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 21, "finish": false, "content": {"answer": " in", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 22, "finish": false, "content": {"answer": " the", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 23, "finish": false, "content": {"answer": " mountains", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 24, "finish": false, "content": {"answer": " or", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 25, "finish": false, "content": {"answer": " hills", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 26, "finish": false, "content": {"answer": " for", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 27, "finish": false, "content": {"answer": " fun", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 28, "finish": false, "content": {"answer": ".", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 29, "finish": false, "content": {"answer": " For", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 30, "finish": false, "content": {"answer": " example", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 31, "finish": false, "content": {"answer": ":", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 32, "finish": false, "content": {"answer": " \"", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 33, "finish": false, "content": {"answer": "I", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 34, "finish": false, "content": {"answer": " love", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 35, "finish": false, "content": {"answer": " hiking", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 36, "finish": false, "content": {"answer": " with", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 37, "finish": false, "content": {"answer": " my", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 38, "finish": false, "content": {"answer": " friends", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 39, "finish": false, "content": {"answer": " on", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 40, "finish": false, "content": {"answer": " sunny", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 41, "finish": false, "content": {"answer": " days", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 42, "finish": false, "content": {"answer": "!\"", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 43, "finish": false, "content": {"answer": "  \n\n", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 44, "finish": false, "content": {"answer": "Do", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 45, "finish": false, "content": {"answer": " you", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 46, "finish": false, "content": {"answer": " like", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 47, "finish": false, "content": {"answer": " hiking", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 48, "finish": false, "content": {"answer": "?", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 49, "finish": false, "content": {"answer": " 😊", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "answer", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-****", "msg_id": "f833bcf3-c96a-45b3-89dd-22a7cdcc****", "sequence_id": 50, "finish": true, "content": {"answer": "", "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": null}, "log_id": "20251224141437681CD4591E***"}
   
   event: message
   data: {"type": "message_end", "session_id": "", "query_msg_id": "", "reply_id": "eaccc8a4-a120-434f-b673-b82a***", "msg_id": "39901536-72a5-4dc9-85d5-d8f685d***", "sequence_id": 51, "finish": true, "content": {"answer": null, "thinking": null, "tool_request": null, "tool_response": null, "message_start": null, "message_end": {"code": "0", "message": "", "token_cost": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}, "time_cost_ms": 2861}}, "log_id": "20251224141437681CD4591E***"}
   ```
   
   
   </div>
   </div>