# 真实模型性能与内存治理

WP-36 在不减少教学张量、词表候选或数值校验的前提下，收窄 DistilGPT-2 浏览器推理的瞬时载荷，并为 Session 建立可验证的释放路径。

## 推理载荷

- ONNX Session 每次只 Fetch 所选 Layer 需要的 18 个原始输出，不再返回全部 81 个插桩输出。
- `logits` 保持模型完整输出校验，但只复制最后 Token 的 50,257 维切片进入 Trace，避免复制整个 12 Token 序列。
- 22 个语义张量按 4,096 项分块统计 Min、Max 和 Mean；块间让出 Worker 事件循环并检查 AbortSignal。
- 词表 Softmax 和候选整理同样分块；默认采样复验只维护当前 Top-k，不再为验证额外构造并排序 50,257 个增强候选。
- 二维面板进入 Output 阶段前不计算完整采样实验，真实 Trace 切入 Token 第一步时不会同步执行全词表排序。

12 Token、Layer 6 的最大 Worker → 主线程张量 Transferable 预算为 `≤ 1,300,000` 字节。完整 50,257 个候选、22 个语义张量和统一 `ModelTrace` 校验仍然保留。

## 取消与释放

- 下载取消会 Abort 请求并直接终止 Worker。
- 推理取消立即恢复界面操作，Worker 在 ONNX 返回后或下一个 4,096 项检查点停止摘要，不投递迟到结果。
- “释放模型内存”发送 `dispose-model`，等待 `InferenceSession.release()` 后终止 Worker。
- “恢复预置并释放模型”先恢复预置 Trace，再执行相同释放流程。
- 初始化失败、重复加载和页面卸载都以 Worker 终止作为最终资源释放兜底。

## 自动化预算

| 指标 | 预算 | 2026-07-30 系统 Edge 实测 |
| --- | --- | --- |
| 固定资源 | 约 100MB 内 | 87,020,477 字节 |
| 12 Token 张量 Transferable | ≤ 1.3MB | 通过单元压力测试 |
| 推理期间主线程最大 Tick 间隙 | ≤ 300ms | 250.6ms |
| 推理期间主线程最长任务 | ≤ 300ms | 231ms |
| 释放后模型 Worker | 回到加载前基线 | `0 → 1 → 0` |
| 页面堆持续增长 | 释放后新增不超过 32MB | `159,140,378 → 109,107,313` 字节 |
| 缓存命中时模型外网请求 | 0 | 0 |

`npm run verify:model:trace` 使用真实固定模型、版本化 Cache Storage、浏览器 Worker Target 和精确堆内存指标执行上述验证。页面堆指标来自 Chromium `performance.memory`；其他浏览器在 WP-37 验收矩阵中使用各自可用的内存观测能力。
