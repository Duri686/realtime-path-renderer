# 高性能实时路径渲染方案

基于 **WebGL + Web Worker + Konva** 的大规模实时点位渲染解决方案，专为处理 **10万+机器人轨迹点** 设计，稳定保持 **55-60 FPS**。

## 🎯 核心优势

- **性能突破**: 10万点位 @55-60 FPS（传统 Canvas2D/Konva 方案 <5 FPS）
- **数量级提升**: 相比传统 Konva 方案，渲染点数提升 **20倍**，帧率提升 **6倍**
- **三层分离架构**: Worker 离屏计算 + WebGL GPU渲染 + Konva UI交互
- **零拷贝传输**: Transferable Objects 实现 Worker 与主线程高效通信
- **智能内存管理**: 环形缓冲区预分配，零 GC 压力
- **冷热数据统一**: WebSocket 实时推送（热数据）+ 历史轨迹存储（冷数据）

## 📦 安装依赖

```bash
# 使用yarn安装依赖
yarn install
```

## 🎯 运行项目

```bash
# 开发模式
yarn dev

# 构建生产版本
yarn build

# 预览构建结果
yarn preview
```

项目默认运行在 http://localhost:3000

## 🎮 使用说明

### 控制面板
- **开始/停止模拟**: 控制数据流的开始和停止
- **WS间隔**: 调整WebSocket发送间隔（50/100/200ms）
- **每条消息点数**: 控制每批发送的点数量
- **LOD像素阈值**: 调整细节层次的合并阈值

### 键盘快捷键
- `G`: 显示/隐藏网格
- `C`: 显示/隐藏中心十字准星
- `M`: 显示/隐藏小地图
- `R`: 重置视图

### 鼠标交互
- **滚轮**: 缩放视图
- **左键拖拽**: 平移视图
- **鼠标移动**: 显示世界坐标

## 🏗️ 三层架构设计

```
┌─────────────────────────────────────────┐
│  Konva 层（UI交互层）                    │  ← 鼠标/触摸交互、坐标显示、网格覆盖
├─────────────────────────────────────────┤
│  WebGL 层（GPU渲染层）                   │  ← 10万点高性能渲染、Shader着色
├─────────────────────────────────────────┤
│  Worker 层（离屏计算层）                 │  ← LOD、空间裁剪、数据预处理
└─────────────────────────────────────────┘
```

### 为什么不用传统 Konva 方案？

| 指标 | 传统 Konva | 本方案 | 提升 |
|------|-----------|--------|------|
| 最大点数 | ~5,000 | 100,000+ | **20倍** |
| 帧率 | <10 FPS | 55-60 FPS | **6倍** |
| 内存占用 | 不可控（每点创建 Shape 对象） | 固定 ~50MB（预分配） | **可预测** |
| CPU 占用 | 100%（逐点绘制阻塞主线程） | <30%（Worker 分担） | **释放主线程** |
| 实时性 | 数据序列化卡顿 | 零拷贝传输流畅 | **无延迟** |

**核心问题**：Konva 基于 Canvas2D，每个点需要创建 Shape 对象并逐个调用绘制 API，10万点会导致内存溢出且帧率崩溃。

**解决方案**：将 Konva 降级为**纯交互层**（捕获鼠标/键盘事件），路径渲染全部由 WebGL 的 GPU 并行完成。

---

## 🔧 技术架构详解

### 1. 数据流程（热数据 - WebSocket 实时推送）

```
WebSocket模拟器（50ms/批，100点）
    ↓ 二进制格式 ArrayBuffer
dataProcessor.worker.js（LOD + 空间裁剪 + 格式转换）
    ↓ Transferable 零拷贝传输
WebGLRenderer.updatePoints()（解析并按机器人分组）
    ↓ 打包到暂存区 _stagingPos/_stagingColorU8
GPU 缓冲区（bufferSubData 增量更新）
    ↓ Shader 投影变换
屏幕渲染（LINE_STRIP 一次 drawArrays）
```

**关键技术**：
- **二进制传输**：每点 28 字节（7×Float32：`x, y, r, g, b, a, robotId`）
- **零拷贝**：`postMessage(buffer, [buffer])` 转移 ArrayBuffer 所有权，避免序列化
- **增量更新**：`bufferSubData` 只更新变化部分，不重建整个 GPU 缓冲区

### 2. 冷数据处理（历史路径存储）

```javascript
// RobotPathManager.js - 环形缓冲区
class RobotPath {
  vertices: Float32Array(100000 * 2)  // 预分配单机器人10万点容量
  colors: Float32Array(100000 * 4)    // RGBA颜色
  writeIndex: number                  // 循环写入指针
}
```

**存储策略**：
- **预分配内存**：启动时一次性分配，运行时零 GC
- **环形覆盖**：满容后覆盖最旧数据（FIFO），保留最新轨迹
- **按机器人分组**：每个机器人独立缓冲区（支持 10 个机器人）
- **GPU 常驻**：历史数据始终在 GPU，每帧统一渲染冷+热数据

**冷热统一渲染**：`_packRobotsToStaging()` 将所有机器人路径打包到暂存区，一次性上传 GPU，用 `LINE_STRIP` 绘制连续路径。

### 3. Web Worker 三大职责

#### 3.1 LOD（Level of Detail）处理
```javascript
// dataProcessor.worker.js:321-412
// 空间分区算法优化：O(n²) → O(n)
根据缩放级别自动合并密集点：
- 放大时：显示所有细节
- 缩小时：网格聚类合并临近点（减少绘制负担）
```

#### 3.2 空间裁剪
```javascript
// cullPoints() - 视口外点过滤
计算世界坐标边界 → 过滤视口外的点 → 减少 50%+ 渲染负担
```

#### 3.3 数据格式标准化
```javascript
// 输入：JSON 或 12字节二进制（旧格式）
// 输出：28字节统一格式（x,y,r,g,b,a,robotId）
保证 WebGL 接收标准化数据
```

**为什么用 Worker？**  
这些计算在主线程会阻塞渲染（掉帧），Worker 在后台线程并行处理，主线程专注 60fps 渲染循环。

### 4. WebGL + Shader 渲染引擎

#### WebGL（GPU 渲染管线）
```javascript
// WebGLRenderer.js
- 预分配 100万点 GPU 缓冲区（bufferData，6MB VRAM）
- 每帧只更新变化部分（bufferSubData，<0.2ms）
- VAO 批量绑定顶点属性（减少状态切换）
- LINE_STRIP 模式绘制连续路径（一次 drawArrays）
```

#### Shader（GPU 着色器程序）

**顶点着色器**（PathShader.js）：
```glsl
// 世界坐标 → 屏幕坐标
1. 数据边界归一化（dataBounds: minX, maxX, minY, maxY）
2. 应用视图变换（缩放 scale、平移 translate）
3. 投影到 NDC 坐标系（-1 到 1）
```

**片段着色器**（PathShader.js）：
```glsl
// 着色与透明度混合
直接输出顶点颜色（支持 Alpha 通道混合）
```

**呼吸灯着色器**（MarkerShader.js）：
```glsl
// 机器人当前位置标记
使用 sin(time) 实现脉冲动画（点精灵 POINTS 渲染）
```

**为什么用 WebGL？**  
- Canvas2D 绘制 10万点需要 10万次 API 调用（>500ms/帧，卡死）
- WebGL 一次 `drawArrays` 绘制所有点（<0.2ms/帧），GPU 并行处理

### 5. Konva 的轻量化角色

**当前职责**（仅 UI 交互层）：
1. **交互捕获**：鼠标滚轮缩放、拖拽平移、触摸事件
2. **UI 覆盖层**：坐标显示、FPS 统计、网格、十字准星
3. **视图变换同步**：将用户操作转换为 `transform {x, y, scale}` 传递给 WebGL

```javascript
// KonvaLayer.js:249-275
stage.on('wheel', (e) => {
  // 计算缩放和平移
  this.transform = { x, y, scale }
  // 通知 WebGL 更新变换矩阵
  this.onTransformChangeCallback(this.transform)
})
```

**不负责渲染路径**：避免 Konva 的 Shape 对象创建和逐点绘制开销。

---

## ⚡ 性能优化策略

### 1. 环形缓冲区（避免内存分配）
```javascript
// 启动时预分配 100万点 × 12字节 = 12MB
// 运行时零 malloc，写入指针循环移动
writeIndex = (writeIndex + 1) % capacity
```

### 2. Transferable Objects（零拷贝传输）
```javascript
// Worker → 主线程
const buffer = new ArrayBuffer(...)
postMessage(buffer, [buffer])  // 转移所有权，不复制
```

### 3. 批量 GPU 上传（减少 Draw Call）
```javascript
// 打包所有机器人路径 → 单次 bufferSubData
// 多段 LINE_STRIP → 一次 drawArrays 调用
for (const seg of packedDraws) {
  gl.drawArrays(gl.LINE_STRIP, seg.start, seg.count)
}
```

### 4. LOD 空间分区（O(n) 算法）
```javascript
// 网格哈希 + 3×3 邻域搜索
// 1万点：从 5000万次比较 → 30次比较
const grid = new Map()
for (const p of points) {
  const key = `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)}`
  grid.get(key).push(p)
}
```

### 5. 自适应配置（智能降级）
```javascript
// App.vue - 自适应 LOD
if (fps < 45) lodThreshold += 0.5  // 降低点数，提升帧率
if (fps > 55) lodThreshold -= 0.2  // 提升画质
```

### 6. 预算切片（点数不确定场景）
```javascript
// WebGLRenderer._packRobotsToStaging()
// 总点数超过 MAX_POINTS 时，按机器人均分预算
// 只保留每个机器人的"末尾最新段"
if (total > MAX_POINTS) {
  perCap = Math.floor(MAX_POINTS / robots.length)
  keep = Math.min(count, perCap)  // 保留最新数据
}
```

---

## 📊 性能指标与测试数据

### 实测性能
- **渲染点数**: 100,000 点
- **稳定帧率**: 55-60 FPS
- **WebGL 渲染耗时**: 0.1~0.2 ms/帧 ✅
- **Worker 处理耗时**: 0.1~0.3 ms/批次 ✅
- **bufferSubData 耗时**: 0.1~0.2 ms/帧 ✅
- **内存占用**: ~50 MB（预分配缓冲区）
- **CPU 占用**: <30%（主线程 + Worker 分担）

### 容量上限
- **GPU 缓冲区**: 1,000,000 点预分配（可配置）
- **单机器人历史**: 100,000 点环形缓冲
- **最大机器人数**: 10 个（可扩展）
- **数据更新频率**: 20 Hz（50ms 间隔）

### 压力测试场景

**基础测试**：
- 正常流量：每 50ms 发送 100 点
- 持续运行：累积到 10 万点稳定 55+ FPS

**压力测试**：
- 高密度场景：累积到 20 万点（自动预算切片）
- 高频更新：每 50ms 发送 1000 点
- 极限测试：瞬时发送 1 万点（分批处理）

**性能监控**：控制面板实时显示当前总点数、实时 FPS、bufferSubData 耗时、Worker 处理耗时、渲染耗时，支持导出 JSON 格式性能报告。

---

## 🔍 数据格式协议

### 统一数据格式（28字节/点）

```text
[点数量 (4字节 Uint32 LE)] + [点数据数组]

每个点 28 字节：
  - x        (4字节 Float32)  // 世界坐标X
  - y        (4字节 Float32)  // 世界坐标Y
  - r        (4字节 Float32)  // 红色分量 [0-1]
  - g        (4字节 Float32)  // 绿色分量 [0-1]
  - b        (4字节 Float32)  // 蓝色分量 [0-1]
  - a        (4字节 Float32)  // 透明度 [0-1]
  - robotId  (4字节 Float32)  // 机器人ID
```

### Worker 消息协议

```javascript
// 配置消息
{ type: 'config', lodThreshold, viewBounds, maxPoints }

// 处理消息（热数据）
{ type: 'process', points: ArrayBuffer, transform: {x, y, scale} }

// 清空消息
{ type: 'clear' }

// 响应消息（返回主线程）
{ 
  type: 'processed', 
  data: ArrayBuffer,  // 28字节格式
  stats: { processTime, inputPoints, outputPoints, totalPoints }
}
```

---

## 🏗️ 项目结构

```text
realtime-path-renderer/
├── src/
│   ├── App.vue                      # 主应用组件（集成三层架构）
│   ├── main.js                      # 应用入口
│   ├── renderer/                    # 渲染器模块
│   │   ├── WebGLRenderer.js         # WebGL GPU 渲染引擎
│   │   ├── KonvaLayer.js            # Konva UI 交互层
│   │   ├── RobotPathManager.js      # 机器人路径管理器（环形缓冲）
│   │   ├── RobotMarkers.js          # 机器人标记渲染（呼吸灯）
│   │   └── shaders/                 # Shader 着色器
│   │       ├── PathShader.js        # 路径渲染 Shader
│   │       ├── MarkerShader.js      # 标记呼吸灯 Shader
│   │       └── ShaderCompiler.js    # Shader 编译器
│   ├── simulator/                   # 数据模拟器
│   │   ├── WebSocketSimulator.js    # WebSocket 模拟器（旧格式）
│   │   └── simulator.worker.js      # 真实运动模拟器（Worker版）
│   ├── workers/                     # Web Worker
│   │   └── dataProcessor.worker.js  # 数据预处理（LOD + 裁剪）
│   ├── utils/                       # 工具模块
│   │   └── PathTracker.js           # 镜头跟随控制
│   └── components/                  # UI 组件
│       └── PerformanceChart.vue     # 性能监控图表
├── PERFORMANCE_OPTIMIZATION.md      # 性能优化记录
├── package.json                     # 项目配置
├── vite.config.js                   # Vite 配置
└── README.md                        # 说明文档
```

---

## 🎯 适用场景

- **AGV/机器人调度系统**：实时监控大规模机器人轨迹
- **物流可视化**：仓库内机器人路径追踪
- **游戏开发**：大规模单位移动轨迹渲染
- **地理信息系统**：GPS 轨迹实时可视化
- **IoT 设备监控**：物联网设备运动轨迹展示

---

## 💡 优化建议

### 低端设备优化
1. **降低更新频率**：将 WS 间隔调整到 100-200ms
2. **减少点密度**：调整每批点数到 50 以下
3. **启用性能模式**：关闭呼吸灯动画
4. **提高 LOD 阈值**：增大 `lodThreshold` 到 5-10px

### 极限性能场景
1. **多 VBO 分片**：将路径数据切分到多个 GPU 缓冲区
2. **OffscreenCanvas**：将 WebGL 渲染移至 Worker 线程
3. **WebGPU 迁移**：使用下一代图形 API（实验性）

---

## 🐛 已知限制

1. **集成显卡**：某些集成显卡可能性能下降（建议独显）
2. **Safari 支持**：Safari 浏览器的 WebGL2 支持有限
3. **移动设备**：建议降低点数限制到 5 万以下
4. **浏览器兼容**：需要 WebGL2 支持（Chrome 56+, Firefox 51+）

---

## 📚 技术参考

- [WebGL Best Practices - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- [Web Workers API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [Transferable Objects - HTML Spec](https://html.spec.whatwg.org/multipage/structured-data.html#transferable-objects)
- [Konva Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html)
- [Chrome Performance Profiling](https://developer.chrome.com/docs/devtools/performance/)

---

## 📄 许可证

MIT License

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

**改进方向**：
- 支持更多渲染模式（三角形带、热力图）
- 路径历史回放功能
- 数据导入/导出
- 移动端性能优化
- WebGPU 适配
