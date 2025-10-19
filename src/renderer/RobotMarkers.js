/**
 * 机器人标记管理器 - 管理起点标记和当前位置标记
 */
export class RobotMarkers {
  constructor(konvaLayer) {
    this.konvaLayer = konvaLayer
    this.markers = new Map()  // robotId -> markers
    
    // 标记样式配置
    this.config = {
      startMarker: {
        radius: 8,
        strokeWidth: 2,
        opacity: 0.8
      },
      currentMarker: {
        radius: 10,
        strokeWidth: 3,
        pulseRadius: 20,
        pulseOpacity: 0.3
      }
    }
    
    // 动画状态
    this.animations = new Map()
    
    // 数据边界（与WebGL同步）
    this.dataBounds = {
      minX: 0,
      maxX: 1000,
      minY: 0,
      maxY: 1000
    }
    
    // 画布大小
    this.canvasSize = {
      width: 800,
      height: 600
    }

    // 视图变换（与KonvaLayer/WebGL一致）
    this.transform = {
      x: 0,
      y: 0,
      scale: 1.0
    }

    this._boundsDirty = false
    this._lastUpdateTime = 0
    this._updateIntervalMs = 50
  }
  
  /**
   * 设置数据边界（与WebGL同步）
   */
  setDataBounds(bounds) {
    this.dataBounds = bounds
    this._boundsDirty = true
  }
  
  /**
   * 设置画布大小
   */
  setCanvasSize(width, height) {
    this.canvasSize.width = width
    this.canvasSize.height = height
    this.updateAllMarkerPositions()
  }

  /**
   * 更新视图变换（由 KonvaLayer 的 onTransformChange 驱动）
   */
  setTransform(transform) {
    if (!transform) return
    this.transform.scale = transform.scale || 1.0
    this.transform.x = transform.x || 0
    this.transform.y = transform.y || 0
    this.updateAllMarkerPositions()
  }
  
  /**
   * 将数据坐标转换为画布坐标（与WebGL着色器逻辑一致）
   */
  dataToCanvas(dataX, dataY) {
    // 1) 按数据边界归一化到 [0,1]
    let rangeX = this.dataBounds.maxX - this.dataBounds.minX
    let rangeY = this.dataBounds.maxY - this.dataBounds.minY
    if (rangeX <= 1e-6) rangeX = 1e-6
    if (rangeY <= 1e-6) rangeY = 1e-6
    const nx = (dataX - this.dataBounds.minX) / rangeX
    const ny = (dataY - this.dataBounds.minY) / rangeY
    // 2) padding 一致
    const pad = 0.05
    const px0 = (nx * (1 - 2 * pad) + pad) * this.canvasSize.width
    const py0 = (ny * (1 - 2 * pad) + pad) * this.canvasSize.height
    // 3) 应用视图变换（CSS像素）
    const sx = (px0 + this.transform.x) * this.transform.scale
    const sy = (py0 + this.transform.y) * this.transform.scale
    return { x: sx, y: sy }
  }
  
  /**
   * 添加机器人标记
   */
  addRobot(robotId, startPosition, color) {
    if (this.markers.has(robotId)) {
      return
    }
    
    // Konva应该已经在KonvaLayer中被加载
    if (!window.Konva) {
      console.error('Konva not found. Make sure KonvaLayer is initialized first.')
      return
    }
    const Konva = window.Konva
    
    // 转换到画布坐标
    const canvasPos = this.dataToCanvas(startPosition.x, startPosition.y)
    
    // 创建起点标记（固定）
    const startGroup = new Konva.Group({
      x: canvasPos.x,
      y: canvasPos.y
    })
    
    // 起点外圈
    const startOuter = new Konva.Circle({
      radius: this.config.startMarker.radius,
      stroke: `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`,
      strokeWidth: this.config.startMarker.strokeWidth,
      fill: `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, 0.2)`,
      opacity: this.config.startMarker.opacity
    })
    
    // 起点中心点
    const startCenter = new Konva.Circle({
      radius: 3,
      fill: `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`
    })
    
    // 起点文字标签
    startGroup.add(startOuter)
    startGroup.add(startCenter)
    
    // 创建当前位置标记（移动 + 呼吸灯）
    const currentGroup = new Konva.Group({
      x: canvasPos.x,
      y: canvasPos.y
    })
    
    // 呼吸灯外圈（脉冲动画）
    const pulseCircle = new Konva.Circle({
      radius: this.config.currentMarker.pulseRadius,
      fill: `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${this.config.currentMarker.pulseOpacity})`,
      opacity: 0
    })
    
    // 当前位置主体
    const currentCircle = new Konva.Circle({
      radius: this.config.currentMarker.radius,
      fill: `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`,
      stroke: '#ffffff',
      strokeWidth: this.config.currentMarker.strokeWidth,
      shadowColor: `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`,
      shadowBlur: 10,
      shadowOpacity: 0.5
    })
    
    // 方向指示器（小三角）
    const directionArrow = new Konva.RegularPolygon({
      sides: 3,
      radius: 6,
      fill: '#ffffff',
      rotation: 0,
      offsetY: -this.config.currentMarker.radius - 5
    })
    
    const currentLabel = new Konva.Text({
      text: `R${robotId + 1}`,
      fontSize: 12,
      fill: '#ffffff',
      offsetX: -14,
      offsetY: -24
    })
    
    currentGroup.add(pulseCircle)
    currentGroup.add(currentCircle)
    currentGroup.add(directionArrow)
    currentGroup.add(currentLabel)
    
    // 添加到层
    this.konvaLayer.overlayLayer.add(startGroup)
    this.konvaLayer.overlayLayer.add(currentGroup)
    
    // 保存引用
    this.markers.set(robotId, {
      startGroup,
      currentGroup,
      pulseCircle,
      currentCircle,
      directionArrow,
      currentLabel,
      color,
      dataPosition: { x: startPosition.x, y: startPosition.y },  // 保存原始数据坐标
      startDataPosition: { x: startPosition.x, y: startPosition.y }
    })
    
    // 启动呼吸灯动画
    this.startBreathingAnimation(robotId)
    
    this.konvaLayer.overlayLayer.draw()
  }
  
  /**
   * 启动呼吸灯动画
   */
  startBreathingAnimation(robotId) {
    const marker = this.markers.get(robotId)
    if (!marker) return
    
    // Konva应该已经在KonvaLayer中被加载
    if (!window.Konva) {
      console.error('Konva not found. Make sure KonvaLayer is initialized first.')
      return
    }
    const Konva = window.Konva
    
    // 脉冲动画
    const pulseAnimation = new Konva.Animation((frame) => {
      const scale = 1 + Math.sin(frame.time * 0.002) * 0.5
      const opacity = 0.5 - Math.sin(frame.time * 0.002) * 0.3
      
      marker.pulseCircle.scaleX(scale)
      marker.pulseCircle.scaleY(scale)
      marker.pulseCircle.opacity(opacity)
    }, this.konvaLayer.overlayLayer)
    
    // 光晕动画
    const glowAnimation = new Konva.Animation((frame) => {
      const glowIntensity = 10 + Math.sin(frame.time * 0.003) * 5
      marker.currentCircle.shadowBlur(glowIntensity)
    }, this.konvaLayer.overlayLayer)
    
    pulseAnimation.start()
    glowAnimation.start()
    
    // 保存动画引用
    this.animations.set(robotId, { pulseAnimation, glowAnimation })
  }
  
  /**
   * 更新机器人当前位置
   */
  updateRobotPosition(robotId, position, direction = 0) {
    const marker = this.markers.get(robotId)
    if (!marker) return
    
    // 保存数据坐标
    marker.dataPosition = { x: position.x, y: position.y }
    
    // 转换到画布坐标
    const canvasPos = this.dataToCanvas(position.x, position.y)
    
    // 平滑移动到新位置
    marker.currentGroup.x(canvasPos.x)
    marker.currentGroup.y(canvasPos.y)
    
    // 更新方向指示器
    if (direction !== undefined) {
      marker.directionArrow.rotation(direction * 180 / Math.PI + 90)
    }
  }
  
  /**
   * 更新所有标记位置（当边界或画布大小改变时）
   */
  updateAllMarkerPositions() {
    for (const [robotId, marker] of this.markers) {
      if (marker.dataPosition) {
        const canvasPos = this.dataToCanvas(marker.dataPosition.x, marker.dataPosition.y)
        marker.currentGroup.x(canvasPos.x)
        marker.currentGroup.y(canvasPos.y)
        
        // 也更新起点位置（如果有）
        if (marker.startDataPosition) {
          const startCanvasPos = this.dataToCanvas(marker.startDataPosition.x, marker.startDataPosition.y)
          marker.startGroup.x(startCanvasPos.x)
          marker.startGroup.y(startCanvasPos.y)
        }
      }
    }
    this.konvaLayer.overlayLayer.batchDraw()
  }
  
  /**
   * 批量更新所有机器人位置
   */
  updateAllPositions(robotManager) {
    if (!robotManager) return
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    if (now - this._lastUpdateTime < this._updateIntervalMs) return
    this._lastUpdateTime = now

    // 注意：dataBounds 由外部 setDataBounds() 驱动，避免与WebGL不一致
    
    // 更新画布大小
    if (this.konvaLayer && this.konvaLayer.stage) {
      this.canvasSize.width = this.konvaLayer.stage.width()
      this.canvasSize.height = this.konvaLayer.stage.height()
    }
    
    const robots = robotManager.getActiveRobots()
    for (const robot of robots) {
      if (robot.currentPosition) {
        // 如果机器人还没有标记，创建它
        if (!this.markers.has(robot.id)) {
          this.addRobot(
            robot.id, 
            robot.startPosition || robot.currentPosition,
            robot.color
          )
        }
        
        this.updateRobotPosition(
          robot.id,
          robot.currentPosition,
          robot.direction
        )

        const marker = this.markers.get(robot.id)
        if (marker && marker.startDataPosition) {
          const startCanvasPos = this.dataToCanvas(marker.startDataPosition.x, marker.startDataPosition.y)
          marker.startGroup.x(startCanvasPos.x)
          marker.startGroup.y(startCanvasPos.y)
        }
      }
    }

    this.konvaLayer.overlayLayer.batchDraw()
    this._boundsDirty = false
  }
  
  /**
   * 设置机器人焦点（高亮显示）
   */
  setFocus(robotId) {
    // 重置所有标记的透明度
    for (const [id, marker] of this.markers) {
      if (id === robotId) {
        marker.currentGroup.opacity(1)
        marker.startGroup.opacity(1)
      } else {
        marker.currentGroup.opacity(0.5)
        marker.startGroup.opacity(0.5)
      }
    }
    this.konvaLayer.overlayLayer.draw()
  }
  
  /**
   * 移除机器人标记
   */
  removeRobot(robotId) {
    const marker = this.markers.get(robotId)
    if (!marker) return
    
    // 停止动画
    const animations = this.animations.get(robotId)
    if (animations) {
      animations.pulseAnimation.stop()
      animations.glowAnimation.stop()
      this.animations.delete(robotId)
    }
    
    // 移除图形
    marker.startGroup.destroy()
    marker.currentGroup.destroy()
    
    this.markers.delete(robotId)
    this.konvaLayer.overlayLayer.draw()
  }
  
  /**
   * 清空所有标记
   */
  clear() {
    for (const robotId of this.markers.keys()) {
      this.removeRobot(robotId)
    }
  }
}
