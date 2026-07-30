# 真实模型下载与缓存

WP-33 将固定 DistilGPT-2 资源接入版本化 Worker 协议。真实模型不会随页面启动自动下载；只有用户阅读体积、隐私和缓存说明并点击“确认并下载”后，页面才创建模型 Worker。

## 资源链路

1. Worker 按固定仓库 Revision 请求五个资源，总计 87,020,477 字节。
2. 每个响应按流读取并上报文件级与总进度；完成后校验清单中的字节数和 SHA-256。
3. 有效响应写入 `transformer-layerscape-model-v1-a41c10485c18`。缓存名包含资源 Revision，升级模型不会误用旧字节。
4. 量化 ONNX 源文件在 Worker 中应用 28,206 字节的 gzip copy/insert 指令流，生成 84,918,412 字节的插桩图。
5. 插桩结果再次校验 SHA-256 `e6db38a049caa9434436b2055c5ee5bfb77b7f8c0098aefe790d08f13ef62132`，随后由 ONNX Runtime Web 创建 WASM Session。

插桩补丁只保存官方固定源图与已验证教学图之间的确定性差异，不重新分发完整模型。补丁可由以下命令从两个本地固定文件重新生成：

```bash
node scripts/model-tools/create-model-binary-patch.mjs \
  .cache/wp31/decoder_model_merged_quantized.onnx \
  .cache/wp31/decoder_model_merged_quantized_instrumented.onnx \
  src/platform/model-runtime/distilgpt2-instrumentation-patch.mjs
```

## 取消与恢复

- 下载、校验和插桩阶段都接收同一个 `AbortSignal`；用户取消后立即终止 Worker，不保留未完成的缓存项。
- 缓存命中仍重新校验大小和 SHA-256。损坏条目会被删除，并从固定 URL 重试一次。
- 网络失败与初始化失败返回可重试错误；文件大小或哈希不符返回完整性错误。
- Cache Storage 不可用或写入失败时，本次 Session 仍可继续使用已经校验的内存字节，不把缓存能力误当成推理前置条件。
- 所有大文件读取、补丁构造和 ONNX Session 初始化都在专用 Worker 内完成，预置课程与页面主线程不依赖真实模型状态。

## 浏览器验收

`npm run verify:model:download` 使用临时浏览器上下文把本地已固定资源预置到 Cache Storage，再通过真实界面触发 Worker 链路。2026-07-30 的系统 Chromium 验收结果：

| 验证项 | 结果 |
| --- | --- |
| 缓存资源 | 5 个文件，87,020,477 字节 |
| 模型外网请求 | 0（全部命中版本化缓存） |
| 缓存读取到 WASM Session 就绪 | 3,755.6ms |
| 16ms 主线程响应探针 | 232 次 |
| 页面 / Worker 错误 | 0 |

单元与组件测试另外覆盖：确认前零 Worker、进度展示、取消、失败重试、损坏缓存恢复、失败时无半成品缓存、补丁源/目标哈希以及初始化取消竞态。

从 WP-34 起，同一个浏览器验收命令还会在重新加载页面后运行第 6 层真实推理并验证统一 `ModelTrace`；适配结果见 [真实模型轨迹适配器](./MODEL_TRACE_ADAPTER.md)。
