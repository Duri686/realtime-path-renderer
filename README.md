# 高性能实时路径渲染 Demo

基于 Vue3 + Vite + Konva + WebGL 的高性能实时路径渲染解决方案

## 🚀 特性

- **双层Canvas架构**: 上层Konva负责UI交互，下层WebGL负责高性能路径渲染
- **Web Worker数据处理**: 异步数据预处理，包括投影、LOD、空间裁剪、量化
- **环形缓冲区**: 预分配200k点容量，使用bufferSubData增量更新
- **实时数据模拟**: WebSocket模拟器每50ms发送数据批次
- **性能优化**: LOD自适应、空间裁剪、像素对齐等多种优化策略
- **交互功能**: 支持zoom/pan、网格显示、坐标追踪等

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

## 🏗️ 项目结构

```
realtime-path-renderer/
├── src/
│   ├── App.vue                 # 主应用组件
│   ├── main.js                 # 应用入口
│   ├── renderer/               # 渲染器模块
│   │   ├── WebGLRenderer.js    # WebGL渲染器
│   │   └── KonvaLayer.js       # Konva UI层
│   ├── simulator/              # 模拟器模块
│   │   └── WebSocketSimulator.js # WebSocket数据模拟器
│   └── workers/                # Web Worker
│       └── dataProcessor.worker.js # 数据处理Worker
├── package.json                # 项目配置
├── vite.config.js             # Vite配置
└── README.md                  # 说明文档
```

## 🔧 技术架构

### 数据流程
```
WebSocket模拟器 → 原始数据 → Web Worker预处理 → ArrayBuffer传输 → WebGL渲染
```

### 性能优化策略

1. **环形缓冲区**: 避免频繁的内存分配
2. **增量更新**: 使用bufferSubData只更新变化部分
3. **LOD处理**: 远距离自动合并临近点
4. **空间裁剪**: 只渲染可见区域内的点
5. **数据量化**: 降低坐标精度以减少数据量
6. **像素对齐**: 高缩放级别下避免抖动
7. **Transferable Objects**: Worker使用零拷贝传输

## 📊 性能指标

- **最大点容量**: 200,000点
- **目标帧率**: 60 FPS
- **数据更新频率**: 20Hz (50ms间隔)
- **单批处理**: 100-1000点
- **内存占用**: ~50MB (预分配缓冲区)

## 🧪 测试场景

### 基础测试
- 正常流量: 每50ms发送100点
- 持续运行测试: 累积到10万点

### 压力测试
- 高密度场景: 累积到20万点
- 高频更新: 每50ms发送1000点
- 极限测试: 瞬时发送1万点

## 📈 性能监控

控制面板实时显示：
- 当前总点数
- 实时FPS
- bufferSubData耗时
- Worker处理耗时
- 渲染耗时

导出性能数据功能可生成JSON格式的性能报告。

## 🔍 数据格式

### WebSocket消息格式（二进制）
```
[点数量(4字节)] + [点数据数组]
每个点: [x(4字节)][y(4字节)][r(1字节)][g(1字节)][b(1字节)][a(1字节)]
```

### Worker消息协议
```javascript
// 配置消息
{ type: 'config', lodThreshold, viewBounds }

// 处理消息
{ type: 'process', points, transform }

// 清空消息
{ type: 'clear' }
```

## 🎯 优化建议

1. **降低更新频率**: 在低端设备上可将间隔调整到100-200ms
2. **减少点密度**: 调整每批点数到50以下
3. **启用硬件加速**: 确保浏览器开启GPU加速
4. **使用Chrome**: 推荐使用最新版Chrome获得最佳性能

## 🐛 已知问题

1. 在某些集成显卡上可能性能下降
2. Safari浏览器的WebGL2支持可能有限
3. 移动设备上建议降低点数限制

## 📝 开发计划

- [ ] 支持多种渲染模式（线条、三角形带）
- [ ] 添加热力图渲染模式
- [ ] 支持路径历史回放
- [ ] 添加数据导入/导出功能
- [ ] 优化移动端性能
- [ ] 添加更多可视化效果

## 📄 许可

MIT License
