/**
 * 路径追踪器 - 镜头跟随控制器
 * 职责：计算和应用镜头变换，不负责UI渲染
 */
export class PathTracker {
  constructor(konvaLayer, webglRenderer) {
    this.konvaLayer = konvaLayer
    this.webglRenderer = webglRenderer
    this.robotManager = webglRenderer?.robotManager
    
    // 追踪配置
    this.config = {
      enabled: false,          // 默认关闭
      smoothing: 0.1,          // 平滑系数 (0-1)
      padding: 0.05            // 数据边距比例
    }
    
    // 当前状态
    this.focusedRobotId = 0
    this.latestPoint = null
    this.targetTransform = { x: 0, y: 0, scale: 1 }
    this.currentTransform = { x: 0, y: 0, scale: 1 }
    
    // 用户交互状态
    this.isUserInteracting = false  // 用户正在手动操作
    this.interactionCooldown = 0    // 交互冷却时间
  }
  
  /**
   * 启动追踪（优化：不再使用独立定时器，由主渲染循环驱动）
   */
  start() {
    this.config.enabled = true
    console.log('PathTracker: 启动自动跟踪')
  }
  
  /**
   * 停止追踪
   */
  stop() {
    this.config.enabled = false
    console.log('PathTracker: 停止自动跟踪')
  }
  
  /**
   * 更新追踪（从robotManager获取最新位置）
   */
  updateFromRobotManager() {
    if (!this.robotManager) return
    
    const robot = this.robotManager.getRobotData(this.focusedRobotId)
    if (!robot || !robot.currentPosition) return
    
    this.latestPoint = { 
      x: robot.currentPosition.x, 
      y: robot.currentPosition.y, 
      timestamp: Date.now() 
    }
    
    if (this.config.enabled) {
      this.calculateTargetTransform()
    }
    // 优化：移除updateRobotMarker()调用，由RobotMarkers统一管理
  }

  /**
   * 设置聚焦机器人
   */
  setFocusedRobot(robotId) {
    this.focusedRobotId = robotId || 0
    this.updateFromRobotManager()
    return this.focusedRobotId
  }
  
  /**
   * 更新最新点位置（兼容旧方法）
   */
  updateLatestPoint(x, y) {
    this.latestPoint = { x, y, timestamp: Date.now() }
    
    if (this.config.enabled) {
      this.calculateTargetTransform()
    }
    // 优化：移除updateRobotMarker()调用，由RobotMarkers统一管理
  }
  
  /**
   * 计算目标变换（将焦点机器人居中）
   */
  calculateTargetTransform() {
    if (!this.latestPoint || !this.konvaLayer || !this.webglRenderer) return
    
    const { width, height } = this.konvaLayer.size
    const bounds = this.webglRenderer.dataBounds
    
    // 数据坐标转画布坐标（与WebGL着色器一致）
    const pad = this.config.padding
    const rangeX = Math.max(1e-6, bounds.maxX - bounds.minX)
    const rangeY = Math.max(1e-6, bounds.maxY - bounds.minY)
    
    const nx = (this.latestPoint.x - bounds.minX) / rangeX
    const ny = (this.latestPoint.y - bounds.minY) / rangeY
    
    const canvasX = (nx * (1 - 2 * pad) + pad) * width
    const canvasY = (ny * (1 - 2 * pad) + pad) * height
    
    // 计算变换使目标点居中
    const scale = this.currentTransform.scale
    this.targetTransform = {
      x: width / (2 * scale) - canvasX,
      y: height / (2 * scale) - canvasY,
      scale
    }
  }
  
  /**
   * 通知用户开始手动交互（暂停自动跟踪）
   */
  notifyUserInteractionStart() {
    this.isUserInteracting = true
    this.interactionCooldown = Date.now() + 2000 // 2秒冷却
    console.log('PathTracker: 用户手动操作，暂停自动跟踪')
  }
  
  /**
   * 通知用户结束手动交互
   */
  notifyUserInteractionEnd() {
    this.isUserInteracting = false
    console.log('PathTracker: 用户操作结束')
  }
  
  /**
   * 平滑更新视图变换（线性插值）
   */
  update() {
    if (!this.config.enabled || !this.latestPoint || !this.konvaLayer) return
    
    // 用户正在交互或冷却期内，暂停自动跟踪
    if (this.isUserInteracting || Date.now() < this.interactionCooldown) {
      return
    }
    
    // 线性插值平滑移动
    const { smoothing } = this.config
    const { x, y, scale } = this.currentTransform
    const target = this.targetTransform
    
    this.currentTransform.x = x + (target.x - x) * smoothing
    this.currentTransform.y = y + (target.y - y) * smoothing
    this.currentTransform.scale = scale + (target.scale - scale) * smoothing
    
    // 应用变换（通过KonvaLayer统一管理）
    this.applyTransform()
  }
  
  /**
   * 应用变换到Konva层
   */
  applyTransform() {
    if (!this.konvaLayer?.stage) return
    
    Object.assign(this.konvaLayer.transform, this.currentTransform)
    
    // 触发变换回调（同步到WebGL和RobotMarkers）
    this.konvaLayer.onTransformChangeCallback?.(this.currentTransform)
  }
  
  /**
   * 切换自动跟踪
   */
  toggle() {
    this.config.enabled = !this.config.enabled
    if (this.config.enabled) {
      this.calculateTargetTransform()
    }
    return this.config.enabled
  }
  
  /**
   * 销毁（清理资源）
   */
  destroy() {
    this.stop()
    this.latestPoint = null
  }
}
