# Transformer LayerScape｜实施路径与交付计划

文档版本：1.0

发布日期：2026-07-24

状态：执行中（M1）

关联文档：

- [产品需求文档](../requirements/product-requirements.md)
- [产品与技术设计](./2026-07-24-transformer-layerscape-design.md)
- [测试与验收方案](../testing/test-and-acceptance.md)

## 1. 计划目标

本计划把产品需求拆成可以独立实现、独立验证、独立提交的工作包。执行时遵循以下规则：

1. 每个工作包只解决一个清晰问题，不混入无关重构。
2. 每个工作包开始前确认依赖已满足，结束时完成规定测试。
3. 测试失败时不推送；先修复或记录为明确阻塞。
4. 每个工作包使用独立 Commit，并在本地验证后立即 Push。
5. Commit 说明使用 Conventional Commits 前缀，正文可使用中文。
6. 删除文件、大规模重构、修改 Git 历史、修改 CI、环境配置或数据库时必须另行确认。
7. 当前计划不自动创建 worktree，不自动修改 CI，不自动创建 PR。

## 2. 技术基线

### 2.1 已确定技术栈

| 领域 | 方案 | 用途 |
| --- | --- | --- |
| 应用框架 | React 19 + TypeScript | 组件、类型与状态驱动界面 |
| 构建工具 | Vite 8 | 本地开发与静态构建 |
| 共享状态 | Zustand 5 | 2D、3D、课程和时间轴统一状态 |
| 三维渲染 | Three.js + React Three Fiber + Drei | 模型空间与相机控制 |
| 二维计算 | React SVG + D3 计算工具 | 节点布局、比例尺、矩阵与连线 |
| 动效 | GSAP + CSS | 镜头过渡、流向和界面状态过渡 |
| 模型运行 | Transformers.js + ONNX Runtime Web | Tokenizer、模型下载和浏览器推理 |
| 单元测试 | Vitest | 领域模型、Store、适配器和工具函数 |
| 组件测试 | Testing Library（实施时补充） | 行为、键盘和可访问性验证 |
| 端到端测试 | Playwright | 桌面、移动和降级主路径 |
| 静态检查 | TypeScript + oxlint | 类型和代码质量 |

### 2.2 浏览器运行分层

```text
Level A：WebGL2 + WebGPU
  └─ 完整 3D + WebGPU 真实模型推理

Level B：WebGL2 + WASM
  └─ 完整或简化 3D + WASM 真实模型推理

Level C：无稳定 WebGL2，但 WASM 可用
  └─ 完整 2D + 可选 WASM 推理

Level D：低内存或关键能力不可用
  └─ 预置 Trace + 2D 安全模式
```

能力检测只决定增强功能，不阻塞预置课程。

## 3. 目标目录结构

```text
transformer-layerscape/
├─ docs/
│  ├─ plans/
│  ├─ requirements/
│  └─ testing/
├─ public/
│  ├─ data/                 # 压缩后的预置 Trace
│  ├─ fonts/                # 如有自托管字体
│  └─ icons/
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ AppShell.tsx
│  │  ├─ ErrorBoundary.tsx
│  │  └─ capability.ts
│  ├─ adapters/
│  │  ├─ preset/
│  │  └─ onnx/
│  ├─ components/
│  │  ├─ controls/
│  │  ├─ feedback/
│  │  └─ layout/
│  ├─ content/
│  │  ├─ lessons/
│  │  └─ glossary/
│  ├─ domain/
│  │  ├─ trace/
│  │  ├─ lesson/
│  │  └─ selection/
│  ├─ features/
│  │  ├─ lesson-panel/
│  │  ├─ trace-2d/
│  │  ├─ scene-3d/
│  │  ├─ timeline/
│  │  ├─ experiments/
│  │  └─ model-loader/
│  ├─ store/
│  ├─ styles/
│  ├─ test/
│  ├─ workers/
│  └─ main.tsx
├─ e2e/
├─ playwright.config.ts
└─ vite.config.ts
```

目录按业务能力组织。通用组件不能依赖具体课程；适配器不能依赖 React；3D 对象引用不能进入需要持久化的 Store。

## 4. 核心架构契约

### 4.1 ModelTrace

`ModelTrace` 是所有展示和课程行为的数据真相。建议第一版接口如下：

```ts
type TraceEntityId = string
type TraceStepId = string

interface TensorSummary {
  id: TraceEntityId
  name: string
  shape: readonly number[]
  values?: readonly number[]
  min?: number
  max?: number
  mean?: number
  sampleMethod?: 'full' | 'head' | 'stride' | 'aggregate'
}

interface TraceStep {
  id: TraceStepId
  phase: 'token' | 'embedding' | 'attention' | 'mlp' | 'output'
  operation: string
  title: string
  description: string
  entityIds: readonly TraceEntityId[]
  inputTensorIds: readonly TraceEntityId[]
  outputTensorIds: readonly TraceEntityId[]
  durationMs: number
}

interface ModelTrace {
  schemaVersion: 1
  source: 'preset' | 'onnx'
  model: {
    id: string
    displayName: string
    layers: number
    heads: number
    hiddenSize: number
    vocabularySize: number
  }
  input: {
    text: string
    tokenIds: readonly number[]
    tokens: readonly string[]
  }
  entities: Readonly<Record<TraceEntityId, TraceEntity>>
  tensors: Readonly<Record<TraceEntityId, TensorSummary>>
  steps: readonly TraceStep[]
  output: {
    logitsTensorId: TraceEntityId
    probabilitiesTensorId: TraceEntityId
    sampledTokenId: number
    sampledToken: string
  }
}
```

正式实现可以补充字段，但必须满足：

- ID 稳定且可序列化；
- 预置与真实适配器使用同一契约；
- 大张量允许摘要，不允许不标记地伪装为完整数据；
- Trace 校验失败时不得写入全局 Store；
- 视图只通过选择器读取所需切片，避免整棵场景频繁重渲染。

### 4.2 共享交互状态

Store 至少包含：

```ts
interface ExplorerState {
  traceStatus: 'idle' | 'loading' | 'ready' | 'error'
  trace: ModelTrace | null
  mode: 'guided' | 'explore'
  viewMode: 'split' | 'lesson' | '2d' | '3d'
  currentStepIndex: number
  playback: 'paused' | 'playing'
  playbackRate: number
  selectedTokenIndex: number | null
  selectedLayerIndex: number | null
  selectedHeadIndex: number | null
  selectedEntityId: TraceEntityId | null
  cameraMode: 'guided' | 'manual'
  reducedMotion: boolean
}
```

状态动作必须表达业务意图，例如 `selectEntity`、`goToStep`、`startPlayback`，而不是让组件直接拼接多项 `setState`。

### 4.3 课程动作

课程内容不直接调用三维相机或查询 DOM，而是声明动作：

```ts
interface LessonAction {
  traceStepId: TraceStepId
  selectEntityId?: TraceEntityId
  cameraTargetId?: TraceEntityId
  twoDTargetId?: TraceEntityId
}
```

视图订阅统一状态并自行解释动作。这样课程能够测试，2D/3D 也能够独立降级。

## 5. 交付节奏总览

| 里程碑 | 目标 | 预计工作包 | 退出条件 |
| --- | --- | --- | --- |
| M0 | 文档与工程基线 | WP-00～WP-03 | 需求、实施、测试文档可追踪 |
| M1 | Token→Attention→Output 垂直切片 | WP-10～WP-19 | 2D/3D/课程/时间轴完整走通 |
| M2 | 完整预置课程 | WP-20～WP-27 | 完整 next-token 主线与参数实验 |
| M3 | 真实模型模式 | WP-30～WP-37 | 可取消下载、本地推理、内部 Trace |
| M4 | 发布完善 | WP-40～WP-45 | 跨浏览器、性能、无障碍与发布验收 |

估时使用理想工程日，仅用于控制工作包大小，不作为日历承诺。遇到模型插桩或浏览器兼容性不确定性时，以验证结果重新估算。

## 6. M0｜文档与工程基线

### WP-00｜仓库脚手架（已完成）

- 产物：React/Vite/TypeScript 工程、MIT、`.gitignore`、本地 Git 身份和远程地址。
- 验证：`npm run lint`、`npm run build`。
- 对应需求：工程前置条件。

### WP-01｜产品与技术设计（已完成）

- 产物：2D/3D、模型、中文内容和交付边界设计。
- Commit：`docs: 确立产品与技术设计基线`。
- 验证：文档完整性与 Git 范围检查。

### WP-02｜产品需求文档（已完成）

- 产物：带编号、优先级和验收条件的 PRD。
- Commit：`docs: 编写中文产品需求文档`。
- 验证：需求标题编号唯一、Markdown 格式检查。

### WP-03｜实施与测试计划

- 产物：本实施路径、测试验收方案和文档入口。
- 对应需求：全部需求的交付与追踪基础。
- 验证：链接有效、工作包编号唯一、测试层级覆盖完整。
- Commit：分别使用 `docs: 制定分阶段实施路径`、`docs: 建立测试与验收规范` 和 `docs: 补充项目文档导航`。

## 7. M1｜首个 2D/3D 联动垂直切片

### WP-10｜测试运行器与质量脚本（已完成）

目标：先建立可重复验证的测试入口。

实施内容：

1. 配置 Vitest 的 `jsdom` 环境、测试初始化和覆盖率范围。
2. 补充 React Testing Library、`user-event`、`jest-dom` 和必要类型。
3. 配置 Playwright 的 Chromium 桌面与移动项目；先不修改 GitHub Actions。
4. 在 `package.json` 增加 `test`、`test:run`、`test:coverage`、`test:e2e`。
5. 建立一个最小冒烟测试，验证环境真实可用。

对应需求：NFR-MAINT-001、M1 测试出口。

验证命令：

```bash
npm run lint
npm run test:run
npm run build
```

完成定义：本地可稳定运行单元测试，Playwright 能发现配置项目。

Commit：`test: 建立前端测试运行基线`

验证记录：[WP-10 前端测试运行基线](../testing/reports/wp-10-test-baseline.md)

### WP-11｜设计 Token 与应用外壳（已完成）

目标：替换 Vite 示例，建立数字天文台风格的响应式工作台。

实施内容：

1. 删除示例界面引用，保留必要入口。
2. 定义颜色、字体、间距、圆角、阴影、层级和动效 Token。
3. 实现顶部控制区、左侧课程/2D、右侧 3D、底部时间轴插槽。
4. 为 360px、768px、1024px 和宽屏建立布局策略。
5. 实现跳到主内容、可见焦点和语义区域标签。

对应需求：FR-SHELL-001、FR-SHELL-002、NFR-A11Y-001、NFR-A11Y-003。

验证：

- 应用外壳组件测试；
- 360px 与 1440px 截图检查；
- 键盘 Tab 顺序检查；
- lint、test、build。

Commit：`feat: 建立中文学习工作台外壳`

验证记录：[WP-11 中文学习工作台外壳](../testing/reports/wp-11-app-shell.md)

### WP-12｜Trace 领域模型与预置适配器（已完成）

目标：建立所有视图共用的数据契约。

实施内容：

1. 定义 `ModelTrace`、实体、张量和步骤类型。
2. 实现稳定 ID 生成和运行时校验。
3. 编写一个最多 6 个 Token 的英文预置案例。
4. 实现 `PresetTraceAdapter` 的加载、校验和错误类型。
5. 为 Token、Attention 权重、Logits 和概率提供受控数据。

对应需求：FR-TRACE-001、FR-TRACE-002、FR-TRACE-003、FR-SYNC-002、NFR-MAINT-001。

验证：

- 合法 Trace 通过；
- 缺字段、坏 ID、越界步骤和未知版本被拒绝；
- 概率和在误差范围内为 1；
- 因果掩码上三角位置符合预期。

Commit：`feat: 定义统一模型轨迹与预置案例`

验证记录：[WP-12 统一模型轨迹与预置案例](../testing/reports/wp-12-model-trace.md)

### WP-13｜共享 Store 与时间状态机（已完成）

目标：用单一状态源驱动所有交互。

实施内容：

1. 建立 Trace、选择、播放、课程和偏好 Slice。
2. 实现 `goToStep`、`nextStep`、`previousStep`、`play`、`pause`、`reset`。
3. 实现步骤边界保护和模式切换。
4. 编写细粒度 Selector，减少 3D 场景不必要重渲染。
5. 把播放计时器封装为可清理的控制器，不把计时器句柄持久化。

对应需求：FR-TIME-001、FR-SYNC-001、NFR-MAINT-002。

验证：

- 首尾步骤不越界；
- 播放结束自动暂停；
- 重置回到章节开头；
- 切换 Trace 时清理旧选择；
- 假计时器下结果确定。

Commit：`feat: 实现统一探索状态与播放控制`

验证记录：[WP-13 统一探索状态与播放控制](../testing/reports/wp-13-shared-store.md)

### WP-14｜中文课程引擎（已完成）

目标：让结构化中文内容能够驱动 Trace。

实施内容：

1. 定义 Lesson、Chapter、Step 与 Action 类型。
2. 编写 Token、Attention、Output 三章首期内容。
3. 实现步骤列表、正文、上一项/下一项和模式切换。
4. 支持“通俗解释”与“深入理解”折叠区。
5. 校验课程引用的 Trace ID 全部存在。

对应需求：FR-LESSON-001、FR-LESSON-002、FR-SYNC-002、内容要求。

验证：

- 章节顺序与 Trace 对齐；
- 键盘可完成前后导航；
- 深入内容展开不改变步骤；
- 无效 Action 在开发期抛出可定位错误。

Commit：`feat: 接入中文引导课程引擎`

验证记录：[WP-14 中文引导课程引擎](../testing/reports/wp-14-chinese-lesson-engine.md)

### WP-15｜二维计算视图（已完成）

目标：实现可读的 Token→Attention→Output 二维数据流。

实施内容：

1. 使用 SVG 表达 Token 序列、Q/K/V、注意力矩阵和输出概率。
2. 使用 D3 计算比例尺和布局，不让 D3 接管 React DOM 生命周期。
3. 高亮当前步骤、选中 Token 和实体。
4. 显示张量名称、形状、数值提示和因果掩码。
5. 提供与图形等价的文字摘要。

对应需求：FR-2D-001、FR-2D-004、FR-SYNC-001、NFR-A11Y-003。

验证：

- SVG 可访问名称存在；
- 掩码单元有颜色之外的图案或符号；
- 不同 Token 数量布局不溢出；
- 当前 Step 变化产生正确高亮。

Commit：`feat: 实现二维注意力计算视图`

验证记录：[WP-15 二维注意力计算视图](../testing/reports/wp-15-trace-2d.md)

### WP-16｜三维模型空间（已完成）

目标：建立可控制、可聚焦且与 Trace 绑定的三维结构。

实施内容：

1. 建立 R3F Canvas、灯光、环境和相机控制。
2. 使用实例化几何展示 Token、Attention Head 和输出节点。
3. 按稳定实体 ID 映射选中、悬停和课程焦点。
4. 实现引导相机、手动控制和返回讲解视角。
5. Canvas 外提供场景摘要和安全占位。

对应需求：FR-3D-001、FR-SYNC-001、NFR-PERF-002。

验证：

- 场景挂载/卸载无资源泄漏警告；
- 实体点击更新统一选择；
- 相机手动操作切换到 manual；
- 减少动态效果时相机不执行长过渡。

Commit：`feat: 构建三维模型探索场景`

验证记录：[WP-16 三维模型探索场景](../testing/reports/wp-16-scene-3d.md)

### WP-17｜双向联动与统一时间轴界面（已完成）

目标：把课程、2D、3D 与播放状态连成一个产品体验。

实施内容：

1. 实现时间轴按钮、当前位置、进度和拖动控件。
2. 2D 点击更新 3D 焦点与课程说明。
3. 3D 点击更新 2D 高亮与课程说明。
4. 播放时统一推进步骤，暂停后允许自由选择。
5. 避免选择回写造成循环更新。

对应需求：FR-TIME-001、FR-TIME-002、FR-SYNC-001、FR-3D-002。

验证：

- 2D→Store→3D 与 3D→Store→2D 集成测试；
- 播放、拖动、点击快速交错时状态最终一致；
- 时间轴使用键盘箭头可操作。

Commit：`feat: 打通二维三维与时间轴联动`

验证记录：[WP-17 二维、三维与统一时间轴联动](../testing/reports/wp-17-unified-interaction.md)

### WP-18｜响应式、能力检测与错误恢复（已完成）

目标：让核心学习链路在不同设备和失败场景中保持可用。

实施内容：

1. 实现桌面分栏和移动标签切换。
2. 检测 WebGL2、WebGPU、WASM、减少动态效果和粗略内存等级。
3. 为课程、2D、3D 和数据加载增加独立错误边界。
4. 实现 WebGL Context 丢失提示与二维回退。
5. 保存版本化的本地进度和偏好。

对应需求：FR-SHELL-002、FR-SHELL-003、FR-3D-004、FR-LOCAL-001、FR-ERR-001、FR-ERR-003。

验证：

- 移动端主路径；
- 模拟无 WebGL 环境；
- 模拟损坏 LocalStorage；
- 模拟子视图抛错；
- reduced-motion 媒体查询。

Commit：`feat: 完善响应式布局与安全降级`

验证记录：[WP-18 响应式、能力检测与错误恢复](../testing/reports/wp-18-resilience.md)

### WP-19｜M1 验收与文档

目标：以真实浏览器验证首个垂直切片。

实施内容：

1. 补齐端到端桌面与移动主路径。
2. 添加关键视图视觉基线。
3. 记录性能测量环境和结果。
4. 更新 README 的运行、测试和功能说明。
5. 生成 M1 验收记录，逐项关联需求 ID。

对应需求：M1 全部需求。

验证：

```bash
npm run lint
npm run test:run
npm run test:coverage
npm run build
npm run test:e2e
```

完成定义：所有 P0/M1 用例通过，无阻断级缺陷，工作树干净，远端包含验收提交。

Commit：`test: 完成首个联动版本验收`

## 8. M2｜完整预置课程

### WP-20｜Embedding 与位置编码

- 增加 Token/Position Embedding 二维与三维表达。
- 补充形状、相加过程和中文课程。
- Commit：`feat: 补充嵌入与位置编码课程`

### WP-21｜LayerNorm 与 Q/K/V 投影

- 展示归一化直觉、投影形状和三个语义通道。
- Q/K/V 使用稳定颜色和文字标识。
- Commit：`feat: 补充归一化与投影课程`

### WP-22｜多头注意力与因果掩码

- 支持 Head 切换、局部矩阵展开和跨 Head 对比。
- 验证掩码、Softmax 维度和拼接形状。
- Commit：`feat: 扩展多头注意力探索`

### WP-23｜Residual 与 MLP

- 展示残差支路、LayerNorm 顺序和 MLP 维度变化。
- Commit：`feat: 补充残差与前馈网络课程`

### WP-24｜Logits、Softmax 与采样

- 展示候选 Token、概率、Temperature、Top-k 和 Top-p。
- 相同 Seed 和参数产生可复现的教学结果。
- Commit：`feat: 实现输出概率与采样实验`

### WP-25｜自由探索模式

- 允许不受课程步骤限制地选择 Token、Block、Head 和算子。
- 保留“回到课程当前位置”入口。
- Commit：`feat: 增加自由探索工作模式`

### WP-26｜完整移动端体验

- 完整二维课程、简化三维、触摸目标和方向变化恢复。
- Commit：`feat: 完成移动端学习体验`

### WP-27｜M2 验收

- 完整 next-token prediction 端到端路径。
- 无障碍、视觉、性能和跨浏览器回归。
- Commit：`test: 完成预置课程版本验收`

## 9. M3｜真实模型模式

真实模型是独立风险阶段，先验证技术可行性，再接入界面。任何一步失败都不能影响预置课程。

### WP-30｜模型资源与许可证验证

- 固定模型仓库、具体 Revision、文件清单、哈希和许可证。
- 实测下载体积，禁止依赖会漂移的 `main` 资源地址。
- 记录第三方 Notices。
- Commit：`docs: 固定真实模型资源与许可证`

### WP-31｜插桩 ONNX 技术探针

- 验证浏览器能否输出指定层的 Q/K/V、Attention 或必要摘要。
- 比较普通模型、额外输出模型与分步重算方案。
- 只保留能满足教学正确性和约 100MB 目标的方案。
- Commit：`spike: 验证模型中间状态输出`

### WP-32｜Worker 推理协议

- 定义主线程与 Worker 的加载、进度、推理、取消和错误消息。
- 使用 Transferable 降低大数组复制成本。
- Commit：`feat: 建立浏览器模型 Worker 协议`

### WP-33｜模型下载与缓存

- 主动确认、进度、取消、版本化缓存和失败恢复。
- 下载与初始化不锁死界面。
- Commit：`feat: 实现真实模型下载与缓存`

### WP-34｜OnnxTraceAdapter

- 将模型输出和中间状态转换为统一 `ModelTrace`。
- 使用与预置适配器相同的契约测试。
- Commit：`feat: 接入真实模型轨迹适配器`

### WP-35｜参数实验与输入保护

- 限制最多 12 Token，校验采样参数，支持确定性 Seed。
- Commit：`feat: 开放真实模型参数实验`

### WP-36｜性能与内存治理

- 分块处理张量摘要，及时释放 Session 和 GPU 资源。
- 建立长任务、峰值内存和取消响应测试。
- Commit：`perf: 优化浏览器推理资源占用`

### WP-37｜M3 验收

- WebGPU/WASM、缓存命中/未命中、取消、离线、低内存和错误恢复矩阵。
- Commit：`test: 完成真实模型模式验收`

## 10. M4｜发布完善

### WP-40｜完整无障碍审计

- 键盘、屏幕阅读器、对比度、缩放、减少动态效果。
- Commit：`fix: 完成发布前无障碍整改`

### WP-41｜跨浏览器与设备验证

- Chrome、Edge、Firefox、Safari 当前及前一主要版本。
- 桌面、平板和主流手机视口。
- Commit：`test: 完成跨浏览器兼容验收`

### WP-42｜性能预算验收

- 首次可交互、JS 体积、模型体积、帧率和内存。
- 未达到目标的例外必须记录原因和用户影响。
- Commit：`perf: 完成发布性能预算治理`

### WP-43｜内容与术语校对

- 中文术语一致性、公式与形状一致性、示例数值一致性。
- Commit：`docs: 完成中文课程内容校对`

### WP-44｜GitHub Pages 发布准备

- 配置 Vite Base、静态资源路径、404 策略和缓存策略。
- 修改 CI/Actions 前按项目规范单独征得确认。
- Commit：`build: 配置 GitHub Pages 静态发布`

### WP-45｜发布验收

- 生产构建、线上冒烟、回滚说明、许可证和版本记录。
- Commit：`chore: 完成首个公开版本交付`

## 11. 每个工作包的执行模板

### 11.1 开始前

```bash
git status -sb
git pull --ff-only origin main
```

检查：

- 工作树是否存在用户未提交改动；
- 当前工作包依赖是否已完成；
- 是否涉及必须另行确认的操作；
- 需求编号和验收条件是否明确。

### 11.2 实施中

1. 先添加能描述行为的失败测试，或记录无法测试的原因。
2. 实现最小闭环。
3. 运行针对性测试。
4. 进行可访问性和响应式人工检查。
5. 不顺手重构无关代码。

### 11.3 提交前

```bash
git status --short
git diff --check
git diff --stat
npm run lint
npm run test:run
npm run build
```

涉及端到端交互时追加：

```bash
npm run test:e2e
```

### 11.4 提交与推送

只暂存当前工作包文件，避免使用无法审查范围的提交：

```bash
git add -- <明确文件列表>
git diff --cached --check
git diff --cached
git commit -m "<type>: <中文交付点>"
git push origin main
git status -sb
```

推送后确认本地 `main` 与 `origin/main` 一致，并记录 Commit SHA 与验证命令。

### 11.5 Commit 类型

| 类型 | 使用场景 |
| --- | --- |
| `feat` | 新增用户可见能力 |
| `fix` | 修复缺陷 |
| `test` | 测试或验收，不改变产品行为 |
| `docs` | 需求、设计、说明或课程文案 |
| `refactor` | 不改变行为的代码调整 |
| `perf` | 性能优化 |
| `build` | 构建、依赖或发布配置 |
| `chore` | 维护性工作 |
| `spike` | 明确可丢弃或转正的技术验证 |

## 12. 质量门槛

### 12.1 工作包门槛

- 新增行为有自动化测试或可复现的人工验证记录。
- TypeScript、lint 和相关测试通过。
- 没有新增 `console.error`、未处理 Promise 或 React Key 警告。
- 交互能够使用键盘完成，颜色不是唯一信息载体。
- 错误状态、加载状态和空状态已处理。
- 文档和实现引用正确的需求 ID。

### 12.2 里程碑门槛

- 该里程碑所有 P0/P1 范围需求都有用例。
- Playwright 主路径通过。
- 桌面与移动视觉检查通过。
- 性能和内存结果有记录。
- 无 P0/P1 未解决缺陷。
- README、运行命令和验收记录与实际一致。

## 13. 风险、探针与决策点

| 风险 | 影响 | 最早验证工作包 | 处理策略 |
| --- | --- | --- | --- |
| 3D 与 React 更新造成掉帧 | 核心体验卡顿 | WP-16 | Selector、实例化、对象复用、性能采样 |
| 大 Trace 占用内存 | 移动端崩溃 | WP-12 | 摘要、TypedArray、按需加载 |
| 课程 ID 与 Trace 漂移 | 教学指向错误 | WP-14 | 构建期/测试期交叉校验 |
| ONNX 不输出中间张量 | 真实模式不可解释 | WP-31 | 插桩导出或可验证重算，不伪造 |
| WebGPU 支持差异 | 真实推理失败 | WP-31/WP-37 | WASM 回退与能力提示 |
| 模型超过体积目标 | 首次等待过长 | WP-30 | 固定量化资源、拆分或重新选型 |
| WebGL Context 丢失 | 3D 空白 | WP-18 | 独立边界、恢复、2D 回退 |
| 动效引起眩晕 | 可访问性失败 | WP-11/WP-18 | reduced-motion 与即时定位 |
| GitHub Pages 路径问题 | 线上资源 404 | WP-44 | Base path 与生产构建冒烟 |

以下决策需要在对应工作包给出书面结论：

1. WP-12：Trace 完整数值与摘要的边界。
2. WP-16：首期三维实体数量和 LOD 阈值。
3. WP-18：设备能力分级判定规则。
4. WP-30：真实模型仓库、Revision、许可证和体积。
5. WP-31：内部状态输出技术路径。
6. WP-44：GitHub Pages 自动发布方式；涉及 CI 时必须先确认。

## 14. 完成定义

项目达到第一阶段“实现可用”，必须同时满足：

1. 用户可以使用中文课程完成完整 next-token prediction 学习链。
2. 2D、3D、课程和时间轴使用同一 `ModelTrace` 和选择状态。
3. 预置案例无需模型下载即可使用。
4. 真实模型由用户主动下载，在浏览器内运行，并输出可信的教学 Trace。
5. 桌面端同屏联动，移动端完整 2D 与简化 3D 可用。
6. 键盘、减少动态效果、颜色替代和错误恢复通过验收。
7. 自动化测试、生产构建、跨浏览器与性能验证通过。
8. 每个工作包均存在独立 Commit，且已推送到远端。
9. 第三方依赖和模型许可证信息完整。
10. 文档、代码、测试和线上行为保持一致。
