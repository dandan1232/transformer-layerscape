# DistilGPT-2 插桩 ONNX 技术探针

WP-31 已验证固定 DistilGPT-2 量化图可以在不复制权重的前提下输出课程需要的中间状态。结论是采用“提升既有内部张量为 ONNX Graph 输出”的额外输出模型；普通模型与分步重算方案不进入后续实现。

## 方案比较

| 方案 | 结果 | 结论 |
| --- | --- | --- |
| 普通量化图 | 84,911,479 字节，只提供 Logits 与 6 层 KV Cache 共 13 个输出 | 缺少 Q、Attention、Residual 与 MLP，不能作为教学 Trace |
| 额外输出图 | 84,918,412 字节，增加 6,933 字节；保留 13 个原输出并提升 81 个教学输出 | 通过 Node CPU 与浏览器 WASM 实测，采用 |
| 分步重算 | 需要在 JS 或第二张图中重复 LayerNorm、量化投影、Mask、Softmax、Residual 与 GELU | 正确性容易与主图漂移，维护和内存成本更高，拒绝 |

插桩后的完整主动下载量为 87,027,410 字节（87.03MB），仍低于 100MB 目标。模型本体保留在 `.cache/wp31/`，不提交到应用 Git 仓库。

## 输出范围

Embedding 提升 Token Embedding、Position Embedding 和二者之和。每个真实 Transformer Layer 提升：

- 第一次 LayerNorm；
- Query；Key 与 Value 复用模型已有的 `present.{layer}.key/value`；
- 缩放后的 Attention Scores、加入因果 Mask 后的 Scores、Softmax 权重；
- 每 Head 汇总、输出投影、第一条 Residual；
- 第二次 LayerNorm；
- MLP 扩维、GELU 激活、降维投影、第二条 Residual / Block 输出。

语义名与原图张量名由 [`instrumentation-plan.mjs`](./src/platform/model-runtime/instrumentation-plan.mjs) 固定。插桩脚本同时修改合并图的 `no_past` 与 `with_past` 分支；两条分支输出顺序和类型保持一致。

## 实测结果

固定输入 Token ID 为 `[15496, 995, 0]`，序列长度为 3。

| 检查 | 结果 |
| --- | ---: |
| 源模型 SHA-256 | `dfd02dcbfccb31d289cac235f71cecad357030866fe7019f05a36b1c5692afba` |
| 插桩模型 SHA-256 | `e6db38a049caa9434436b2055c5ee5bfb77b7f8c0098aefe790d08f13ef62132` |
| 插桩后总输出 | 94（原 13 + 教学 81） |
| Node CPU Logits 最大差异 | `0.0000152587890625`，低于 `1e-4` 门槛 |
| KV Cache 分支 Logits 最大差异 | `0.00002288818359375`，低于 `1e-4` 门槛 |
| Embedding 相加最大误差 | `1.7508864402770996e-7` |
| 两条 Residual 相加最大误差 | `0.000054389238357543945` |
| Attention 行和最大误差 | `9.033828973770142e-8` |
| 因果 Mask 后最大未来权重 | `0` |
| Node CPU 双 Session 并行实测 | `115.07～119.02ms` |
| 浏览器 WASM 单次推理 | `198.9～212.3ms` |

Node 探针还使用 3 Token KV Cache 执行 `with_past` 分支，读取到 `[1,12,1,4]` Attention，行和误差为 `6.222398951649666e-8`。浏览器探针通过系统 Chromium 内核浏览器与 `onnxruntime-web/wasm` 实际创建 Session，并读取到 `[1,3,50257]` Logits、`[1,12,3,64]` Query、`[1,12,3,3]` Attention 和 `[1,3,3072]` MLP 激活。浏览器 Attention 行和最大误差为 `5.6887074606493115e-8`，未来 Token 权重为 `0`。

时间只用于确认技术可行性，不作为 WP-36 的正式性能预算；机器负载、浏览器和执行提供器都会影响结果。

## 复现

先把 [资源基线](./MODEL_RESOURCES.md) 中固定 Revision 的 ONNX 下载到忽略的本地缓存，再运行：

```bash
npm run spike:model:instrument -- .cache/wp31/decoder_model_merged_quantized.onnx .cache/wp31/decoder_model_merged_quantized_instrumented.onnx
npm run spike:model:verify-node -- .cache/wp31/decoder_model_merged_quantized.onnx .cache/wp31/decoder_model_merged_quantized_instrumented.onnx
npm run spike:model:verify-browser -- .cache/wp31/decoder_model_merged_quantized_instrumented.onnx
```

插桩脚本在写出前强制校验源 SHA-256；输入不是 WP-30 固定资源时立即失败。后续下载与缓存工作包必须先解决插桩产物的固定发布地址或 Worker 内构造流程，`integrationReady` 在此之前保持 `false`。
