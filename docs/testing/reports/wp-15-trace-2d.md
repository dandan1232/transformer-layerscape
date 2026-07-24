# WP-15｜二维注意力计算视图验证记录

日期：2026-07-24

工作包：WP-15 二维计算视图

对应需求：FR-2D-001、FR-2D-004、FR-SYNC-001、NFR-A11Y-003

结论：通过，可以进入 WP-16

## 1. 交付范围

本工作包完成：

- 将 WP-11 的静态 SVG 预览替换为读取 `ModelTrace` 的真实二维视图；
- 使用 React 管理 SVG 生命周期，D3 只负责比例尺、Band 布局、最大值和数值格式；
- 将八个 TraceStep 映射为 Token、Q/K/V、Attention、Output 四类局部视图；
- 展示 Token 文本、Token ID 与八维 Embedding 样本；
- 展示 Q、K、V 三组投影的语义、连线与真实张量形状；
- 展示两个 Attention Head 的 6×6 真实权重矩阵；
- 使用交叉图案和“×”表达因果掩码，不只依赖颜色；
- 展示 Top 5 输出候选、真实概率、Logit 与采样结果；
- 展示当前算子的输入 Tensor、输出 Tensor、DType、采样方式和数值样本；
- 为每个步骤提供随 Store 更新的中文文字摘要；
- 支持 Token、Head、算子和输出实体的鼠标与键盘选择；
- 支持二维步骤条直接驱动统一时间线和中文课程。

三维场景的实体同步将在 WP-16 建立，完整双向联动验收归入 WP-17。

## 2. 四类二维表达

### 2.1 Token 与 Embedding

- 按 Trace 的 Token 数量使用 D3 Band Scale 排列；
- 每项显示 Token 文本和真实教学 ID；
- Embedding 步骤展开八维向量样本；
- 正负维度使用不同语义色，并在每个 Bar 的 `<title>` 中提供具体数值；
- 点击或键盘 Enter/Space 更新 `selectedTokenIndex` 和实体 ID。

### 2.2 Q/K/V 投影

- 输入隐藏向量作为共同源节点；
- Q、K、V 使用稳定的查询色、索引色和内容色；
- 三条路径分别说明“找什么、有什么特征、贡献什么”；
- 显示 `[batch, head, token, head_size] = [1, 2, 6, 4]`。

### 2.3 Attention 权重

- 从 `tensor:attention-weights` 按 Head 读取 36 个真实单元；
- 行表示查询 Token，列表示被读取 Token；
- Head 1 与 Head 2 可切换，并写入统一 Head 选择；
- 非掩码单元使用真实权重控制明暗；
- 未来位置同时使用交叉纹理、“×”和文字说明；
- 每个单元的可访问名称说明查询、被读取 Token、权重或掩码状态。

### 2.4 Output 候选

- 使用 D3 Linear Scale 按当前最大概率计算条形长度；
- 展示五个候选的 Token、排名、概率和 Logit；
- 明确标记采样结果，而不是把最高概率直接等同于必然结果；
- 点击普通候选聚焦 Output 算子，点击已采样项聚焦 `output-token:12`。

## 3. 当前算子与 Tensor

二维标题、步骤条、图形和张量检查器全部读取 `currentStepIndex`。每个步骤展示：

- 当前算子英文 ID 与中文标题；
- 主输出或主输入 Tensor 名称和形状；
- 输入与输出 Tensor 卡片；
- Role、DType、Sample Method；
- 最多五个数值样本，超出部分明确显示省略号；
- 无 Tensor 时显示原始文本或最终采样结果。

任何课程导航、时间线播放或二维步骤按钮更新 Store 后，这些区域同时变化，不维护第二套进度。

## 4. 文本替代与键盘

每个 SVG 提供 `<title>` 与 `<desc>`，中文摘要在 SVG 外通过 `aria-live="polite"` 随步骤更新。摘要覆盖：

- Token 数量与 ID；
- Embedding 形状；
- Head 数量和 Head Size；
- 因果掩码含义；
- Attention 权重行和；
- 词表大小、Softmax 与采样结果。

SVG 中可选择的 Token、Q/K/V、矩阵行和候选均具有 `role="button"`、`tabIndex="0"` 和中文可访问名称，支持 Enter 与 Space。颜色不是任何关键信息的唯一载体。

## 5. 响应式策略

- 页面本身在 360px 下不产生横向溢出；
- 复杂 SVG 保持最小教学宽度，在二维图容器内部横向滚动；
- 步骤条使用独立横向滚动，不挤压点击目标；
- Tensor 输入/输出在移动端改为单列；
- Header 的长 Tensor 名称使用省略显示，同时保留完整 `aria-label`；
- 桌面分栏继续保持课程、二维和三维同屏。

内部滚动是受控的局部展开，不会让整张页面左右漂移。

## 6. 自动化结果

| 验证项 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run test:run` | 10 个文件、98 个用例通过 |
| `npm run test:coverage` | 通过 |
| 全项目语句覆盖率 | 95.15% |
| 全项目分支覆盖率 | 90.62% |
| 全项目函数覆盖率 | 95.19% |
| 全项目行覆盖率 | 97.33% |
| Trace2DPanel 行覆盖率 | 93.24% |
| Trace2D Utils 行覆盖率 | 100% |
| `npm run build` | 通过，JS gzip 99.98 kB，CSS gzip 6.27 kB |
| 桌面 Chromium E2E | 2 个用例通过 |
| 360px 主路径与页面溢出 | 通过 |

Playwright 继续使用已记录的本机 Chrome 150 回退路径；本工作包没有修改 CI 或生产浏览器策略。

## 7. 关键测试场景

自动化测试覆盖：

- 八个算子到四类二维视图的映射；
- 当前步骤输入/输出 Tensor 解析与 Shape 格式；
- 两个 Head 的真实矩阵切片和具体权重；
- 因果掩码单元识别；
- 六个 Token 的完整 Embedding 样本；
- 八个步骤的中文文字摘要；
- Trace 未就绪安全状态；
- Token 鼠标/键盘选择；
- Q/K/V 三项输出 Tensor；
- Head 切换和 Attention 单元选择；
- 普通候选与已采样候选的不同选择结果；
- 二维步骤条同步课程和时间线；
- 桌面真实浏览器中的 Q/K/V、Head 1/2、Mask 与 Output 概率；
- 移动端课程跳转到 Q/K/V 后二维视图同步；
- 360px 页面无横向溢出。

## 8. 数据真实性边界

- 所有图形数值来自已经通过 WP-12 校验的教学 Trace；
- Attention 单元没有随机生成或按索引伪造；
- Output Bar 使用 `TraceCandidate.probability`；
- Tensor 卡片明确显示 `sampleMethod`，防止摘要数据冒充完整张量；
- UI 延续“预置案例已就绪”标识，不把教学数据宣传为真实 GPT 模型输出。

## 9. 已知边界

1. Output 首期只展开 Trace 中的 Top 5 候选，不渲染全部 16 项教学词表。
2. 只有最终采样 Token 具有独立输出实体；其他候选选择聚焦 Output 算子。
3. 当前矩阵固定展开当前教学 Block 的所选 Head；多 Block 与更多 Head 属于 M2。
4. SVG 使用文本 `<title>` 提供单值提示，统一浮层 Tooltip 将在交互完善阶段评估。
5. 旧静态预览的少量 CSS 选择器仍留在应用外壳样式中，不影响运行；后续样式拆分时统一移除。
6. 当前三维区域尚未消费二维选择，完整 2D↔3D 联动在 WP-17 验收。

## 10. 放行检查

- [x] Tokenization、Embedding、Attention 和 Output 均有二维表达。
- [x] 当前算子、输入和输出随统一步骤变化。
- [x] 当前 Tensor 名称、形状和样本可见。
- [x] Attention 权重来自 Trace 且 Head 可切换。
- [x] 因果掩码具有颜色以外的符号和纹理。
- [x] 关键图形具备中文文字替代。
- [x] Token、矩阵和候选可使用键盘选择。
- [x] 360px 页面不横向溢出。
- [x] lint、单元、组件、覆盖率、构建和 Chromium E2E 通过。
