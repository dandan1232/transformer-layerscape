# WP-12｜统一模型轨迹与预置案例验证记录

日期：2026-07-24

工作包：WP-12 Trace 领域模型与预置适配器

对应需求：FR-TRACE-001、FR-TRACE-002、FR-TRACE-003、FR-SYNC-002、NFR-MAINT-001

结论：通过，可以进入 WP-13

## 1. 交付范围

本工作包完成：

- `ModelTrace`、`TraceStep`、`TraceEntity`、`TensorSummary` 和候选 Token 类型；
- 稳定的实体、Tensor 和步骤 ID 规则；
- Schema Version 1；
- 运行时 Trace 校验器与结构化错误码；
- Token、Embedding、Q/K/V、Mask、Attention、Logits、Probability 和 Sampling 数据；
- 一个 6 Token、1 Block、2 Heads 的教学小模型 Trace；
- `PresetTraceAdapter` 加载、深拷贝、校验和取消；
- 合法轨迹、错误数据和适配器契约测试。

本工作包不把 Trace 接入全局 Store 或界面；接入属于 WP-13。

## 2. Trace 数据概览

| 项目 | 数值 |
| --- | --- |
| Schema | 1 |
| 来源 | `preset` |
| 教学模型 | LayerScape Micro Transformer |
| 输入 | `The sky is deep and blue` |
| Token 数量 | 6 |
| Block | 1 |
| Attention Heads | 2 |
| Hidden Size | 8 |
| Head Size | 4 |
| 教学词表 | 16 |
| Trace 步骤 | 8 |
| 输出 Token | `.` |

八个步骤依次为：

1. Tokenization；
2. Token Embedding；
3. Q/K/V Projection；
4. Causal Mask；
5. Attention Weighted Sum；
6. Logits；
7. Softmax；
8. Sampling。

## 3. 运行时校验规则

### 3.1 根节点与版本

- 根节点必须是对象；
- 只接受 Schema Version 1；
- 来源只能是 `preset` 或 `onnx`；
- Metadata 必须提供 ID、标题、说明和 `zh-CN`。

### 3.2 模型与输入

- Layer、Head、Hidden Size 和词表必须是正整数；
- Hidden Size 必须能被 Head 数量整除；
- Token ID 必须是非负整数；
- Token ID 与 Token 文本数量一致；
- 输入限制为 1～12 Token。

### 3.3 实体与引用

- 实体 ID 使用稳定的 `namespace:value` 格式；
- 对象键与实体自身 ID 必须一致；
- 父实体必须存在；
- Token、Layer 和 Head 索引不能越界；
- 步骤引用的实体和 Tensor 必须存在；
- 步骤 ID 不得重复。

### 3.4 Tensor 与 Shape

- Tensor Role、DType 和 Sample Method 必须来自允许集合；
- Shape 必须是正整数数组；
- `sampleMethod: full` 时，数值数量必须等于 Shape 乘积；
- Token Tensor 必须为 `[1, token]` 且数值与输入 ID 相同；
- Embedding 必须为 `[1, token, hidden]`；
- Q/K/V 必须为 `[1, head, token, headSize]`；
- Attention Weight 必须为 `[1, head, token, token]`；
- Logits 与 Probability 最后一维必须等于词表。

### 3.5 Attention 与输出

- 因果 Mask 只能读取当前位置和过去位置；
- Attention 上三角权重必须为 0；
- 每一行 Attention 权重必须在 0～1 且和为 1；
- 输出概率必须在 0～1 且总和为 1；
- 候选概率必须与 Probability Tensor 一致；
- 采样 ID 必须在词表和候选中；
- 采样 Token 文本必须与对应候选一致。

## 4. 错误模型

校验失败抛出 `TraceValidationError`，包含一个或多个结构化 Issue：

| 错误码 | 含义 |
| --- | --- |
| `INVALID_ROOT` | 根节点类型错误 |
| `UNSUPPORTED_VERSION` | Schema 不受支持 |
| `INVALID_FIELD` | 必填字段或枚举错误 |
| `INVALID_ID` | ID 格式或键值不一致 |
| `DUPLICATE_ID` | 步骤或候选 ID 重复 |
| `INVALID_REFERENCE` | 实体、Tensor 或输出引用不存在 |
| `INVALID_SHAPE` | Shape 或数值长度错误 |
| `INVALID_VALUE` | 索引、数字或文本值非法 |
| `INVALID_PROBABILITY` | 概率范围、行和或总和错误 |
| `INVALID_CAUSAL_MASK` | 因果 Mask 或未来位置权重错误 |

Issue 同时携带 Path 和中文说明，后续错误边界可以转换为用户可行动提示。

## 5. 自动化结果

| 验证项 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run test:run` | 4 个文件、50 个用例通过 |
| `npm run test:coverage` | 通过 |
| Trace 领域语句覆盖率 | 99% |
| Trace 领域分支覆盖率 | 96.44% |
| Trace 领域函数覆盖率 | 100% |
| Trace 领域行覆盖率 | 98.97% |
| Preset Adapter 语句覆盖率 | 90% |
| Preset Adapter 行覆盖率 | 100% |
| `npm run build` | 通过 |

## 6. 关键测试场景

自动化测试覆盖：

- 合法预置 Trace；
- 非对象根节点与未知版本；
- Metadata、Model 和 Input 类型/范围；
- Token 数量、ID 和 Shape；
- 实体 ID、父引用与索引上界；
- Tensor ID、Role、DType、Shape、Values 和 Sample Method；
- 空步骤、非对象步骤、重复步骤和坏引用；
- Embedding、Q/K/V、Mask、Attention 和词表 Shape；
- 因果 Mask 方向；
- Attention 未来权重、概率范围和行和；
- 输出概率范围与总和；
- Candidate ID、文本、Logit 和概率；
- 采样 ID 与文本一致性；
- Adapter 每次返回隔离副本；
- Adapter 拒绝无效数据并响应 AbortSignal。

## 7. 数据真实性边界

本 Trace 明确属于教学小模型：

- Token ID、词表和向量不声称来自 GPT-2 或其他真实模型；
- Q/K/V 和隐藏向量使用固定、确定性的教学数值；
- Attention 权重、Mask、Probability 和候选结果满足契约数学约束；
- UI 必须显示“预置案例”或“教学模式”，不能把它标成真实模型输出；
- 真实模型中间状态将在 WP-30～WP-37 通过固定 Revision 与插桩 ONNX 验证。

这种边界保证第一条课程路径立即可用，同时不把虚构数据伪装为真实推理。

## 8. 已知边界

1. Trace 当前以 TypeScript Fixture 随应用打包；更大数据的 JSON 压缩和按需加载在数据规模增长后处理。
2. 校验器是项目内严格实现，没有新增 Schema 第三方依赖；Schema 变更必须同步更新类型、校验和测试。
3. 适配器只验证加载前后的取消；真实网络下载过程中的连续取消属于模型加载工作包。
4. Trace 尚未进入 Zustand Store，UI 仍显示 WP-11 静态预览。
5. 真实模型适配器必须复用同一 `ModelTrace` 与契约测试，不得建立第二套展示格式。

## 9. 放行检查

- [x] 合法 Trace 通过运行时校验。
- [x] 未知版本不会被静默解释。
- [x] 引用、Shape、Mask、概率和采样结果可验证。
- [x] 预置适配器与源对象隔离。
- [x] Adapter 支持 AbortSignal。
- [x] 领域覆盖率超过计划门槛。
- [x] lint、测试、覆盖率和构建通过。
- [x] 教学数据与真实模型边界明确。
