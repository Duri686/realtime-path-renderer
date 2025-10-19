/**
 * Web Worker - 数据预处理器
 * 负责：坐标投影、LOD处理、空间裁剪、数据量化
 */

// 配置参数
let config = {
  lodThreshold: 2.0,      // LOD像素阈值
  viewBounds: null,       // 视图边界
  maxPoints: 200000,      // 最大点数
  enableLOD: true,        // 是否启用LOD
  enableCulling: true,    // 是否启用空间裁剪
  enableQuantization: true // 是否启用量化
}

// 数据缓存
let pointCache = []
let processedCache = new Map()
let totalPoints = 0

/**
 * 处理主线程消息
 */
self.onmessage = function(e) {
  const { type, points, transform, ...params } = e.data
  
  switch(type) {
    case 'config':
      updateConfig(params)
      break
      
    case 'process':
      processPoints(points, transform)
      break
      
    case 'clear':
      clearCache()
      break
      
    default:
      console.warn('Unknown message type:', type)
  }
}

/**
 * 更新配置
 */
function updateConfig(newConfig) {
  config = { ...config, ...newConfig }
  console.debug('Worker config updated:', config)
}

/**
 * 处理点数据
 */
function processPoints(rawPoints, transform) {
  const startTime = performance.now()
  
  // 解析原始数据
  const points = parseRawPoints(rawPoints)
  
  if (!points || points.length === 0) {
    return
  }
  
  // 添加到缓存
  pointCache.push(...points)
  totalPoints = pointCache.length
  
  // 限制总点数
  if (pointCache.length > config.maxPoints) {
    pointCache = pointCache.slice(-config.maxPoints)
  }
  
  // 处理管道
  let processedPoints = points
  
  // 1. 坐标投影（示例：简单的线性变换）
  processedPoints = projectPoints(processedPoints, transform)
  
  // 2. 空间裁剪
  if (config.enableCulling && config.viewBounds) {
    processedPoints = cullPoints(processedPoints, config.viewBounds, transform)
  }
  
  // 3. LOD处理（始终根据配置开启）
  if (config.enableLOD) {
    const scale = transform && transform.scale ? transform.scale : 1
    processedPoints = applyLOD(processedPoints, scale)
  }
  
  // 4. 数据量化（减少精度以节省带宽）
  if (config.enableQuantization) {
    processedPoints = quantizePoints(processedPoints)
  }
  
  // 5. 像素对齐（减少渲染抖动）
  processedPoints = pixelAlign(processedPoints, transform)
  
  // 转换为ArrayBuffer传输
  const buffer = pointsToArrayBuffer(processedPoints)
  
  const processTime = performance.now() - startTime
  
  // 发送处理后的数据（使用Transferable）
  self.postMessage({
    type: 'processed',
    data: buffer,
    stats: {
      processTime: processTime.toFixed(2),
      inputPoints: points.length,
      outputPoints: processedPoints.length,
      totalPoints: totalPoints,
      reductionRatio: (1 - processedPoints.length / points.length).toFixed(2)
    }
  }, [buffer])

  // 阈值告警：当 Worker 处理单批耗时过高时输出性能告警
  if (processTime >= 16) {
    console.warn('[PERF_DEGRADE] WORKER_SLOW_16', {
      processTime: Number(processTime.toFixed(2)),
      inputPoints: points.length,
      outputPoints: processedPoints.length,
      totalPoints,
      reductionRatio: Number((1 - processedPoints.length / Math.max(1, points.length)).toFixed(2)),
      config: {
        lodThreshold: config.lodThreshold,
        enableLOD: config.enableLOD,
        enableCulling: config.enableCulling,
        maxPoints: config.maxPoints,
      }
    })
  } else if (processTime >= 8) {
    console.warn('[PERF_DEGRADE] WORKER_SLOW_8', {
      processTime: Number(processTime.toFixed(2)),
      inputPoints: points.length,
      outputPoints: processedPoints.length,
      totalPoints,
      reductionRatio: Number((1 - processedPoints.length / Math.max(1, points.length)).toFixed(2)),
      config: {
        lodThreshold: config.lodThreshold,
        enableLOD: config.enableLOD,
        enableCulling: config.enableCulling,
        maxPoints: config.maxPoints,
      }
    })
  }
}

/**
 * 解析原始点数据
 */
function parseRawPoints(rawData) {
  if (!rawData) return []
  
  const points = []
  
  // 如果是Float32Array（二进制格式）
  if (rawData instanceof Float32Array) {
    const buffer = rawData.buffer
    const view = new DataView(buffer)
    const pointCount = view.getUint32(0, true)
    const payloadBytes = buffer.byteLength - 4

    if (payloadBytes === pointCount * 28) {
      let offset = 4
      for (let i = 0; i < pointCount; i++) {
        const x = view.getFloat32(offset, true)
        const y = view.getFloat32(offset + 4, true)
        const r = view.getFloat32(offset + 8, true)
        const g = view.getFloat32(offset + 12, true)
        const b = view.getFloat32(offset + 16, true)
        const a = view.getFloat32(offset + 20, true)
        const robotId = view.getFloat32(offset + 24, true)
        points.push({ x, y, r, g, b, a, robotId })
        offset += 28
      }
      console.debug('Worker: 解析点数据', { type: 'Float32Array', format: 'float32x7', pointCount })
    } else if (payloadBytes === pointCount * 12) {
      let offset = 4
      for (let i = 0; i < pointCount; i++) {
        const x = view.getFloat32(offset, true)
        const y = view.getFloat32(offset + 4, true)
        const r = view.getUint8(offset + 8) / 255
        const g = view.getUint8(offset + 9) / 255
        const b = view.getUint8(offset + 10) / 255
        const a = view.getUint8(offset + 11) / 255
        points.push({ x, y, r, g, b, a, robotId: 0 })
        offset += 12
      }
      console.debug('Worker: 解析点数据', { type: 'Float32Array', format: 'legacy-12bytes', pointCount })
    } else {
      const floats = new Float32Array(buffer, 4)
      const n = Math.floor(floats.length / 7)
      for (let i = 0; i < n; i++) {
        const base = i * 7
        points.push({
          x: floats[base],
          y: floats[base + 1],
          r: floats[base + 2],
          g: floats[base + 3],
          b: floats[base + 4],
          a: floats[base + 5],
          robotId: floats[base + 6]
        })
      }
      console.debug('Worker: 未知格式，按float32x7推断', { pointCount, payloadBytes })
    }
    if (points.length > 0) console.debug('Worker: 第一个点', points[0])
  }
  // 直接传入的 ArrayBuffer（兼容处理）
  else if (rawData instanceof ArrayBuffer) {
    const buffer = rawData
    const view = new DataView(buffer)
    const pointCount = view.getUint32(0, true)
    const payloadBytes = buffer.byteLength - 4
    if (payloadBytes === pointCount * 28) {
      let offset = 4
      for (let i = 0; i < pointCount; i++) {
        const x = view.getFloat32(offset, true)
        const y = view.getFloat32(offset + 4, true)
        const r = view.getFloat32(offset + 8, true)
        const g = view.getFloat32(offset + 12, true)
        const b = view.getFloat32(offset + 16, true)
        const a = view.getFloat32(offset + 20, true)
        const robotId = view.getFloat32(offset + 24, true)
        points.push({ x, y, r, g, b, a, robotId })
        offset += 28
      }
      console.debug('Worker: 解析点数据', { type: 'ArrayBuffer', format: 'float32x7', pointCount })
    } else if (payloadBytes === pointCount * 12) {
      let offset = 4
      for (let i = 0; i < pointCount; i++) {
        const x = view.getFloat32(offset, true)
        const y = view.getFloat32(offset + 4, true)
        const r = view.getUint8(offset + 8) / 255
        const g = view.getUint8(offset + 9) / 255
        const b = view.getUint8(offset + 10) / 255
        const a = view.getUint8(offset + 11) / 255
        points.push({ x, y, r, g, b, a, robotId: 0 })
        offset += 12
      }
      console.debug('Worker: 解析点数据', { type: 'ArrayBuffer', format: 'legacy-12bytes', pointCount })
    } else {
      const floats = new Float32Array(buffer, 4)
      const n = Math.floor(floats.length / 7)
      for (let i = 0; i < n; i++) {
        const base = i * 7
        points.push({
          x: floats[base],
          y: floats[base + 1],
          r: floats[base + 2],
          g: floats[base + 3],
          b: floats[base + 4],
          a: floats[base + 5],
          robotId: floats[base + 6]
        })
      }
      console.debug('Worker: 未知格式，按float32x7推断(ArrayBuffer)', { pointCount, payloadBytes })
    }
    if (points.length > 0) console.log('Worker: 第一个点', points[0])
  }
  // 如果是JSON格式
  else if (Array.isArray(rawData)) {
    return rawData
  }
  
  return points
}

/**
 * 坐标投影变换
 */
function projectPoints(points, transform) {
  // 这里可以实现更复杂的投影（如墨卡托投影等）
  // 现在只做简单的缩放和平移
  return points.map(point => ({
    ...point,
    // 保持原始坐标，投影在渲染时处理
    projX: point.x,
    projY: point.y
  }))
}

/**
 * 空间裁剪 - 只保留可见区域内的点
 */
function cullPoints(points, viewBounds, transform) {
  if (!viewBounds || !transform) return points
  
  const scale = transform.scale || 1
  const translateX = transform.translateX || 0
  const translateY = transform.translateY || 0
  
  // 计算世界坐标系下的视图边界
  const worldBounds = {
    left: (viewBounds.left - translateX) / scale,
    right: (viewBounds.right - translateX) / scale,
    top: (viewBounds.top - translateY) / scale,
    bottom: (viewBounds.bottom - translateY) / scale
  }
  
  // 添加一些边距（避免边缘点突然消失）
  const margin = 50 / scale
  worldBounds.left -= margin
  worldBounds.right += margin
  worldBounds.top -= margin
  worldBounds.bottom += margin
  
  return points.filter(point => 
    point.x >= worldBounds.left &&
    point.x <= worldBounds.right &&
    point.y >= worldBounds.top &&
    point.y <= worldBounds.bottom
  )
}

/**
 * LOD处理 - 根据缩放级别合并临近点（优化版）
 */
function applyLOD(points, scale) {
  if (points.length < 100 || scale > 0.5) {
    return points // 点数太少或缩放级别太高，不需要LOD
  }
  
  // 计算合并距离阈值（像素）
  const mergeDistance = config.lodThreshold / scale
  const mergeDistanceSq = mergeDistance * mergeDistance
  
  // 使用空间分区优化，避免O(n²)复杂度
  const cellSize = mergeDistance * 2
  const grid = new Map()
  
  // 将点分配到网格
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const cellX = Math.floor(p.x / cellSize)
    const cellY = Math.floor(p.y / cellSize)
    const key = `${cellX},${cellY}`
    
    if (!grid.has(key)) {
      grid.set(key, [])
    }
    grid.get(key).push(i)
  }
  
  const lodPoints = []
  const processed = new Set()
  
  // 对每个网格单元进行聚类
  for (const indices of grid.values()) {
    for (const i of indices) {
      if (processed.has(i)) continue
      
      const point = points[i]
      const cluster = [point]
      processed.add(i)
      
      // 只在相邻网格内查找（3x3范围），大幅减少比较次数
      const cellX = Math.floor(point.x / cellSize)
      const cellY = Math.floor(point.y / cellSize)
      
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const neighborKey = `${cellX + dx},${cellY + dy}`
          const neighborIndices = grid.get(neighborKey)
          if (!neighborIndices) continue
          
          for (const j of neighborIndices) {
            if (processed.has(j)) continue
            
            const other = points[j]
            const distSq = (point.x - other.x) ** 2 + (point.y - other.y) ** 2
            
            if (distSq <= mergeDistanceSq) {
              cluster.push(other)
              processed.add(j)
            }
          }
        }
      }
      
      // 计算簇的中心点（保留robotId）
      if (cluster.length > 0) {
        let sumX = 0, sumY = 0, sumR = 0, sumG = 0, sumB = 0, sumA = 0
        const robotId = point.robotId || 0
        
        for (const p of cluster) {
          sumX += p.x
          sumY += p.y
          sumR += p.r
          sumG += p.g
          sumB += p.b
          sumA += p.a
        }
        
        const count = cluster.length
        lodPoints.push({
          x: sumX / count,
          y: sumY / count,
          r: sumR / count,
          g: sumG / count,
          b: sumB / count,
          a: Math.min(1, (sumA / count) * (1 + Math.log(count) * 0.1)),
          robotId
        })
      }
    }
  }
  
  return lodPoints
}

/**
 * 数据量化 - 降低坐标精度
 */
function quantizePoints(points) {
  const quantizationLevel = 0.5 // 量化级别
  
  return points.map(point => ({
    ...point,
    x: Math.round(point.x / quantizationLevel) * quantizationLevel,
    y: Math.round(point.y / quantizationLevel) * quantizationLevel
  }))
}

/**
 * 像素对齐 - 减少渲染时的抖动
 */
function pixelAlign(points, transform) {
  if (!transform) return points
  
  const scale = transform.scale || 1
  
  // 只在高缩放级别下进行像素对齐
  if (scale < 2) return points
  
  return points.map(point => ({
    ...point,
    x: Math.round(point.x * scale) / scale,
    y: Math.round(point.y * scale) / scale
  }))
}

/**
 * 将点数据转换为ArrayBuffer（包含颜色和机器人ID信息）
 */
function pointsToArrayBuffer(points) {
  // 格式：[点数(4)] + [x,y,r,g,b,a,robotId](每个点28字节)
  const buffer = new ArrayBuffer(4 + points.length * 28)
  const view = new DataView(buffer)
  
  // 写入点数
  view.setUint32(0, points.length, true)
  
  // 写入点数据（包含颜色和机器人ID）
  let offset = 4
  for (const point of points) {
    // 位置
    view.setFloat32(offset, point.x || point.projX || 0, true)
    view.setFloat32(offset + 4, point.y || point.projY || 0, true)
    // 颜色
    view.setFloat32(offset + 8, point.r || 1.0, true)
    view.setFloat32(offset + 12, point.g || 1.0, true)
    view.setFloat32(offset + 16, point.b || 1.0, true)
    view.setFloat32(offset + 20, point.a || 1.0, true)
    // 机器人ID
    view.setFloat32(offset + 24, point.robotId || 0, true)
    offset += 28
  }
  
  return buffer
}

/**
 * 清空缓存
 */
function clearCache() {
  pointCache = []
  processedCache.clear()
  totalPoints = 0
  
  self.postMessage({
    type: 'cleared',
    stats: {
      totalPoints: 0
    }
  })
}

/**
 * 性能优化：批量处理
 */
class BatchProcessor {
  constructor(batchSize = 1000) {
    this.batchSize = batchSize
    this.queue = []
    this.processing = false
  }
  
  add(points) {
    this.queue.push(...points)
    
    if (!this.processing) {
      this.processBatch()
    }
  }
  
  async processBatch() {
    this.processing = true
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize)
      
      // 处理批次
      await new Promise(resolve => {
        setTimeout(() => {
          // 处理逻辑
          resolve()
        }, 0)
      })
    }
    
    this.processing = false
  }
}

// 创建批处理器实例
const batchProcessor = new BatchProcessor()

console.log('Data Processor Worker initialized')
