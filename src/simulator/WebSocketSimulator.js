/**
 * WebSocket模拟器 - 模拟后端实时发送路径点数据
 */
export class WebSocketSimulator {
  constructor(config = {}) {
    this.config = {
      interval: config.interval || 50,           // 发送间隔（ms）
      pointsPerMessage: config.pointsPerMessage || 100, // 每条消息的点数
      maxTotalPoints: config.maxTotalPoints || 200000,  // 最大总点数
      robotCount: config.robotCount || 1,        // 机器人数量
      canvasWidth: config.canvasWidth || 1600,   // canvas宽度
      canvasHeight: config.canvasHeight || 1200, // canvas高度
      ...config
    }
    
    // 模拟状态
    this.isRunning = false
    this.intervalId = null
    this.totalPointsSent = 0
    
    // 路径生成参数
    this.pathGenerators = []
    this.currentTime = 0
    
    // 回调函数
    this.messageCallback = null
    
    // 初始化路径生成器
    this.initPathGenerators()
  }
  
  /**
   * 初始化路径生成器（模拟多条路径）
   */
  initPathGenerators() {
    // 使用配置的机器人数量
    const pathCount = this.config.robotCount
    // 中心点坐标（动态计算canvas中心）
    const centerX = this.config.canvasWidth / 2
    const centerY = this.config.canvasHeight / 2
    
    // 预定义的颜色池（保证颜色区分）
    this.colorPool = this.generateColorPool(pathCount)
    
    for (let i = 0; i < pathCount; i++) {
      // 计算角度，使路径均匀分布
      const angle = (i / pathCount) * Math.PI * 2
      const radius = 50 // 起始半径
      
      this.pathGenerators.push({
        id: `path_${i}`,
        // 起始位置（从中心向外）
        startX: centerX + Math.cos(angle) * radius,
        startY: centerY + Math.sin(angle) * radius,
        // 当前位置
        currentX: 0,
        currentY: 0,
        // 当前方向（角度，弧度制）
        direction: angle + (Math.random() - 0.5) * Math.PI / 2,
        // 移动速度
        speed: 1.5 + Math.random() * 2.5,  // 1.5-4.0
        // 转向参数
        turnRate: 0.05 + Math.random() * 0.1,  // 转向速度
        targetDirection: angle,  // 目标方向
        directionChangeInterval: 30 + Math.floor(Math.random() * 70),  // 改变方向的间隔
        stepsSinceDirectionChange: 0,
        // 噪声参数（使路径更自然）
        noiseLevel: Math.random() * 2,
        // 颜色（用于标识不同路径）
        color: this.colorPool[i],
        robotId: i
      })
      
      // 设置初始位置
      this.pathGenerators[i].currentX = this.pathGenerators[i].startX
      this.pathGenerators[i].currentY = this.pathGenerators[i].startY
    }
  }
  
  /**
   * 生成颜色池（HSL色彩空间均匀分布，保证颜色区分）
   */
  generateColorPool(count) {
    const colors = []
    
    for (let i = 0; i < count; i++) {
      // 在HSL色彩空间中均匀分布色相
      const hue = (i / count) * 360
      const saturation = 80 + Math.random() * 20  // 80-100%
      const lightness = 50 + Math.random() * 10   // 50-60%
      
      // 转换HSL到RGB
      const rgb = this.hslToRgb(hue, saturation, lightness)
      
      colors.push({
        r: rgb.r / 255,
        g: rgb.g / 255,
        b: rgb.b / 255,
        a: 0.9,
        hue: hue
      })
    }
    
    return colors
  }
  
  /**
   * HSL转RGB
   */
  hslToRgb(h, s, l) {
    h = h / 360
    s = s / 100
    l = l / 100
    
    let r, g, b
    
    if (s === 0) {
      r = g = b = l
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1/6) return p + (q - p) * 6 * t
        if (t < 1/2) return q
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
        return p
      }
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      
      r = hue2rgb(p, q, h + 1/3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1/3)
    }
    
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    }
  }
  
  /**
   * 生成一批点数据
   */
  generatePoints() {
    const points = []
    const pointsPerPath = Math.floor(this.config.pointsPerMessage / this.pathGenerators.length)
    
    for (const generator of this.pathGenerators) {
      for (let i = 0; i < pointsPerPath; i++) {
        // 检查是否需要改变目标方向
        generator.stepsSinceDirectionChange++
        if (generator.stepsSinceDirectionChange >= generator.directionChangeInterval) {
          // 随机选择新的目标方向（-180° 到 +180°）
          generator.targetDirection = (Math.random() - 0.5) * Math.PI * 2
          generator.directionChangeInterval = 30 + Math.floor(Math.random() * 70)
          generator.stepsSinceDirectionChange = 0
        }
        
        // 平滑转向到目标方向
        let directionDiff = generator.targetDirection - generator.direction
        // 归一化角度差到 -π 到 π
        while (directionDiff > Math.PI) directionDiff -= Math.PI * 2
        while (directionDiff < -Math.PI) directionDiff += Math.PI * 2
        
        generator.direction += directionDiff * generator.turnRate
        
        // 添加轻微的随机抖动（模拟真实机器人的不确定性）
        const directionNoise = (Math.random() - 0.5) * 0.1
        const currentDirection = generator.direction + directionNoise
        
        // 根据方向和速度计算位移
        const dx = Math.cos(currentDirection) * generator.speed
        const dy = Math.sin(currentDirection) * generator.speed
        
        // 添加位置噪声
        const noiseX = (Math.random() - 0.5) * generator.noiseLevel
        const noiseY = (Math.random() - 0.5) * generator.noiseLevel
        
        // 更新位置
        generator.currentX += dx + noiseX
        generator.currentY += dy + noiseY
        
        // 边界反弹（软边界，使用动态canvas尺寸）
        const boundaryMargin = 100
        const maxX = this.config.canvasWidth
        const maxY = this.config.canvasHeight
        
        if (generator.currentX < boundaryMargin) {
          generator.targetDirection = 0  // 向右
          generator.currentX = boundaryMargin
        } else if (generator.currentX > maxX - boundaryMargin) {
          generator.targetDirection = Math.PI  // 向左
          generator.currentX = maxX - boundaryMargin
        }
        
        if (generator.currentY < boundaryMargin) {
          generator.targetDirection = Math.PI / 2  // 向下
          generator.currentY = boundaryMargin
        } else if (generator.currentY > maxY - boundaryMargin) {
          generator.targetDirection = -Math.PI / 2  // 向上
          generator.currentY = maxY - boundaryMargin
        }
        
        points.push({
          id: `${generator.id}_${Date.now()}_${i}`,
          x: generator.currentX,
          y: generator.currentY,
          timestamp: Date.now(),
          pathId: generator.id,
          robotId: generator.robotId,  // 添加机器人ID
          color: generator.color,
          // 附加属性
          speed: generator.speed,
          direction: generator.direction,
          // 展开颜色属性（RGBA）
          r: generator.color.r,
          g: generator.color.g,
          b: generator.color.b,
          a: generator.color.a
        })
      }
    }
    
    this.currentTime += 0.1
    
    return points
  }
  
  /**
   * 将点数据转换为二进制格式（优化传输）
   */
  pointsToArrayBuffer(points) {
    // 数据格式：
    // [点数量(4字节)] + [点数据...]
    // 每个点：[x(4字节)][y(4字节)][r(1字节)][g(1字节)][b(1字节)][a(1字节)]
    const pointSize = 12 // 4 + 4 + 1 + 1 + 1 + 1
    const buffer = new ArrayBuffer(4 + points.length * pointSize)
    const view = new DataView(buffer)
    
    // 写入点数量
    view.setUint32(0, points.length, true)
    
    // 写入点数据
    let offset = 4
    for (const point of points) {
      // 位置
      view.setFloat32(offset, point.x, true)
      view.setFloat32(offset + 4, point.y, true)
      
      // 颜色（转换为0-255）
      view.setUint8(offset + 8, Math.floor(point.color.r * 255))
      view.setUint8(offset + 9, Math.floor(point.color.g * 255))
      view.setUint8(offset + 10, Math.floor(point.color.b * 255))
      view.setUint8(offset + 11, Math.floor(point.color.a * 255))
      
      offset += pointSize
    }
    
    return buffer
  }
  
  /**
   * 生成高密度测试数据
   */
  generateStressTestData(pointCount = 10000) {
    const points = []
    
    // 生成密集的螺旋状点云
    const centerX = 1000
    const centerY = 750
    const maxRadius = 500
    
    for (let i = 0; i < pointCount; i++) {
      const angle = (i / pointCount) * Math.PI * 20 // 10圈螺旋
      const radius = (i / pointCount) * maxRadius
      
      // 添加一些变化
      const noise = Math.random() * 10
      const x = centerX + Math.cos(angle) * (radius + noise)
      const y = centerY + Math.sin(angle) * (radius + noise)
      
      // 根据密度变化颜色
      const density = 1 - (i / pointCount)
      
      points.push({
        id: `stress_${i}`,
        x: x,
        y: y,
        timestamp: Date.now(),
        pathId: 'stress_test',
        color: {
          r: density,
          g: 1 - density * 0.5,
          b: 0.2,
          a: 0.9
        }
      })
    }
    
    return points
  }
  
  /**
   * 发送消息
   */
  sendMessage() {
    if (this.totalPointsSent >= this.config.maxTotalPoints) {
      console.log('达到最大点数限制，停止发送')
      this.stop()
      return
    }
    
    // 生成点数据
    let points
    if (this.totalPointsSent > 50000) {
      // 后期发送高密度数据进行压力测试
      const remaining = this.config.maxTotalPoints - this.totalPointsSent
      const count = Math.min(1000, remaining)
      points = this.generateStressTestData(count)
    } else {
      points = this.generatePoints()
    }
    
    // 转换为二进制格式
    const buffer = this.pointsToArrayBuffer(points)
    
    // 更新统计
    this.totalPointsSent += points.length
    
    // 触发回调（模拟WebSocket onMessage）
    if (this.messageCallback) {
      // 传递ArrayBuffer（模拟真实WebSocket的二进制消息）
      const float32Data = new Float32Array(buffer)
      console.log('WebSocket: 发送数据', {
        pointsCount: points.length,
        bufferSize: buffer.byteLength,
        float32Length: float32Data.length,
        firstPoint: points[0]
      })
      this.messageCallback(float32Data)
    }
    
    // 同时提供JSON格式（用于调试）
    if (this.config.debug) {
      console.log(`发送 ${points.length} 个点，总计: ${this.totalPointsSent}`)
    }
  }
  
  /**
   * 开始模拟
   */
  start() {
    if (this.isRunning) return
    
    this.isRunning = true
    this.totalPointsSent = 0
    this.currentTime = 0
    
    // 立即发送第一批数据
    this.sendMessage()
    
    // 设置定时发送
    this.intervalId = setInterval(() => {
      this.sendMessage()
    }, this.config.interval)
    
    console.log(`WebSocket模拟器启动 - 间隔: ${this.config.interval}ms, 每批: ${this.config.pointsPerMessage}点`)
  }
  
  /**
   * 停止模拟
   */
  stop() {
    if (!this.isRunning) return
    
    this.isRunning = false
    
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    
    console.log(`WebSocket模拟器停止 - 共发送: ${this.totalPointsSent}点`)
  }
  
  /**
   * 注册消息回调
   */
  onMessage(callback) {
    this.messageCallback = callback
  }
  
  /**
   * 更新配置
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config }
    
    // 如果正在运行，重启以应用新配置
    if (this.isRunning) {
      this.stop()
      this.start()
    }
  }
  
  /**
   * 获取模拟状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      totalPointsSent: this.totalPointsSent,
      config: this.config
    }
  }
}
