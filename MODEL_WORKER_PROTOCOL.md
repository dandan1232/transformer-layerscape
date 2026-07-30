# 浏览器模型 Worker 协议

WP-32 建立 `MODEL_WORKER_PROTOCOL_VERSION = 1` 的主线程与模型 Worker 契约。协议只传递可结构化克隆的数据，不把 ONNX Session、DOM 对象或异常实例跨线程共享。

## 请求生命周期

1. Worker 启动后发送 `worker-ready`，声明可用的 `webgpu` / `wasm` 执行提供器。
2. 主线程用唯一 `requestId` 发送 `load-model`、`run-inference` 或 `dispose-model`。
3. 加载期间 Worker 可多次发送 `model-load-progress`，终态只能是对应的成功事件、`request-cancelled` 或 `worker-error`。
4. 主线程发送同一 `requestId` 的 `cancel-request` 后立即结束本地等待；Worker 触发 `AbortSignal`，抑制迟到的进度与成功结果。
5. Worker 崩溃、协议版本不匹配或返回未知消息时，客户端拒绝全部未完成请求，预置课程不受影响。

所有请求按 `requestId` 关联，允许多个推理请求乱序完成，不依赖消息到达顺序。

## 消息

| 方向 | 类型 | 用途 |
| --- | --- | --- |
| Worker → 主线程 | `worker-ready` | 协议握手与执行提供器能力 |
| 主线程 → Worker | `load-model` | 按固定资源 ID 加载，不接受任意远端 URL |
| Worker → 主线程 | `model-load-progress` | 下载、哈希验证、插桩、Session 初始化进度 |
| Worker → 主线程 | `model-loaded` | 模型 ID、实际执行提供器、缓存命中状态 |
| 主线程 → Worker | `run-inference` | 文本、采样参数与选中 Layer |
| Worker → 主线程 | `inference-result` | Token、候选结果、运行时间和张量负载 |
| 主线程 → Worker | `cancel-request` | 取消同 ID 的加载或推理 |
| 主线程 → Worker | `dispose-model` | 释放 Session 与模型资源 |
| Worker → 主线程 | `worker-error` | 稳定错误码、中文消息、可重试标记和可选细节 |

运行时校验拒绝空请求 ID、未知版本/类型、非法执行提供器、非有限采样参数、负进度、超出总量的已下载字节和未知错误码。WP-35 增加 `INPUT_VALIDATION_FAILED`，用于在 ONNX 执行前返回空输入、超过 12 Token 等可修正的输入问题。

## 张量所有权

`inference-result` 中每个张量包含语义 ID、角色、DType、形状、采样方式、长度、统计值与独立 `ArrayBuffer`。Worker 使用 `postMessage(event, transferList)` 转移 Buffer 所有权：

- 完整 TypedArray 底层 Buffer 直接转移，不复制；
- TypedArray 只是较大 Buffer 的切片时，先复制该切片，防止传递无关内存；
- 多个张量意外共享同一 Buffer 时，Transfer List 自动去重；
- 转移后 Worker 不再读取已脱离的 Buffer，主线程成为唯一所有者。

WP-34 的真实推理结果固定输出 22 个语义张量，覆盖 Token、Embedding、当前 Block 输入、Q/K/V、Attention 权重、各 Head 输出、多头拼接、`c_proj` 投影、两条残差、MLP、Logits 与 Probabilities。多头拼接和输出投影保持为两个角色，避免把 GPT-2 的学习型 `c_proj` 错写成恒等映射。

WP-36 把 ONNX Fetch List 收窄为所选 Layer 所需的 18 个原始输出，不再让 Session 返回全部 81 个插桩输出；完整序列 Logits 只复制最后 Token 的 50,257 维切片。张量统计和候选整理每 4,096 项让出一次 Worker 事件循环并检查 AbortSignal，12 Token 的 22 个语义张量 Transferable 总量限制在 1.3MB 内。

`ModelWorkerClient` 负责握手、请求关联、进度回调、AbortSignal 和结构化错误；`attachModelWorkerRuntime` 负责 Worker 侧取消控制、错误归一化和 Transferable 投递。WP-33 与 WP-34 分别注入下载缓存、Session 和真实推理操作，沿用同一协议而不另建消息格式。
