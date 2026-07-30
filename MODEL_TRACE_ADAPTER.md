# 真实模型轨迹适配器

WP-34 让固定 DistilGPT-2 的浏览器推理结果进入与预置课程相同的 `ModelTrace` Schema。模型分词、ONNX 推理、完整词表 Softmax 和语义张量整理都在专用 Worker 中完成；主线程 `OnnxTraceAdapter` 只接收 Transferable Buffer、恢复张量并运行统一契约校验。

## 真实推理输入

- Tokenizer 直接由已经校验并缓存的 `tokenizer.json` 与 `tokenizer_config.json` 构造，不发起第二套模型请求。
- merged decoder 首次推理显式传入 `use_cache_branch=false`，并为 6 层 Key/Value 提供 `[1, 12, 0, 64]` 空 Cache。
- 推理请求携带文本、所选 Layer 与 Temperature、Top-k、Top-p、Seed；WP-35 已开放带精确 Token 预检的参数界面。
- Worker 只把所选层的教学张量、最后位置的完整 Logits/Probabilities 和候选 Token 转移回主线程，不把 81 个插桩输出全部复制到 UI。

## 22 个统一张量

| 阶段 | `TensorRole` |
| --- | --- |
| 输入与 Embedding | `token-ids`、`token-embedding`、`position-embedding`、`embedding` |
| 所选 Block 输入 | `block-input`、`normalized` |
| Attention | `query`、`key`、`value`、`attention-mask`、`attention-weights`、`attention-head-output` |
| Attention 输出 | `attention-concatenated`、`attention-output`、`attention-residual` |
| MLP | `feed-forward-normalized`、`mlp-expanded`、`mlp-activated`、`mlp-output`、`block-output` |
| 词表输出 | `logits`、`probabilities` |

`attention-concatenated` 是各 Head 上下文按 Token 拼接的 `[1, token, 768]` 张量；`attention-output` 是拼接结果再经过真实 `c_proj` 的输出。`block-input` 在第 1 层等于 Embedding Sum，在后续层等于上一 Block 输出。把这两个概念独立建模后，第 2～6 层不需要伪造为第 1 层，也不会把学习型投影误当成恒等映射。

## 共用契约

`PresetTraceAdapter` 与 `OnnxTraceAdapter` 都经过 `loadTraceAdapterContract`，最终调用同一个 `validateModelTrace`。真实轨迹继续校验：

- 全部 Tensor 角色、DType、Shape、Buffer 长度和引用；
- Token ID、Q/K/V、Head、因果 Mask 与 Attention 权重形状；
- Head 输出到多头拼接的索引对应；
- `block-input + c_proj = attention-residual`；
- GELU 与两条残差路径；
- 完整 50,257 维 Logits、Softmax 概率、候选 Token 和确定性采样。

学习型 LayerNorm 含训练得到的缩放与偏置，因此真实来源只校验完整 Shape 与有限数值，不沿用教学 Fixture 的“严格零均值、单位方差”假设。纯空白词表项使用可见 Unicode Code Point 标签展示，Token ID 与概率不变。

## 浏览器验收

`npm run verify:model:trace` 会预置固定缓存、完成真实 Worker 初始化，再用文本 `The sky is blue` 读取第 6 层。2026-07-30 系统 Chromium 验收结果：

| 验证项 | 结果 |
| --- | --- |
| Token ID | `464, 6766, 318, 4171` |
| 模型结构 | 6 Layers、12 Heads、Hidden 768 |
| 统一语义张量 | 22 |
| 完整词表候选 | 50,257 |
| 推理、Transfer 与契约适配 | 774ms |
| 概率总和误差 | `5.43e-9` |
| Attention 行和最大误差 | `8.01e-8` |
| 第 6 层输入 | 已确认不同于初始 Embedding |
| 采样结果（默认参数） | Token `11`，`,` |
| 浏览器诊断错误 | 0 |
