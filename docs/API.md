# API 接口文档

## 数据消息格式

### 1. WebSocket 二进制消息格式

WebSocket模拟器发送的二进制数据格式：

```
[Header(4 bytes)] + [Points Data]
```

#### Header结构
- **Bytes 0-3**: 点数量 (Uint32, Little Endian)

#### 点数据结构（每个点12字节）
- **Bytes 0-3**: X坐标 (Float32, Little Endian)
- **Bytes 4-7**: Y坐标 (Float32, Little Endian)  
- **Byte 8**: R颜色值 (Uint8, 0-255)
- **Byte 9**: G颜色值 (Uint8, 0-255)
- **Byte 10**: B颜色值 (Uint8, 0-255)
- **Byte 11**: A透明度 (Uint8, 0-255)

示例解析代码：
```javascript
function parseMessage(buffer) {
  const view = new DataView(buffer)
  const pointCount = view.getUint32(0, true)
  
  const points = []
  let offset = 4
  
  for (let i = 0; i < pointCount; i++) {
    points.push({
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      color: {
        r: view.getUint8(offset + 8) / 255,
        g: view.getUint8(offset + 9) / 255,
        b: view.getUint8(offset + 10) / 255,
        a: view.getUint8(offset + 11) / 255
      }
    })
    offset += 12
  }
  
  return points
}
```

### 2. JSON 消息格式（调试模式）

当启用调试模式时，也支持JSON格式：

```json
{
  "type": "points",
  "timestamp": 1699123456789,
  "data": [
    {
      "id": "point_001",
      "x": 100.5,
      "y": 200.3,
      "pathId": "path_1",
      "color": {
        "r": 1.0,
        "g": 0.5,
        "b": 0.0,
        "a": 0.8
      },
      "metadata": {
        "speed": 10.5,
        "direction": 1.57
      }
    }
  ]
}
```

## Worker 通信协议

### 主线程 → Worker

#### 1. 配置消息
```javascript
{
  type: 'config',
  lodThreshold: 2.0,        // LOD像素阈值
  viewBounds: {             // 视图边界
    left: 0,
    right: 1920,
    top: 0,
    bottom: 1080
  },
  enableLOD: true,          // 启用LOD
  enableCulling: true,      // 启用裁剪
  enableQuantization: true  // 启用量化
}
```

#### 2. 处理消息
```javascript
{
  type: 'process',
  points: Float32Array,     // 点数据
  transform: {              // 视图变换
    scale: 1.0,
    translateX: 0,
    translateY: 0
  }
}
// 使用Transferable传输
postMessage(msg, [points.buffer])
```

#### 3. 清空消息
```javascript
{
  type: 'clear'
}
```

### Worker → 主线程

#### 处理完成消息
```javascript
{
  type: 'processed',
  data: ArrayBuffer,        // 处理后的点数据
  stats: {
    processTime: 5.23,      // 处理耗时(ms)
    inputPoints: 1000,      // 输入点数
    outputPoints: 850,      // 输出点数
    totalPoints: 50000,     // 总点数
    reductionRatio: 0.15    // 削减比例
  }
}
```

## WebGL 渲染器接口

### 初始化
```javascript
const renderer = new WebGLRenderer(canvas)
renderer.init()
```

### 更新点数据
```javascript
// data: ArrayBuffer - 处理后的点数据
renderer.updatePoints(data)
```

### 更新视图变换
```javascript
renderer.updateTransform({
  scale: 2.0,
  x: 100,
  y: 50
})
```

### 渲染
```javascript
// 在requestAnimationFrame循环中调用
renderer.render()
```

### 清空
```javascript
renderer.clear()
```

### 销毁
```javascript
renderer.destroy()
```

## Konva UI层接口

### 初始化
```javascript
const konvaLayer = new KonvaLayer(container, size)
```

### 注册变换回调
```javascript
konvaLayer.onTransformChange((transform) => {
  // transform: { x, y, scale }
  webglRenderer.updateTransform(transform)
})
```

### 添加标记点
```javascript
konvaLayer.addMarker(x, y, color)
```

### 调整大小
```javascript
konvaLayer.resize(width, height)
```

## 性能监控接口

### PerformanceMonitor

```javascript
import { PerformanceMonitor } from './utils/PerformanceMonitor'

const monitor = new PerformanceMonitor()

// 记录指标
monitor.record('fps', 60)
monitor.record('renderTime', 5.2)
monitor.record('pointCount', 10000)

// 获取统计
monitor.getAverage('fps')  // 平均FPS
monitor.getMax('renderTime')  // 最大渲染时间
monitor.getMin('fps')  // 最小FPS

// 获取报告
const report = monitor.getReport()

// 检测问题
const issues = monitor.detectIssues()

// 导出数据
const csv = monitor.exportCSV()
```

### PerformanceBenchmark

```javascript
import { PerformanceBenchmark } from './utils/PerformanceMonitor'

const benchmark = new PerformanceBenchmark()

// 添加测试
benchmark.addTest('渲染测试', async () => {
  // 测试代码
}, 100)  // 100次迭代

// 运行测试
const results = await benchmark.runAll()

// 生成报告
const report = benchmark.generateReport()
```

## 压力测试接口

```javascript
import { stressTest } from './test/stressTest'

// 运行压力测试
const result = await stressTest.runStressTest('heavy', (update) => {
  console.log(`进度: ${update.progress * 100}%`)
})

// 生成报告
const report = stressTest.generateReport(result)

// 导出结果
const exportData = stressTest.exportResults()
```

### 测试配置文件

支持的测试配置：
- `light`: 轻量级测试（10k点）
- `medium`: 中等强度（50k点）
- `heavy`: 高强度（100k点）
- `extreme`: 极限测试（200k点）

## 数据流程图

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  WebSocket  │────▶│  Web Worker  │────▶│   WebGL     │
│  Simulator  │     │  Processor   │     │  Renderer   │
└─────────────┘     └──────────────┘     └─────────────┘
      │                    │                     │
      │                    │                     │
      ▼                    ▼                     ▼
  Raw Points          Processed           GPU Buffer
  (Binary)            ArrayBuffer         Rendering
```

## 错误处理

### WebGL错误
```javascript
try {
  renderer.init()
} catch (error) {
  if (error.message.includes('WebGL2 not supported')) {
    // 处理WebGL2不支持
  }
}
```

### Worker错误
```javascript
worker.onerror = (error) => {
  console.error('Worker error:', error)
  // 降级处理
}
```

### 内存溢出保护
```javascript
if (pointCount > MAX_POINTS) {
  // 触发环形缓冲区覆盖
  // 或清理旧数据
}
```

## 配置选项

### 全局配置
```javascript
const config = {
  // 渲染配置
  maxPoints: 200000,       // 最大点数
  pointSize: 4.0,          // 点大小
  lineWidth: 2.0,          // 线宽
  renderMode: 'points',    // 渲染模式
  
  // 性能配置
  lodThreshold: 2.0,       // LOD阈值
  enableLOD: true,         // 启用LOD
  enableCulling: true,     // 启用裁剪
  enableQuantization: true,// 启用量化
  
  // WebSocket配置
  wsInterval: 50,          // 发送间隔
  pointsPerMessage: 100,   // 每批点数
  
  // Worker配置
  workerCount: 1,          // Worker数量
  batchSize: 1000         // 批处理大小
}
```

## 浏览器兼容性

- Chrome 94+ (推荐)
- Firefox 91+
- Safari 15+ (WebGL2限制)
- Edge 94+

### 必需的Web API
- WebGL2
- Web Workers
- ArrayBuffer / TypedArray
- requestAnimationFrame
- Performance API

## 性能优化建议

1. **降低更新频率**: 低端设备调整到100-200ms
2. **减少点密度**: 每批控制在50点以下
3. **启用硬件加速**: 确保GPU加速开启
4. **使用Chrome**: 获得最佳WebGL性能
5. **调整LOD阈值**: 根据设备性能调整
6. **限制最大点数**: 移动设备建议50k以下
