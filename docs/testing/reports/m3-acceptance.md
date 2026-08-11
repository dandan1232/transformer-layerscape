# M3｜浏览器真实模型模式验收报告

日期：2026-08-11

范围：WP-30～WP-37

结论：M3 通过，可作为公开版本的可选真实模型实验路径。

## 1. 已交付能力

- 固定 DistilGPT-2 不可变 Revision、资源清单、SHA-256 与许可证边界；
- 插桩 ONNX 暴露 Embedding、Q/K/V、Attention、Residual、MLP 和输出状态；
- Worker 协议覆盖加载进度、推理、取消、释放、结构化错误与 Transferable；
- 下载前明确征得同意，支持版本化缓存、完整性校验、取消、重试和离线缓存命中；
- 真实模型与预置案例共用 `ModelTrace`、课程、二维、三维和时间轴；
- 输入最多 12 Token，支持 Layer、Temperature、Top-k、Top-p 与 Seed；
- WebGPU 优先、WASM 回退，并提供低内存提示和显式 Session/Worker 释放。

## 2. 验证证据

| 验证项 | 结果 |
| --- | --- |
| 固定模型与许可证 | `7bb86fc` |
| 插桩与中间状态数值校验 | `c9e9e20` |
| Worker 协议 | `6a676e2` |
| 下载、缓存与恢复 | `df72a34` |
| 统一真实 Trace | `2ed53b5` |
| 参数实验与输入保护 | `5fca595` |
| 性能与内存治理 | `ed88081`、`d9e1d3b` |
| 专项验证脚本 | `npm run verify:model:download` / `npm run verify:model:trace` |

专项脚本覆盖缓存命中/未命中、离线命中/未命中、冷启动恢复、取消、低内存、WebGPU/WASM 选择、资源释放与真实 Trace 数值检查。

## 3. 发布边界

真实模型是用户主动开启的增强路径；预置课程始终无需下载模型即可使用。模型与输入只在浏览器内处理，项目不提供账号、后端推理、云同步或使用统计。

