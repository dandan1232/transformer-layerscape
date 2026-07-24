# WP-18｜响应式、能力检测与错误恢复验证记录

日期：2026-07-24

工作包：WP-18 响应式、能力检测与错误恢复

对应需求：FR-SHELL-002、FR-SHELL-003、FR-3D-004、FR-LOCAL-001、FR-ERR-001、FR-ERR-003

结论：通过，可以进入 WP-19

## 1. 交付范围

本工作包完成：

- 建立 WebGL1、WebGL2、WebGPU、WASM、设备内存和 reduced-motion 能力检测；
- 通过真实 Canvas Context 探针确认 WebGL 可创建，而不是只检查全局构造器；
- 将设备能力归一为完整三维、简化三维和二维安全模式；
- 低内存设备降低 DPR 并省略高数量 Token→Head 连线；
- 系统 reduced-motion 变化会实时写入统一 Store；
- 为中文课程、二维计算和三维空间建立独立 React Error Boundary；
- 为模型 Trace 加载失败增加独立中文错误提示与重试入口；
- 监听 `webglcontextlost`，保留课程进度和实体选择；
- 支持重新创建 Canvas 或切换到二维安全模式；
- 建立版本化 LocalStorage 快照并恢复进度、模式、视图、速度和实体焦点；
- 自动清理损坏、旧版本或非法的本地快照；
- 隐私模式、Storage 禁用和容量异常不会阻断课程；
- 在真实 Chromium 中覆盖无 WebGL、Context 丢失、reduced-motion、进度恢复和损坏存储。

## 2. 能力检测

### 2.1 检测结果

`detectDeviceCapabilities` 返回：

| 字段 | 含义 |
| --- | --- |
| `webgl` | WebGL1 或 WebGL2 Context 可实际创建 |
| `webgl2` | WebGL2 Context 可实际创建 |
| `webgpu` | 浏览器暴露 `navigator.gpu` |
| `wasm` | 浏览器暴露 WebAssembly |
| `reducedMotion` | 系统偏好减少动态效果 |
| `deviceMemoryGB` | 浏览器提供的粗略设备内存，未知时为 `null` |
| `memoryTier` | `low` / `standard` / `high` / `unknown` |
| `threeDMode` | `full` / `reduced` / `none` |

WebGL Context 探针被 `try/catch` 隔离；构造器存在但 Context 创建失败时仍进入二维安全模式。

### 2.2 三维分级

- 无可用 WebGL：`none`，不挂载 Canvas，显示 SVG 安全预览；
- 设备内存 ≤ 4 GB：`reduced`，DPR 固定为 1，并省略 Token 到全部 Head 的高数量连线；
- 其他可用 WebGL：`full`，DPR 为 1～1.5，展示完整首期场景；
- WebGPU 目前只检测和展示能力，不切换渲染器；
- 未提供 `deviceMemory` 的浏览器按未知等级处理，不擅自判为低性能。

顶栏能力徽标分别显示“完整 3D”“简化 3D”或“2D 安全模式”，并在 `title` 中说明 WebGL2、WebGPU、WASM 和内存等级。

### 2.3 reduced-motion

能力 Hook 同时支持现代 `MediaQueryList.addEventListener` 和旧版 `addListener`。系统偏好变化后重新检测，并调用 Store 的 `setReducedMotion`：

- 引导相机立即完成聚焦，不执行长插值；
- OrbitControls 关闭阻尼；
- CSS 动效规则继续遵循 `prefers-reduced-motion`。

## 3. 独立错误边界

课程、二维和三维分别由 `FeatureErrorBoundary` 包裹：

- 一个子视图抛错不会卸载其他视图或时间轴；
- 回退面板使用中文标题、说明和 `role="alert"`；
- 技术信息默认折叠，只展示错误消息，不泄露用户输入；
- 用户可重试当前视图；
- 三维错误额外提供“切换到二维安全模式”；
- Trace 请求 ID 或状态变化时通过 React `key` 重新建立边界，避免陈旧错误状态；
- `componentDidCatch` 只写浏览器控制台，本项目没有遥测上传。

组件测试验证子视图抛错、技术信息、重试和安全动作。

## 4. 数据加载错误与重试

预置 Trace 加载仍使用 request ID 防止竞态。新增行为：

- 顶栏内显示独立数据错误横幅；
- 展示经过控制的错误消息；
- “重新加载案例”启动新的请求并取消旧请求；
- 课程、二维和三维各自维持安全空状态；
- 加载失败后本地偏好仍可继续保存；
- 重试成功后 Error Boundary 使用新请求 ID 重建。

数据错误不会被伪装为模型输出，也不会触发后端请求。

## 5. WebGL Context 丢失恢复

Canvas 内部的 Guard 直接监听渲染器 DOM Canvas：

1. 收到 `webglcontextlost` 后调用 `preventDefault`；
2. 相机回到引导模式；
3. 卸载失效 Canvas，释放当前 R3F 场景；
4. 显示三维安全预览和中文错误操作；
5. 保留 `currentStepIndex`、实体选择、课程章节和时间轴；
6. “尝试恢复三维”增加场景 revision 并创建新 Canvas；
7. “切换到二维安全模式”只改变当前移动视图，不丢弃进度。

真实 Chromium E2E 连续模拟两次 Context 丢失：第一次重建三维，第二次切换二维；两次均保持第 4 步。

## 6. 版本化本地进度

Storage Key：`transformer-layerscape:explorer:v1`

快照格式：

```json
{
  "version": 1,
  "mode": "guided",
  "view": "lesson",
  "currentStepIndex": 0,
  "playbackRate": 1,
  "selectedEntityId": "operation:tokenize"
}
```

恢复顺序：

1. 应用启动时先读取并校验版本、枚举和数值边界；
2. Trace 未就绪前只恢复模式、视图和播放速度；
3. Trace 校验成功后恢复合法步骤；
4. 再通过 Store 业务动作恢复仍存在的实体；
5. 完成恢复后才开启订阅写入，避免首帧默认值覆盖进度。

容错规则：

- JSON 损坏：清理并使用默认状态；
- 版本不支持：清理并使用默认状态；
- 步骤为负数、枚举非法或字段缺失：清理；
- 实体已不存在：Store 忽略该实体，步骤仍可恢复；
- SecurityError / QuotaExceededError：吞掉 Storage 异常，继续使用内存状态；
- 不保存用户输入文本、Tensor、模型文件、账号或遥测信息。

## 7. 响应式与安全模式

- 桌面端保持课程、二维和三维同屏；
- 移动端保持三个可键盘切换的标签；
- 隐藏面板不进入辅助技术可访问树；
- 无 WebGL 时三维标签仍可进入，展示安全预览和完整实体按钮；
- 360×800 下课程、二维、三维、深入内容和时间轴主路径无页面级横向溢出；
- 错误横幅在移动端可换行，不改变主网格行定义；
- Context 错误操作保持 44px 左右触摸目标。

## 8. 自动化结果

| 验证项 | 结果 |
| --- | --- |
| `npm run lint` | 通过，无警告 |
| `npm run test:run` | 16 个文件、125 个用例通过 |
| `npm run test:coverage` | 通过 |
| 全项目语句覆盖率 | 87.43% |
| 全项目分支覆盖率 | 83.93% |
| 全项目函数覆盖率 | 82.48% |
| 全项目行覆盖率 | 89.50% |
| 能力检测语句覆盖率 | 96.77% |
| 能力检测分支覆盖率 | 96.66% |
| 本地持久化行覆盖率 | 98.00% |
| Error Boundary 行覆盖率 | 100% |
| `npm run build` | 通过 |
| 桌面 Chromium E2E | 6 个用例通过 |
| 正常 WebGL 与双向联动 | 通过 |
| Context 丢失、重建与二维切换 | 通过 |
| 无 WebGL 安全模式 | 通过 |
| reduced-motion 检测 | 通过 |
| 有效进度恢复 | 通过 |
| 损坏 LocalStorage 清理 | 通过 |
| 360px 主路径与页面溢出 | 通过 |

生产构建：首屏 JavaScript 315.04 kB / gzip 102.37 kB；三维异步 JavaScript 937.54 kB / gzip 251.34 kB；首屏 CSS gzip 6.78 kB；三维 CSS gzip 1.31 kB。

## 9. 关键测试场景

自动化测试覆盖：

- WebGL2、WebGL1、WebGPU、WASM 和内存等级；
- Context 探针抛错；
- 完整、简化和无三维模式；
- 现代/旧版 reduced-motion 监听和清理；
- Hook 接收系统偏好变化；
- Error Boundary 捕获、技术信息、重试和安全动作；
- 数据失败横幅与重试回调；
- 快照序列化和两阶段恢复；
- 恢复后持续保存；
- 损坏 JSON、旧版本和非法值清理；
- Storage 读取、清理和写入均抛错；
- 真实 WebGL Context 丢失两次；
- 三维重建后步骤保持；
- 无 WebGL 时不创建 Canvas；
- reduced-motion 浏览器属性；
- 刷新后恢复第 4 步、自由探索、二维视图和 Head 2；
- 损坏 LocalStorage 后回到安全默认状态。

## 10. 已知边界

1. WebGPU 目前仅检测，不作为渲染后端；R3F 场景仍使用 WebGL。
2. `navigator.deviceMemory` 是浏览器提供的粗粒度值，Safari 等浏览器可能不提供。
3. 当前错误记录只写本地控制台，没有远程监控，这是既定隐私边界。
4. LocalStorage 是单浏览器、单域名进度，不提供跨设备同步。
5. 快照 schema 变更时必须增加版本与迁移策略，不能静默复用 v1。
6. 上游 `THREE.Clock` 弃用提示仍存在，不属于 Context 泄漏或本项目错误。
7. 三维异步包仍超过 Vite 500 kB 原始提示线，但保持独立分包；M1 验收继续记录此项。
8. Firefox / WebKit 自动化浏览器未在本机下载，跨浏览器矩阵在 WP-19 明确记录为环境边界。

## 11. 放行检查

- [x] 检测 WebGL1 / WebGL2 / WebGPU / WASM。
- [x] 检测 reduced-motion 和粗略内存等级。
- [x] 完整、简化和二维安全模式可区分。
- [x] 课程、二维、三维具有独立错误边界。
- [x] 数据加载错误可重试。
- [x] Context 丢失时保留进度并提供恢复。
- [x] Context 恢复失败时可切换二维。
- [x] 版本化本地进度可恢复。
- [x] 损坏/禁用 Storage 不阻断应用。
- [x] 360px 核心路径无页面横向溢出。
- [x] lint、单元、组件、覆盖率、构建和 Chromium E2E 通过。
