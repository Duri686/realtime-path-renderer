/**
 * 真实机器人运动模拟器
 * 模拟真实机器人的运动特性：
 * - 速度: 0.5-1.0 m/s
 * - 每50ms推送1-5个点
 * - 平滑连续的路径
 */
export class RealRobotSimulator {
  constructor(config = {}) {
    this.config = {
      // 时间参数
      pushInterval: 50,          // 推送间隔（ms）
      pointsPerPush: config.pointsPerPush ?? 3,          // 每次推送的点数
      
      // 运动参数（假设1像素 = 1cm，方便计算）
      pixelsPerMeter: 100,       // 像素/米的比例
      baseSpeed: 0.75,           // 基础速度（m/s）
      speedVariation: 0.25,      // 速度变化范围（±m/s）
      
      // 路径参数
      directionChangeRate: 0.02, // 方向变化率（rad/step）
      maxTurnAngle: Math.PI / 6,  // 最大转向角度（30度）
      smoothingFactor: 0.3,      // 路径平滑系数
      
      // 机器人配置
      robotCount: config.robotCount || 1,
      canvasWidth: config.canvasWidth || 1600,
      canvasHeight: config.canvasHeight || 1200,
      
      ...config
    }
    
    // 状态
    this.isRunning = false
    this.intervalId = null
    this.totalPointsSent = 0
    this.startTime = 0
    
    // 机器人列表
    this.robots = []
    this.initRobots()
    
    // 消息回调
    this.messageCallback = null
  }
  
  /**
   * 初始化机器人
   */
  initRobots() {
    const centerX = this.config.canvasWidth / 2
    const centerY = this.config.canvasHeight / 2
    
    for (let i = 0; i < this.config.robotCount; i++) {
      const angle = (i / this.config.robotCount) * Math.PI * 2
      const startRadius = 50
      
      this.robots.push({
        id: i,
        // 位置状态
        x: centerX + Math.cos(angle) * startRadius,
        y: centerY + Math.sin(angle) * startRadius,
        
        // 运动状态
        speed: this.config.baseSpeed,  // m/s
        direction: angle + Math.random() * Math.PI / 4,  // 初始方向（rad）
        targetDirection: angle,         // 目标方向
        
        // 累计距离
        totalDistance: 0,  // 米
        
        // 路径历史（用于平滑）
        pathHistory: [],
        maxHistorySize: 10,
        
        // 颜色（HSL）
        hue: (i / this.config.robotCount) * 360,
        color: this.hslToRgb(
          (i / this.config.robotCount) * 360,
          80,
          50
        )
      })
    }
  }
  
  /**
   * 生成下一批点（模拟真实运动）
   */
  generateNextPoints() {
    const points = []
    const currentTime = Date.now()
    const deltaTime = 0.05  // 50ms = 0.05秒
    
    for (const robot of this.robots) {
      // 每个机器人生成配置数量的点；若未配置则退回随机1-5个
      const pointCount = (Number.isFinite(this.config.pointsPerPush) && this.config.pointsPerPush > 0)
        ? Math.max(1, Math.floor(this.config.pointsPerPush))
        : (Math.floor(Math.random() * 4) + 1)
      
      for (let i = 0; i < pointCount; i++) {
        // 时间插值（在50ms内均匀分布）
        const t = (i + 1) / (pointCount + 1)
        const stepTime = deltaTime * t
        
        // 更新运动状态
        this.updateRobotMotion(robot, stepTime)
        
        // 生成路径点
        const point = {
          id: `r${robot.id}_${currentTime}_${i}`,
          robotId: robot.id,
          timestamp: currentTime + stepTime * 1000,
          x: robot.x,
          y: robot.y,
          direction: robot.direction,
          speed: robot.speed,
          // 颜色信息
          r: robot.color.r / 255,
          g: robot.color.g / 255,
          b: robot.color.b / 255,
          a: 0.9
        }
        
        points.push(point)
        
        // 记录历史用于平滑
        robot.pathHistory.push({ x: robot.x, y: robot.y })
        if (robot.pathHistory.length > robot.maxHistorySize) {
          robot.pathHistory.shift()
        }
      }
    }
    
    return points
  }
  
  /**
   * 更新机器人运动状态
   */
  updateRobotMotion(robot, deltaTime) {
    // 1. 随机更新目标方向（模拟避障或路径规划）
    if (Math.random() < 0.1) {  // 10%概率改变方向
      robot.targetDirection += (Math.random() - 0.5) * this.config.maxTurnAngle
    }
    
    // 2. 平滑转向到目标方向
    let directionDiff = robot.targetDirection - robot.direction
    // 归一化角度差到 -π 到 π
    while (directionDiff > Math.PI) directionDiff -= Math.PI * 2
    while (directionDiff < -Math.PI) directionDiff += Math.PI * 2
    
    robot.direction += directionDiff * this.config.directionChangeRate
    
    // 3. 速度波动（模拟加减速）
    const speedNoise = (Math.random() - 0.5) * this.config.speedVariation * 2
    robot.speed = Math.max(0.3, Math.min(1.2, 
      this.config.baseSpeed + speedNoise))
    
    // 4. 计算位移（速度 * 时间 * 像素比例）
    const distance = robot.speed * deltaTime * this.config.pixelsPerMeter
    
    // 5. 更新位置
    const dx = Math.cos(robot.direction) * distance
    const dy = Math.sin(robot.direction) * distance
    
    // 应用平滑（使用历史路径）
    if (robot.pathHistory.length > 2) {
      const smoothing = this.config.smoothingFactor
      const lastPoint = robot.pathHistory[robot.pathHistory.length - 1]
      robot.x = lastPoint.x * (1 - smoothing) + (robot.x + dx) * smoothing
      robot.y = lastPoint.y * (1 - smoothing) + (robot.y + dy) * smoothing
    } else {
      robot.x += dx
      robot.y += dy
    }
    
    // 6. 边界处理（软边界，逐渐转向）
    const margin = 100
    const maxX = this.config.canvasWidth - margin
    const maxY = this.config.canvasHeight - margin
    
    if (robot.x < margin) {
      robot.targetDirection = 0  // 向右
      robot.x = Math.max(margin, robot.x)
    } else if (robot.x > maxX) {
      robot.targetDirection = Math.PI  // 向左
      robot.x = Math.min(maxX, robot.x)
    }
    
    if (robot.y < margin) {
      robot.targetDirection = Math.PI / 2  // 向下
      robot.y = Math.max(margin, robot.y)
    } else if (robot.y > maxY) {
      robot.targetDirection = -Math.PI / 2  // 向上
      robot.y = Math.min(maxY, robot.y)
    }
    
    // 7. 累计行驶距离
    robot.totalDistance += distance / this.config.pixelsPerMeter  // 转换回米
  }
  
  /**
   * 开始模拟
   */
  start() {
    if (this.isRunning) return
    
    this.isRunning = true
    this.startTime = Date.now()
    this.totalPointsSent = 0
    this._applyInterval()
    
    console.log('真实机器人模拟器启动', {
      推送间隔: `${this.config.pushInterval}ms`,
      每批点数: `${this.config.pointsPerPush}点`,
      基础速度: `${this.config.baseSpeed} m/s`,
      机器人数: this.robots.length
    })
  }

  /**
   * 重新应用当前 pushInterval 定时器
   */
  _applyInterval() {
    if (!this.isRunning) return
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.intervalId = setInterval(() => {
      if (!this.isRunning) return
      const points = this.generateNextPoints()
      this.totalPointsSent += points.length
      if (this.messageCallback) {
        const buffer = this.pointsToBuffer(points)
        this.messageCallback(new Float32Array(buffer))
      }
      const runtime = (Date.now() - this.startTime) / 1000
      if (runtime > 0 && Math.floor(runtime) % 1 === 0) {
        const avgSpeed = this.robots.reduce((sum, r) => sum + r.speed, 0) / this.robots.length
        // 可按需保留日志
      }
      if (this.totalPointsSent >= 100000) {
        this.stop()
      }
    }, this.config.pushInterval)
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
    
    const runtime = (Date.now() - this.startTime) / 1000
    console.log('真实机器人模拟器停止', {
      运行时间: `${runtime.toFixed(1)}s`,
      累计发送: `${this.totalPointsSent}点`,
      平均速率: `${(this.totalPointsSent / runtime).toFixed(1)}点/秒`
    })
  }
  
  /**
   * 将点数据转换为二进制缓冲区
   */
  pointsToBuffer(points) {
    // 格式：[点数(4)] + 每个点[x,y,r,g,b,a,robotId](28字节)
    const buffer = new ArrayBuffer(4 + points.length * 28)
    const view = new DataView(buffer)
    
    // 写入点数
    view.setUint32(0, points.length, true)
    
    // 写入点数据
    let offset = 4
    for (const point of points) {
      view.setFloat32(offset, point.x, true)
      view.setFloat32(offset + 4, point.y, true)
      view.setFloat32(offset + 8, point.r, true)
      view.setFloat32(offset + 12, point.g, true)
      view.setFloat32(offset + 16, point.b, true)
      view.setFloat32(offset + 20, point.a, true)
      view.setFloat32(offset + 24, point.robotId, true)
      offset += 28
    }
    
    return buffer
  }
  
  /**
   * 设置消息回调
   */
  onMessage(callback) {
    this.messageCallback = callback
  }
  
  /**
   * 更新配置
   */
  updateConfig(config) {
    if (!config) return
    const newCfg = { ...config }
    // 兼容旧键名
    if (typeof newCfg.pointsPerMessage !== 'undefined') {
      newCfg.pointsPerPush = newCfg.pointsPerMessage
      delete newCfg.pointsPerMessage
    }
    if (typeof newCfg.interval !== 'undefined') {
      newCfg.pushInterval = newCfg.interval
      delete newCfg.interval
    }
    const prevInterval = this.config.pushInterval
    const prevRobotCount = this.robots.length
    this.config = { ...this.config, ...newCfg }
    if (typeof newCfg.robotCount !== 'undefined' && newCfg.robotCount !== prevRobotCount) {
      this.robots = []
      this.initRobots()
    }
    if (this.isRunning && typeof newCfg.pushInterval !== 'undefined' && newCfg.pushInterval !== prevInterval) {
      this._applyInterval()
    }
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
}
