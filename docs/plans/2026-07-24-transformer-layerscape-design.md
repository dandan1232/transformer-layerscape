# Transformer LayerScape｜层境：产品与技术设计

日期：2026-07-24  
状态：已确认，待实现

## 1. 产品目标

Transformer LayerScape 是一个面向中文学习者的交互式 Transformer 教学工具。它通过同步的二维计算视图和三维模型空间，帮助懂一点编程、但不了解 Transformer 的用户看懂一次完整的 next-token prediction。

默认学习主线是：

1. 输入英文文本并进行 Tokenization。
2. 生成 Token Embedding 与 Positional Embedding。
3. 经过 LayerNorm、Q/K/V、Masked Self-Attention、Residual 和 MLP。
4. 生成 Logits，执行 Softmax 和 Sampling，得到下一个 Token。

参数实验支持输入文本、随机种子、Temperature、Top-k、Top-p，以及 Transformer Block 和 Attention Head 切换。中文解释默认使用通俗表达，用户展开“深入”内容后可查看公式、张量形状和伪代码。

## 2. 已确认的产品边界

- 中文界面与中文教学，模型输入和案例第一版以英文为主。
- 默认“引导学习”，同时提供不受章节约束的“自由探索”。
- 桌面端同屏联动；移动端在 2D 与 3D 之间切换。
- 预计算案例立即可用，真实模型由用户主动下载。
- 模型首次下载目标控制在约 100MB 内。
- 所有输入和推理留在浏览器，学习进度只保存到 LocalStorage。
- 不接账号、后端、云同步或使用统计。
- 第一版不加入语音、音乐或交互音效。
- 项目重新实现，不复制第三方项目代码、文案或视觉资产。
- 第三方依赖和模型保留法律要求的许可证信息。

## 3. 总体架构

应用采用纯静态 React、Vite 和 TypeScript 架构，分为三层。

### 3.1 推理来源

- `PresetTraceAdapter`：读取随站点发布的压缩预计算案例。
- `OnnxTraceAdapter`：在 Web Worker 中加载 Tokenizer 和量化 ONNX 模型，执行真实推理。

两个适配器必须输出相同的 `ModelTrace`，展示层不能依赖具体推理来源。

### 3.2 共享内核

Zustand Store 是 2D、3D、课程和时间轴的唯一共享状态源，保存：

- 当前 `ModelTrace`
- 当前帧和播放状态
- 当前 Block、Head、Operation 和 Tensor 选择
- Temperature、Top-k、Top-p 和 Seed
- 引导/探索模式
- 2D/3D 布局与设备能力等级

GSAP 只插值共享状态之间的视觉过渡，不拥有业务状态。

### 3.3 展示层

- `LearningShell`：桌面与移动端布局容器。
- `Scene3D`：React Three Fiber、Drei、Instancing 和 LOD。
- `Inspector2D`：D3 负责布局计算，SVG 绘制连接与标签，Canvas 绘制密集矩阵。
- `LessonEngine`：读取 MDX/结构化章节，通过动作 ID 驱动共享状态。
- `Timeline`：播放、暂停、单步和拖动推理关键帧。

## 4. ModelTrace 设计

```ts
interface ModelTrace {
  id: string
  source: 'preset' | 'onnx'
  model: ModelMetadata
  tokens: TokenInfo[]
  nodes: OperationNode[]
  edges: DataFlowEdge[]
  tensors: TensorDescriptor[]
  frames: TraceFrame[]
  outputs: PredictionResult
}
```

`TensorDescriptor` 默认只保存标识、形状、数据类型、取值范围和可视化摘要。完整数值通过 `TensorValueStore` 按需读取，避免把模型权重或全部中间张量复制到主线程。

`TraceFrame` 保存显示状态差异，而不是复制完整张量，因此时间轴可以回到任意关键计算阶段，同时控制内存占用。

## 5. 页面与交互

### 5.1 桌面端

- 顶部：品牌、案例选择、模型状态、引导/探索模式。
- 左侧约 38%：课程、中文解释和 2D 计算视图。
- 右侧约 62%：3D 模型空间。
- 底部：横跨工作台的推理时间轴。

2D 与 3D 双向联动。选择 Embedding、Attention、MLP、Output、Q/K/V、矩阵单元、Block 或 Head 时，另一视图同步定位与高亮。

### 5.2 移动端

- 保留完整 2D 教学路径。
- 主体使用 2D/3D 切换，不进行狭窄分屏。
- 3D 自动降低实例数、像素比、阴影、透明层和粒子效果。
- 真实模型必须由用户主动确认下载。

### 5.3 3D 镜头

引导模式自动定位镜头，但用户可以随时旋转和缩放。“返回教学视角”恢复当前章节镜头。自由探索模式允许任意浏览。

## 6. 三维精度与 LOD

小型教学模型逐单元完整展示。真实模型保持层数、Head 数和张量形状准确，但采用分级显示：

1. 远景：模块和张量块聚合。
2. 中景：展示行列、Head 和 Block 分组。
3. 近景：为视野内或被选中的范围按需实例化单元。

每个参数不会始终作为独立 Three.js Object。实现使用 InstancedMesh、分块缓冲、视锥裁剪和实例预算，保证结构真实但运行可控。

## 7. 模型方案

第一版真实模型基于英文 DistilGPT-2。目标使用约 85–90MB 的量化 ONNX 模型与约 3MB 的 Tokenizer 资源。

为了获取教学需要的内部过程，需要制作带观测输出的 ONNX 导出版本，输出：

- Token 与 Position Embedding
- LayerNorm 中间结果
- Q、K、V
- Attention Score、Mask 与 Softmax
- Residual
- MLP 中间结果
- Logits 与最终概率

输入最多允许 12 个 Token。超出限制时显示明确提示，不静默截断。

推理运行在 Web Worker 中。主线程接收下载进度、模型状态、Trace Metadata 和当前步骤需要的可转移 TypedArray。

## 8. 课程系统

课程内容与渲染代码分离。章节使用 MDX 或结构化配置编写，每个步骤包含：

- 中文标题和通俗解释
- 可选公式、张量形状和伪代码
- 当前 Trace Frame
- 2D 高亮目标
- 3D 镜头与高亮目标
- 完成条件和导航关系

第一条垂直切片使用一个预计算案例，走通 Token、Attention 和 Output，并验证完整的 2D/3D 同步链路。

## 9. 降级与错误处理

设备能力分为：

- 完整模式：WebGL2 和模型推理可用。
- 兼容模式：降低 3D 细节和动画。
- 教学模式：只运行 2D 与预计算案例。

WebGPU 仅作为推理加速选项，失败时回退 WASM。3D、课程和推理使用独立 Error Boundary。WebGL Context Lost 时允许重建 3D；模型失败时保留当前预计算课程。

模型状态包含未下载、等待确认、下载中、初始化、可用、已取消和失败。下载前显示预计体积，支持取消、重试和版本化缓存。

LocalStorage 数据带 Schema 版本，数据损坏时只重置学习进度。

## 10. 视觉与无障碍

视觉方向为“数字观测站”：

- 深蓝黑 3D 空间
- 暖白 2D 教学面板
- 低饱和科学配色
- Q/K/V 使用稳定的专属颜色

颜色不是唯一编码方式，必须同时使用字母、形状、线型和文字。所有关键交互支持键盘；动画遵循 `prefers-reduced-motion`；图形提供可读取的文字说明。

## 11. 性能目标

- 中端笔记本 3D 目标接近 60 FPS。
- 普通手机简化模式至少 30 FPS。
- 预计算案例在 3 秒内进入可交互状态。
- 实时记录 Draw Call、实例数量、像素比和降级等级。
- 检测到持续低帧率时逐级关闭昂贵效果，不直接移除教学内容。

## 12. 测试策略

1. 单元测试：Trace Schema、关键帧、张量切片、采样算法、LOD 预算。
2. 适配器契约测试：Preset 与 ONNX 模拟适配器输出结构一致。
3. 组件测试：键盘、减少动画、错误状态、中文内容。
4. Playwright：引导课程、时间轴、2D/3D 联动、Head 切换、移动端降级。
5. 视觉回归：只覆盖确定性的关键画面。
6. 真实模型：单独的手动集成测试，常规 CI 使用小型 Fixture。

## 13. 部署

应用部署到 GitHub Pages，Vite Base Path 为 `/transformer-layerscape/`。模型独立托管，通过版本清单下载并缓存，不写入 Git 历史。

新增或修改 GitHub Actions 前必须再次取得明确确认。

## 14. 第一里程碑验收条件

- 一个预计算英文案例可以立即加载。
- 用户可以完成 Token → Attention → Output 的引导流程。
- 2D 与 3D 选择、镜头、高亮和时间轴双向同步。
- 支持播放、暂停、单步和拖动关键帧。
- 支持引导学习和自由探索。
- 桌面与移动端布局可用。
- 3D 不可用时，2D 教学仍可完成。
- lint、类型检查、单元测试和构建通过。

## 15. 第一里程碑暂不包含

- 真实 ONNX 模型下载与推理
- 全部课程章节
- 中文生成模型
- 账号、后端、统计和云同步
- 语音、音乐和音效
- 可视化课程编辑器
- GitHub Pages 自动部署工作流
