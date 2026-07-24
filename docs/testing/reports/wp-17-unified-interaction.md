# WP-17｜二维、三维与统一时间轴联动验证记录

日期：2026-07-24

工作包：WP-17 双向联动与统一时间轴界面

对应需求：FR-TIME-001、FR-TIME-002、FR-SYNC-001、FR-3D-002

结论：通过，可以进入 WP-18

## 1. 交付范围

本工作包完成：

- 将底部进度展示升级为可拖动、可点击、可键盘操作的原生 Range 时间轴；
- 保留播放、暂停、上一步、下一步和重置控制；
- 使用同一 `currentStepIndex` 同步课程、二维标题、二维图形、三维读数和时间轴；
- 时间轴重置改为返回当前课程章节的第一步，而不是总是回到全局第一步；
- 二维选择 Token / Head / Output 后同步三维高亮与课程焦点说明；
- 三维选择 Token / Head / Output 后同步二维高亮与课程焦点说明；
- 在课程正文中增加“当前联动焦点”，展示统一实体的名称与中文解释；
- 播放期间的显式实体选择会立即暂停，避免旧计时器覆盖用户意图；
- 增加播放、拖动、选择快速交错的一致性测试；
- 在真实 Chromium 中验证时间轴键盘、章节重置和 2D↔3D 双向路径。

## 2. 单一数据流

四个界面不直接互相调用，也不查询对方 DOM：

```text
课程 / 二维 / 三维 / 时间轴
          ↓ 业务动作
      Explorer Store
          ↓ Selector
课程 / 二维 / 三维 / 时间轴
```

统一状态字段包括：

- `currentStepIndex`：唯一计算步骤；
- `selectedEntityId`：唯一主实体焦点；
- `selectedTokenIndex`：Token 维度选择；
- `selectedLayerIndex`：Layer 维度选择；
- `selectedHeadIndex`：Attention Head 维度选择；
- `playback`：播放或暂停；
- `cameraMode`：引导或手动相机。

视图只发出 `goToStep`、`selectToken`、`selectHead`、`selectEntity` 等动作。Store 完成边界检查和原子更新，视图通过 Zustand Selector 重新读取结果，因此不存在组件间回写循环。

## 3. 时间轴交互

### 3.1 播放控制

- 上一步和下一步在合法边界内移动，并自动暂停；
- 播放只可从非末尾步骤开始；
- 播放控制器根据当前步骤 `durationMs` 和 `playbackRate` 安排下一次推进；
- 到达末尾后自动切换为暂停；
- 重置清除播放状态并恢复引导相机。

### 3.2 拖动与键盘定位

时间轴使用原生 `<input type="range">`，取值为 `1..TraceStep 总数`：

- `change` 事件转换为从 0 开始的 Store 步骤索引；
- ArrowRight / ArrowUp 前进一步；
- ArrowLeft / ArrowDown 后退一步；
- Home 跳到首步；
- End 跳到末步；
- 每次定位都调用 `goToStep`，因此会暂停播放并选中该步骤的默认实体；
- `aria-valuetext` 同时说明当前位置、总步骤数和中文步骤标题；
- 可见进度从首步 0% 映射到末步 100%，Marker 与滑块共享同一索引公式；
- 透明的大尺寸原生控制层覆盖细轨道，保留至少 43px 的指针/触摸命中高度。

### 3.3 章节内重置

时间轴根据当前 TraceStep 查找课程章节，再把章节第一项的 `traceStepId` 映射回 Trace 索引：

- Token 章节重置到第 1 步；
- Attention 章节重置到第 3 步；
- Output 章节重置到第 6 步。

如果课程或 Trace 映射不可用，则安全回退到第 1 步。已位于章节起点且没有播放时，重置按钮禁用。

## 4. 双向选择

### 4.1 二维到三维

- 点击 Token 卡片或 Attention 单元更新 `selectedTokenIndex` 与 `selectedEntityId`；
- 三维 Token InstancedMesh 与外部 Token 按钮读取同一索引并高亮；
- 引导相机读取同一实体 ID 作为焦点；
- 课程“当前联动焦点”展示 Token 名称与序列位置说明。

真实浏览器用例验证：在 Head 2 矩阵中点击“blue 读取 and：权重 0.42”后，查询行 Token `blue`、三维 T6 和课程焦点同时更新。

### 4.2 三维到二维

- 点击三维 Head 或外部 Head 按钮更新 `selectedHeadIndex` 与 `head:*` 实体；
- 二维 Attention Head 切换器与矩阵立即显示相同 Head；
- 课程焦点显示相同 Head；
- Token 和最终输出使用相同路径，不维护三维局部副本。

真实浏览器用例验证：三维选择 Head 2 后，二维矩阵的可访问名称更新为“Attention Head 2 权重矩阵”。

### 4.3 移动端语义

移动端一次只暴露当前标签面板，但共享状态不会随标签切换丢失。用户可以在二维选择，再切到三维或课程查看同一个实体；隐藏面板不会被错误暴露给辅助技术。

## 5. 播放与选择竞态

显式选择动作现在会把 `playback` 原子设置为 `paused`：

- `selectEntity`；
- `selectToken`；
- `selectLayer`；
- `selectHead`。

播放控制器订阅到暂停后会清除待执行计时器。即使旧的推进回调已经进入队列，`advancePlayback` 也会再次检查 `playback === 'playing'`，因此不会覆盖最后一次用户选择。单元测试覆盖“播放→选择 Head 2→旧推进回调”顺序，最终保持在用户选择的步骤和实体。

## 6. 课程焦点说明

课程面板新增 `aria-live="polite"` 的联动焦点区域：

- 显示实体 `label`；
- 优先显示 Trace 中的中文 `description`；
- 无描述时提供明确的同步状态说明；
- 长名称使用省略显示，但完整文本仍保留在 DOM；
- 不改变课程章节和当前步骤，只解释用户正在观察的实体。

该区域使 FR-3D-002 的“更新课程解释”成为可见、可测试的产品行为，而不是仅改变图形颜色。

## 7. 自动化结果

| 验证项 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run test:run` | 12 个文件、112 个用例通过 |
| `npm run test:coverage` | 通过 |
| 全项目语句覆盖率 | 87.86% |
| 全项目分支覆盖率 | 84.31% |
| 全项目函数覆盖率 | 82.97% |
| 全项目行覆盖率 | 90.00% |
| AppShell 行覆盖率 | 95.55% |
| Explorer Store 行覆盖率 | 92.50% |
| `npm run build` | 通过 |
| 桌面 Chromium E2E | 3 个用例通过 |
| 时间轴 Home / End | 通过 |
| Attention 章节重置 | 通过，回到第 3 步 |
| 2D→3D Token 联动 | 通过 |
| 3D→2D Head 联动 | 通过 |
| 课程焦点同步 | 通过 |
| 360px 主路径与页面溢出 | 通过 |

生产构建主 JavaScript 为 308.61 kB / gzip 100.24 kB；三维异步 JavaScript 为 936.19 kB / gzip 250.83 kB。联动与时间轴只让主包 gzip 增加约 0.28 kB。

## 8. 关键测试场景

自动化测试覆盖：

- 自定义章节起点的播放重置；
- 播放中实体选择立即暂停；
- 暂停后旧推进回调不再改变步骤；
- 滑块 ArrowRight 定位；
- 滑块 change 定位并暂停；
- 滑块中文 `aria-valuetext`；
- Attention 章节重置到 Q/K/V；
- 章节起点重置按钮禁用；
- 二维 Token→Store→三维 Token 高亮；
- 三维 Head→Store→二维 Head 矩阵；
- 两条方向都更新课程焦点说明；
- 真实 Chrome 中 Home / End 跳转；
- 真实 Chrome 中章节内重置；
- 真实 Chrome 中 2D / 3D 双向选择；
- 移动端标签切换后共享状态保持。

## 9. 已知边界

1. 时间轴以离散 TraceStep 为单位，不在两个步骤之间插值张量。
2. 拖动只读取最终合法 Range 值，不为每个像素重复执行昂贵模型计算。
3. 播放速度状态已存在，三档速度 UI 属于 P2 的 FR-TIME-003，不在 WP-17 范围。
4. 移动端隐藏面板不会被辅助技术访问；用户需切换标签查看同步结果。
5. 当前课程焦点解释来自教学 Trace，不生成额外模型解释文本。
6. R3F 上游仍有 `THREE.Clock` 弃用提示，功能与联动不受影响。
7. 能力检测、错误边界、Context 丢失和本地偏好持久化在 WP-18 实现。

## 10. 放行检查

- [x] 播放、暂停、上一步、下一步和章节内重置可用。
- [x] 时间轴支持拖动/点击定位。
- [x] 时间轴支持方向键、Home 和 End。
- [x] 课程、2D、3D 和时间轴使用同一计算步骤。
- [x] 2D 选择同步 3D 与课程解释。
- [x] 3D 选择同步 2D 与课程解释。
- [x] 播放期间显式选择会暂停。
- [x] 旧播放回调不会覆盖用户最后选择。
- [x] 不使用 DOM 查询或组件临时事件维持同步。
- [x] lint、单元、组件、覆盖率、构建和 Chromium E2E 通过。
