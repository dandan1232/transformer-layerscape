# WP-14｜中文引导课程引擎验证记录

日期：2026-07-24

工作包：WP-14 中文课程引擎

对应需求：FR-LESSON-001、FR-LESSON-002、FR-SYNC-002、内容要求

结论：通过，可以进入 WP-15

## 1. 交付范围

本工作包完成：

- 定义版本化的 `Lesson`、`LessonChapter`、`LessonStep`、`LessonAction` 和深入内容类型；
- 编写 Token、Attention、Output 三章、八个课程项的首期中文内容；
- 将八个课程项与八个 `TraceStep` 一一对应；
- 为每项提供通俗解释，以及公式、张量形状或教学伪代码；
- 为公式中的符号逐项提供中文含义；
- 实现课程运行时校验器与结构化错误；
- 实现课程定位、前后项、章节入口与课程动作控制器；
- 将课程面板从静态文案改为结构化内容驱动；
- 课程导航同步更新时间线、步骤、选中实体和引导相机状态；
- 应用启动时同时校验预置 Trace 与课程引用，错误不会写入就绪 Store。

刷新恢复最近课程项属于 WP-18 的版本化本地状态，本工作包不提前写入 LocalStorage。

## 2. 课程结构

| 章节 | 课程项 | 对应 TraceStep |
| --- | --- | --- |
| 输入与 Token | 把句子切成模型的词块 | `step:tokenize` |
| 输入与 Token | 把编号换成可以计算的向量 | `step:embedding` |
| 注意力 | 为信息准备三种角色 | `step:qkv` |
| 注意力 | 不让当前位置偷看未来 | `step:causal-mask` |
| 注意力 | 按相关程度收集上下文 | `step:attention-output` |
| 输出与选择 | 给词表里的每个候选打分 | `step:logits` |
| 输出与选择 | 把候选分数变成概率 | `step:softmax` |
| 输出与选择 | 从概率中选出下一个 Token | `step:sample` |

课程顺序就是 Trace 计算顺序。每个 TraceStep 必须且只能被一个课程项引用，避免课程与可视化出现两套进度。

## 3. 课程动作契约

每个课程项声明：

```ts
interface LessonAction {
  traceStepId: TraceStepId
  selectEntityId?: TraceEntityId
  cameraTargetId?: TraceEntityId
  twoDTargetId?: TraceEntityId
}
```

课程内容不访问 DOM、不控制 Three.js 相机，也不直接操作 SVG。导航控制器负责：

1. 在当前 Trace 中定位 `traceStepId`；
2. 调用 Store 的 `goToStep`；
3. 写入课程指定的选中实体；
4. 把相机模式恢复为 `guided`；
5. 由后续 2D/3D 视图解释当前动作中的目标 ID。

这种方式让课程数据可以独立校验，也为 WP-15～WP-17 的双向联动保留稳定契约。

## 4. 深入内容

每个课程项至少提供以下一种技术信息：

- 张量形状与各维中文解释；
- 公式与逐符号中文解释；
- 明确标为“教学伪代码”的过程描述。

首期内容覆盖 Token ID、Embedding、Q/K/V、因果掩码、缩放点积注意力、Logits、Softmax 和 Sampling。展开 `<details>` 不调用导航 Action，因此不会改变 Trace 步骤。

## 5. 运行时校验

课程校验器拒绝：

- 非对象根节点与未知 Schema Version；
- 空课程、错误语言、空章节和空课程项；
- 重复章节 ID、课程项 ID 或 TraceStep 引用；
- 不存在的 TraceStep、选中实体、2D 目标或 3D 目标；
- 与 Trace 计算顺序不一致的课程项；
- 没有覆盖全部 TraceStep 的课程；
- 缺少标题、通俗解释或 Action 的课程项；
- 没有公式、形状或伪代码的空深入内容；
- 没有中文符号解释的公式；
- 空表达式、空伪代码行或错误字段类型。

失败会抛出 `LessonValidationError`，每个 Issue 包含错误码、字段路径与中文消息，可以直接定位内容文件。

## 6. 界面行为

课程面板现在提供：

- 当前章号、章名和“课程项 n / 8”；
- 当前课程项标题和通俗中文正文；
- 可点击的 Token、Attention、Output 章节入口；
- “上一项”和“下一项”按钮及首尾禁用状态；
- 每项独立的深入内容折叠区；
- 导航后移动到新标题的键盘焦点；
- Trace 未就绪时的安全首项预览和禁用动作。

浏览器验收发现低高度桌面端旧规则会隐藏深入内容，现已改为紧凑显示。课程项切换后标题获得焦点，内部滚动面板会回到当前正文，避免用户停留在旧内容中部。

## 7. 自动化结果

| 验证项 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run test:run` | 8 个文件、88 个用例通过 |
| `npm run test:coverage` | 通过 |
| 全项目语句覆盖率 | 95.42% |
| 全项目分支覆盖率 | 91.73% |
| 全项目函数覆盖率 | 98.08% |
| 全项目行覆盖率 | 97.64% |
| Lesson Validator 行覆盖率 | 99.12% |
| Lesson Validator 分支覆盖率 | 96.36% |
| Lesson Navigation 行覆盖率 | 100% |
| `npm run build` | 通过，JS gzip 78.65 kB，CSS gzip 5.34 kB |
| 桌面 Chromium E2E | 2 个用例通过 |
| 低高度桌面深入内容 | 通过 |
| 360px 长公式与横向溢出 | 通过 |

Playwright 使用本机 Chrome 150 回退路径，原因与 WP-10、WP-13 记录一致；未修改生产运行方式或 CI。

## 8. 关键测试场景

自动化测试覆盖：

- 三章八项课程覆盖完整 Trace；
- 根节点、版本、语言和所有必填字段；
- 章节、课程项和 TraceStep 唯一性；
- TraceStep 与实体引用；
- 课程顺序与 Trace 顺序；
- 公式符号、张量形状和伪代码内容；
- 课程展平、上下文定位和首尾邻接；
- 未知课程项、未加载 Trace 与坏 Trace 引用错误；
- 课程动作驱动步骤、实体与相机模式；
- 前后项导航、章节跳转和时间线同步；
- 展开深入内容不改变步骤；
- Trace 未就绪时禁用课程动作；
- 真实浏览器中的课程导航、章节跳转和公式展开；
- 360px 下公式可读且页面无横向溢出。

## 9. 已知边界

1. 当前课程使用项目内 TypeScript 内容；编辑器、CMS 或外部内容包不在首期范围。
2. 公式当前使用可复制的文本表达式，未引入 LaTeX 渲染依赖；数学语义以中文解释和代码文本共同表达。
3. `cameraTargetId` 与 `twoDTargetId` 已进入课程契约，真实视觉聚焦分别在 WP-15、WP-16 和 WP-17 接入。
4. 课程完成状态和刷新恢复将在 WP-18 与版本化 LocalStorage 一并实现。
5. 当前“自由探索”保留模式状态，但不解除课程步骤约束；完整自由探索属于 WP-25。

## 10. 放行检查

- [x] Token、Attention、Output 三章内容完整。
- [x] 每项包含标题、通俗中文解释和 Trace 目标。
- [x] 课程与 Trace 引用在应用就绪前完成校验。
- [x] 前后导航、章节导航和时间线保持一致。
- [x] 公式附近解释符号含义。
- [x] 教学伪代码没有伪装为可执行生产代码。
- [x] 深入内容展开不改变 Trace 步骤。
- [x] 低高度桌面和 360px 移动端保持可用。
- [x] lint、单元、组件、覆盖率、构建和 Chromium E2E 通过。
