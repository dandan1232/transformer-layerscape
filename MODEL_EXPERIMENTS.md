# 真实模型参数实验

WP-35 把已经加载的 DistilGPT-2 Worker Session 接入顶部真实模型入口。用户确认下载一次后，可以在同一浏览器 Session 中多次修改输入、观察层和采样参数；生成的 `ModelTrace` 会安全替换工作台数据，预置课程 Trace 保留在内存中并可一键恢复。

## 输入保护

界面先校验空值和参数边界，Worker 再使用真实 GPT-2 Byte-level BPE 得到精确 Token 数。Token 检查发生在 `session.run()` 之前：

- 空输入或没有产生 Token：拒绝推理；
- 1～12 Token：允许进入 ONNX；
- 超过 12 Token：返回 `INPUT_VALIDATION_FAILED` 和实际 Token 数，不截断、不运行 ONNX；
- 页面取消推理：AbortSignal 结束当前等待，保留已加载 Session 供下一次实验使用。

浏览器验收中的超长文本被分成 14 Token，界面显示“真实模型最多支持 12 个”，随后可直接修改为合法输入继续实验。

## 参数边界

| 参数 | 范围 | 行为 |
| --- | --- | --- |
| Layer | 1～6 | 选择输出到统一 Trace 的真实 Block |
| Temperature | 0.2～2 | 有限数字，越界显示错误 |
| Top-k | 1～50,257 | 正整数，覆盖完整 GPT-2 词表上限 |
| Top-p | 0.1～1 | 有限数字，越界显示错误 |
| Seed | 0～999,999 | 非负整数，相同输入和参数可复现 |

界面不会静默夹紧无效参数。只有全部字段通过后才创建 `RunInferencePayload`；Worker 输出的完整基础概率保持不变，Temperature、Top-k、Top-p 与 Seed 只决定可复现采样结果。

## 工作台切换

合法真实 Trace 通过 `ExplorerStore.setTrace()` 原子切换：时间轴回到第一步、播放暂停、来源徽标变为“真实模型已就绪”，2D、3D、课程和自由探索继续读取同一份 Trace。再次打开真实模型面板可运行新参数，也可选择“恢复预置并释放模型”；恢复后来源徽标和全部视图回到预置 Trace。

仅关闭参数面板会保留 Session，便于继续实验。用户可以随时选择“释放模型内存”；恢复预置会先切换 Trace，再发送 `dispose-model` 并终止 Worker。初始化失败和页面卸载也会终止 Worker 兜底，不让失败 Session 持续占用内存。

## 浏览器验收

`npm run verify:model:trace` 现在走完整用户界面，而不是直接调用适配器。2026-07-30 系统 Chromium 结果：

| 验证项 | 结果 |
| --- | --- |
| 14 Token 输入 | ONNX 前拒绝，显示实际 Token 数 |
| 合法输入 | `The sky is blue`，4 Token |
| 观察层 | Layer 6 |
| UI 生成并切换真实 Trace | 1,638.0ms |
| 相同 Seed 重复采样 | Token `11`、`,`，两次一致 |
| 真实来源徽标 | 切换成功 |
| 恢复预置案例 | 切换成功，Worker `1 → 0` |
| 模型外网请求 | 0（版本化缓存命中） |
| 浏览器诊断错误 | 0 |
