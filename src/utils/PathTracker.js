/**
 * 路径追踪器 - 自动跟随最新点位置
 */
export class PathTracker {
  constructor(konvaLayer, webglRenderer) {
    this.konvaLayer = konvaLayer
    this.webglRenderer = webglRenderer
    this.robotManager = webglRenderer ? webglRenderer.robotManager : null
    
    // 追踪配置
    this.config = {
      enabled: true,           // 是否启用自动跟踪
      smoothing: 0.1,          // 平滑系数 (0-1)
      margin: 100,             // 边距（像素）
      updateInterval: 100      // 更新间隔（ms）
    }
    
    // 当前状态
    this.latestPoint = null
    this.targetTransform = { x: 0, y: 0, scale: 1 }
    this.currentTransform = { x: 0, y: 0, scale: 1 }
    
    // 机器人标记
    this.robotMarker = null
    this.markerBlinkInterval = null
    
    // 更新定时器
    this.updateTimer = null

    // 聚焦的机器人（默认0）
    this.focusedRobotId = 0
  }
  
  /**
   * 启动追踪
   */
  start() {
    if (this.updateTimer) return
    
    this.updateTimer = setInterval(() => {
      this.update()
    }, this.config.updateInterval)
    
    // 启动标记闪烁
    this.startMarkerBlink()
    
    console.log('PathTracker: 启动自动跟踪')
  }
  
  /**
   * 停止追踪
   */
  stop() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
      this.updateTimer = null
    }
    
    this.stopMarkerBlink()
    
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
    
    // 更新机器人标记位置
    this.updateRobotMarker()
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
    
    // 更新机器人标记位置
    this.updateRobotMarker()
  }
  
  /**
   * 计算目标变换
   */
  calculateTargetTransform() {
    if (!this.latestPoint) return
    
    const canvasWidth = this.konvaLayer.size.width
    const canvasHeight = this.konvaLayer.size.height
    const bounds = this.webglRenderer ? this.webglRenderer.dataBounds : { minX: 0, minY: 0, maxX: canvasWidth, maxY: canvasHeight }
    const pad = 0.05
    const rx = Math.max(1e-6, bounds.maxX - bounds.minX)
    const ry = Math.max(1e-6, bounds.maxY - bounds.minY)
    const nx = (this.latestPoint.x - bounds.minX) / rx
    const ny = (this.latestPoint.y - bounds.minY) / ry
    const px = (nx * (1 - 2 * pad) + pad) * canvasWidth
    const py = (ny * (1 - 2 * pad) + pad) * canvasHeight
    const scale = this.currentTransform.scale
    // 使 (px + tx) * scale = canvas/2  => tx = canvas/(2*scale) - px
    this.targetTransform = {
      x: canvasWidth / (2 * scale) - px,
      y: canvasHeight / (2 * scale) - py,
      scale
    }
  }
  
  /**
   * 平滑更新视图变换
   */
  update() {
    if (!this.config.enabled || !this.latestPoint) return
    
    // 线性插值平滑移动
    const smoothing = this.config.smoothing
    
    this.currentTransform.x += (this.targetTransform.x - this.currentTransform.x) * smoothing
    this.currentTransform.y += (this.targetTransform.y - this.currentTransform.y) * smoothing
    this.currentTransform.scale += (this.targetTransform.scale - this.currentTransform.scale) * smoothing
    
    // 应用到Konva层（会自动同步到WebGL）
    if (this.konvaLayer && this.konvaLayer.stage) {
      // 这里需要实现Konva的transform更新
      // 暂时通过直接设置来实现
      this.konvaLayer.transform.x = this.currentTransform.x
      this.konvaLayer.transform.y = this.currentTransform.y
      this.konvaLayer.transform.scale = this.currentTransform.scale
      
      // 触发变换回调
      if (this.konvaLayer.onTransformChangeCallback) {
        this.konvaLayer.onTransformChangeCallback(this.currentTransform)
      }
      
      // 重绘网格
      this.konvaLayer.drawGrid()
    }
  }
  
  /**
   * 更新机器人标记
   */
  updateRobotMarker() {
    if (!this.latestPoint || !this.konvaLayer) return
    
    // 如果标记不存在，创建它
    if (!this.robotMarker) {
      this.createRobotMarker()
    }
    
    // 更新标记位置（使用与WebGL一致的映射）
    const canvasWidth = this.konvaLayer.size.width
    const canvasHeight = this.konvaLayer.size.height
    const bounds = this.webglRenderer ? this.webglRenderer.dataBounds : { minX: 0, minY: 0, maxX: canvasWidth, maxY: canvasHeight }
    const pad = 0.05
    const rx = Math.max(1e-6, bounds.maxX - bounds.minX)
    const ry = Math.max(1e-6, bounds.maxY - bounds.minY)
    const nx = (this.latestPoint.x - bounds.minX) / rx
    const ny = (this.latestPoint.y - bounds.minY) / ry
    const px = (nx * (1 - 2 * pad) + pad) * canvasWidth
    const py = (ny * (1 - 2 * pad) + pad) * canvasHeight
    const transform = this.currentTransform
    const screenX = (px + transform.x) * transform.scale
    const screenY = (py + transform.y) * transform.scale
    
    if (this.robotMarker) {
      this.robotMarker.position({
        x: screenX,
        y: screenY
      })
      this.konvaLayer.overlayLayer.draw()
    }
  }
  
  /**
   * 创建机器人标记
   */
  createRobotMarker() {
    if (!this.konvaLayer) return
    
    const KonvaNS = (this.konvaLayer && this.konvaLayer.overlayLayer && this.konvaLayer.overlayLayer.constructor && this.konvaLayer.overlayLayer.constructor.parent) || window.Konva
    if (!KonvaNS) return
    // 创建一个闪烁的圆形标记
    this.robotMarker = new KonvaNS.Circle({
      x: 0,
      y: 0,
      radius: 8,
      fill: '#ff0000',
      stroke: '#ffffff',
      strokeWidth: 2,
      opacity: 1
    })
    
    this.konvaLayer.overlayLayer.add(this.robotMarker)
    this.konvaLayer.overlayLayer.draw()
  }
  
  /**
   * 启动标记闪烁动画
   */
  startMarkerBlink() {
    if (this.markerBlinkInterval) return
    
    let opacity = 1
    let direction = -1
    
    this.markerBlinkInterval = setInterval(() => {
      if (!this.robotMarker) return
      
      opacity += direction * 0.1
      
      if (opacity <= 0.3) {
        opacity = 0.3
        direction = 1
      } else if (opacity >= 1) {
        opacity = 1
        direction = -1
      }
      
      this.robotMarker.opacity(opacity)
      this.konvaLayer.overlayLayer.draw()
    }, 50)
  }
  
  /**
   * 停止标记闪烁
   */
  stopMarkerBlink() {
    if (this.markerBlinkInterval) {
      clearInterval(this.markerBlinkInterval)
      this.markerBlinkInterval = null
    }
    
    if (this.robotMarker) {
      this.robotMarker.destroy()
      this.robotMarker = null
      this.konvaLayer.overlayLayer.draw()
    }
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
   * 设置配置
   */
  setConfig(config) {
    this.config = { ...this.config, ...config }
  }
  
  /**
   * 销毁
   */
  destroy() {
    this.stop()
    
    if (this.robotMarker) {
      this.robotMarker.destroy()
      this.robotMarker = null
    }
  }
}
