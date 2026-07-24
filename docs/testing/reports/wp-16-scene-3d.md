# WP-16｜三维模型探索场景验证记录

日期：2026-07-24

工作包：WP-16 三维模型空间

对应需求：FR-3D-001、FR-SYNC-001、NFR-PERF-002

结论：通过，可以进入 WP-17

## 1. 交付范围

本工作包完成：

- 将三维静态占位替换为真实 React Three Fiber / Three.js 场景；
- 使用同一份 `ModelTrace` 生成 Token、Attention Head、Q/K/V 和输出节点；
- 使用稳定实体 ID 连接三维对象与统一 Zustand Store；
- 使用 InstancedMesh 批量绘制 Token，避免为每个 Token 创建独立材质与几何；
- 绘制 Token→Head、Head→Output 和 Q/K/V→Attention 的信息路径；
- 支持 Token、Head、Q/K/V 与输出节点的点击和悬停反馈；
- 实现引导相机、OrbitControls 手动控制与“返回讲解视角”；
- 同步课程步骤、当前实体和相机模式的中文读数；
- 在 Canvas 外提供可使用键盘操作的实体快捷按钮；
- 在无 WebGL 的环境中提供安全预览，课程与二维视图不被阻塞；
- 将三维依赖拆为异步分包，保持首屏 JavaScript 体积稳定；
- 在桌面与 360px 移动视口中验证三维主路径。

WP-17 将继续补齐时间轴拖动和更完整的双向选择编排；WP-18 负责能力分级、Context 丢失恢复和独立错误边界。

## 2. 场景结构

`createSceneLayout` 依据 Trace 生成确定性布局，不读取 DOM，也不依赖 WebGL：

| 实体 | 数量 | 稳定 ID | 三维表达 |
| --- | ---: | --- | --- |
| 输入 Token | 6 | `token:0`～`token:5` | 实例化球体与文本标签 |
| Attention Head | 2 | `head:0`、`head:1` | 环形节点与中心球体 |
| 核心算子 | 5 | `operation:*` | 空间焦点与 Q/K/V 通道 |
| 采样输出 | 1 | `output-token:12` | 八面体输出节点 |

布局同时建立 `byId` 索引，三维焦点不通过显示文本或数组位置反查实体。Token 数量和 Head 数量均来自 Trace；当前教学案例为 6 Tokens、2 Heads、1 Block。

## 3. 统一选择与 2D/3D 联动

三维对象和 Canvas 外快捷按钮只调用 Store 的业务动作：

- `selectToken(index)`；
- `selectHead(index)`；
- `selectEntity(id)`；
- `setCameraMode(mode)`。

选中结果由 `selectedEntityId`、`selectedTokenIndex` 和 `selectedHeadIndex` 统一表达。三维选择 Head 2 后，二维 Attention 矩阵立即显示 Head 2；二维选择也会改变三维节点、连线与当前焦点的高亮。组件测试和真实浏览器 E2E 均验证了该路径，没有建立第二套三维选择状态。

## 4. 相机与交互规则

### 4.1 引导视角

- `getGuidedCameraPose` 根据当前实体焦点计算固定偏移；
- 相机位置与 OrbitControls 的 `target` 同时更新，防止镜头移动后仍朝向旧中心；
- 普通模式使用帧间隔无关的指数插值；
- 帧间隔被限制在 0～0.1 秒，避免后台恢复时镜头跳变；
- `reducedMotion=true` 时插值系数直接为 1，不执行长过渡。

### 4.2 手动视角

- 拖动或缩放 OrbitControls 后，Store 切换为 `manual`；
- 手动模式不再由讲解相机覆盖；
- “返回讲解视角”恢复 `guided`，并重新聚焦当前实体；
- 距离和俯仰角设置安全边界，避免进入模型内部或翻转场景。

真实 Chromium 已验证拖拽进入手动模式、按钮复位和状态读数变化。

## 5. 可访问性与无 WebGL 回退

- Canvas 具有中文可访问名称“可旋转的 Transformer 三维模型空间”；
- 当前步骤、当前焦点和相机状态在 Canvas 外以文本呈现；
- Token、Head 和 Output 均有最小 40px 的外部按钮和明确的中文 `aria-label`；
- 外部按钮与三维对象调用相同 Store 动作，键盘用户无需操作 Canvas；
- 无 WebGL 构造器时显示 SVG 安全预览，并保留全部实体快捷按钮；
- Trace 未就绪或加载失败时显示独立状态，不影响课程与二维面板；
- 关键标签和选择不只依赖颜色，当前实体同时通过读数与按钮按下状态表达。

当前能力检测只负责首层安全分支。WebGL Context 创建失败、Context 丢失和独立错误边界属于 WP-18。

## 6. 响应式与性能策略

- 桌面端三维区域与课程、二维计算同屏；
- 移动端通过“三维空间”标签进入，读数由三列改为单列；
- 实体按钮允许换行，描述和规模信息不会撑宽页面；
- Canvas 设置 `touch-action: none`，触摸旋转不与页面拖动混淆；
- 360×800 主路径无页面级横向溢出；
- Token 使用 InstancedMesh，共享 SphereGeometry 与 Material；
- Object3D、Vector3、布局和相机目标通过 ref / memo 复用；
- 三维模块使用 React `lazy` 独立加载，首屏主包不包含 Three.js。

生产构建结果：

| 产物 | 原始大小 | gzip |
| --- | ---: | ---: |
| 首屏主 JavaScript | 307.65 kB | 99.96 kB |
| 三维异步 JavaScript | 936.19 kB | 250.82 kB |
| 首屏 CSS | 28.32 kB | 6.27 kB |
| 三维异步 CSS | 3.90 kB | 1.16 kB |

三维异步包原始大小超过 Vite 的 500 kB 提示线，但不会进入首屏主包；后续模型扩展前仍需在 WP-18 / WP-19 做加载时延和帧率预算验收。

## 7. 自动化结果

| 验证项 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run test:run` | 12 个文件、108 个用例通过 |
| `npm run test:coverage` | 通过 |
| 全项目语句覆盖率 | 87.63% |
| 全项目分支覆盖率 | 84.04% |
| 全项目函数覆盖率 | 82.05% |
| 全项目行覆盖率 | 89.70% |
| 三维布局与相机纯函数 | 全部分支用例通过 |
| `npm run build` | 通过 |
| 桌面 Chromium E2E | 3 个用例通过 |
| 真实 WebGL Canvas | 通过 |
| 拖拽、手动模式与相机复位 | 通过 |
| 2D/3D Head 共享选择 | 通过 |
| 360px 三维主路径与页面溢出 | 通过 |

R3F 的 GPU 渲染分支无法由 jsdom 真实执行，因此组件覆盖率低于 WP-15；该分支使用真实 Chrome E2E 验证。纯布局、相机算法、安全回退、实体按钮和 Store 联动由 Vitest 覆盖。测试中未出现 Canvas 挂载/卸载或 WebGL 资源泄漏错误。

Playwright 继续使用已记录的本机 Chrome 150 回退路径；本工作包没有修改 CI 或生产浏览器策略。

## 8. 关键测试场景

自动化测试覆盖：

- Trace 到 14 个稳定三维实体的布局映射；
- Token 等距排列和 Head 中心分布；
- 已知、未知和空实体的安全聚焦；
- 引导相机固定偏移；
- 普通相机平滑系数、异常 delta 限制与 reduced-motion 立即聚焦；
- Trace 未就绪安全状态；
- 无 WebGL 的可访问 SVG 回退；
- 当前步骤、实体和模型规模读数；
- Token、Head 和 Output 快捷选择；
- 手动相机模式与返回引导视角；
- AppShell 异步加载三维模块；
- 三维 Head 2 到二维 Head 2 的共享选择；
- 真实 Canvas 可见、拖拽和相机复位；
- 移动端三维切换、Token 选择和页面无横向溢出。

## 9. 已知边界

1. 当前只展示教学 Trace 的单个 Block；多 Block、层级展开和 LOD 属于 M2。
2. 直接点击 Canvas 依赖指针设备；键盘和辅助技术通过 Canvas 外的等价按钮操作。
3. reduced-motion 的相机规则已实现并测试，系统媒体查询自动写入 Store 归入 WP-18。
4. WebGL 能力检测当前检查浏览器构造器，不代表 Context 一定创建成功；错误边界和 Context 恢复归入 WP-18。
5. Three/R3F 在开发控制台发出上游 `THREE.Clock` 弃用提示，不影响功能，需随依赖升级复查。
6. 三维异步包 gzip 为 250.82 kB，后续增加模型前必须继续控制依赖和对象数量。
7. 完整双向联动、时间轴拖动与快速交错一致性在 WP-17 集中验收。

## 10. 放行检查

- [x] R3F Canvas、灯光、环境和 OrbitControls 可用。
- [x] Token 使用实例化几何。
- [x] Token、Head、Q/K/V 和输出与稳定实体 ID 绑定。
- [x] 实体选择写入统一 Store。
- [x] 引导相机与 OrbitControls 目标同步。
- [x] 手动操作切换相机模式并可复位。
- [x] reduced-motion 状态不执行长相机过渡。
- [x] Canvas 外存在中文摘要和键盘等价操作。
- [x] 无 WebGL 时安全回退。
- [x] 三维依赖不进入首屏主包。
- [x] lint、单元、组件、覆盖率、构建和 Chromium E2E 通过。
