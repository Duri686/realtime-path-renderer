// 标记样式配置
const MARKER_CONFIG = {
  START: {
    radius: 8,
    strokeWidth: 2,
    opacity: 0.8
  },
  CURRENT: {
    radius: 10,
    strokeWidth: 3,
    pulseRadius: 20,
    pulseOpacity: 0.3,
    animationInterval: 50  // 20fps动画
  },
  UPDATE_INTERVAL: 200,  // 位置更新间隔（降至200ms，减少开销）
  DATA_PADDING: 0.05     // 与WebGL一致
}

/**
 * 机器人标记管理器
 * 职责：管理机器人UI标记、动画、坐标转换
 */
export class RobotMarkers {
  constructor(konvaLayer) {
    this.konvaLayer = konvaLayer
    this.markers = new Map()
    
    // 全局动画管理器（所有机器人共享一个RAF循环）
    this.globalAnimation = null
    this.animationEnabled = true
    
    // WebGL标记模式（true=WebGL渲染，false=Konva渲染）
    this.useWebGLMarkers = true
    
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

    // 性能优化标志
    this._boundsDirty = false
    this._lastUpdateTime = 0
    this._updateIntervalMs = MARKER_CONFIG.UPDATE_INTERVAL
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
   * 数据坐标转换为画布坐标（与WebGL着色器一致）
   */
  dataToCanvas(dataX, dataY) {
    const { minX, minY, maxX, maxY } = this.dataBounds
    const { width, height } = this.canvasSize
    const { x: tx, y: ty, scale } = this.transform
    
    // 1. 归一化到[0,1]
    const rangeX = Math.max(1e-6, maxX - minX)
    const rangeY = Math.max(1e-6, maxY - minY)
    const nx = (dataX - minX) / rangeX
    const ny = (dataY - minY) / rangeY
    
    // 2. 应用padding
    const pad = MARKER_CONFIG.DATA_PADDING
    const px = (nx * (1 - 2 * pad) + pad) * width
    const py = (ny * (1 - 2 * pad) + pad) * height
    
    // 3. 应用视图变换
    return {
      x: (px + tx) * scale,
      y: (py + ty) * scale
    }
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
    
    // 保存引用
    const markerData = {
      color,
      dataPosition: { x: startPosition.x, y: startPosition.y },
      startDataPosition: { x: startPosition.x, y: startPosition.y }
    }
    
    // WebGL模式：起点也由WebGL渲染，不创建Konva起点标记
    if (!this.useWebGLMarkers) {
      // Konva模式：创建起点标记
      const canvasPos = this.dataToCanvas(startPosition.x, startPosition.y)
      
      const startGroup = new Konva.Group({
        x: canvasPos.x,
        y: canvasPos.y
      })
      
      const startCfg = MARKER_CONFIG.START
      const colorStr = `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`
      const startOuter = new Konva.Circle({
        radius: startCfg.radius,
        stroke: colorStr,
        strokeWidth: startCfg.strokeWidth,
        fill: `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, 0.2)`,
        opacity: startCfg.opacity
      })
      
      const startCenter = new Konva.Circle({
        radius: 3,
        fill: colorStr
      })
      
      startGroup.add(startOuter)
      startGroup.add(startCenter)
      this.konvaLayer.overlayLayer.add(startGroup)
      
      markerData.startGroup = startGroup
    }
    
    // 如果不使用WebGL标记，创建Konva当前位置标记
    if (!this.useWebGLMarkers) {
      const canvasPos = this.dataToCanvas(startPosition.x, startPosition.y)
      const currentGroup = new Konva.Group({
        x: canvasPos.x,
        y: canvasPos.y
      })
      
      const currentCfg = MARKER_CONFIG.CURRENT
      const colorRgba = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${currentCfg.pulseOpacity})`
      
      const pulseCircle = new Konva.Circle({
        radius: currentCfg.pulseRadius,
        fill: colorRgba,
        opacity: 0
      })
      
      const currentCircle = new Konva.Circle({
        radius: currentCfg.radius,
        fill: colorStr,
        stroke: '#ffffff',
        strokeWidth: currentCfg.strokeWidth
      })
      
      const directionArrow = new Konva.RegularPolygon({
        sides: 3,
        radius: 6,
        fill: '#ffffff',
        rotation: 0,
        offsetY: -currentCfg.radius - 5
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
      
      this.konvaLayer.overlayLayer.add(currentGroup)
      
      Object.assign(markerData, {
        currentGroup,
        pulseCircle,
        currentCircle,
        directionArrow,
        currentLabel
      })
      
      // 启动Konva动画
      this.startBreathingAnimation(robotId)
    }
    
    this.markers.set(robotId, markerData)
    
    this.konvaLayer.overlayLayer.draw()
  }
  
  /**
   * 启动全局动画循环（所有机器人共享）
   */
  startBreathingAnimation(robotId) {
    if (!this.animationEnabled) return
    
    // 如果全局动画未启动，启动它
    if (!this.globalAnimation && window.Konva) {
      this._startGlobalAnimation()
    }
  }
  
  /**
   * 启动全局动画（单一RAF循环管理所有机器人）
   */
  _startGlobalAnimation() {
    if (!window.Konva || this.globalAnimation) return
    
    let lastUpdateTime = 0
    const updateInterval = MARKER_CONFIG.CURRENT.animationInterval
    
    this.globalAnimation = new window.Konva.Animation((frame) => {
      if (!this.animationEnabled) return
      if (frame.time - lastUpdateTime < updateInterval) return
      lastUpdateTime = frame.time
      
      // 批量更新所有机器人的动画（只更新脉冲，移除昂贵的shadowBlur）
      for (const [robotId, marker] of this.markers) {
        if (!marker.pulseCircle) continue
        
        // 脉冲效果
        const scale = 1 + Math.sin(frame.time * 0.002) * 0.5
        const opacity = 0.5 - Math.sin(frame.time * 0.002) * 0.3
        marker.pulseCircle.scaleX(scale)
        marker.pulseCircle.scaleY(scale)
        marker.pulseCircle.opacity(opacity)
      }
    }, this.konvaLayer.overlayLayer)
    
    this.globalAnimation.start()
    console.log('RobotMarkers: 全局动画循环已启动')
  }
  
  /**
   * 更新机器人当前位置（WebGL模式下跳过）
   */
  updateRobotPosition(robotId, position, direction = 0) {
    const marker = this.markers.get(robotId)
    if (!marker) return
    
    // 保存数据坐标
    marker.dataPosition = { x: position.x, y: position.y }
    
    // WebGL模式：当前位置由WebGL渲染，不更新Konva标记
    if (this.useWebGLMarkers) return
    
    // Konva模式：更新当前位置标记
    if (!marker.currentGroup) return
    
    // 转换到画布坐标
    const canvasPos = this.dataToCanvas(position.x, position.y)
    
    // 平滑移动到新位置
    marker.currentGroup.x(canvasPos.x)
    marker.currentGroup.y(canvasPos.y)
    
    // 更新方向指示器
    if (direction !== undefined && marker.directionArrow) {
      marker.directionArrow.rotation(direction * 180 / Math.PI + 90)
    }
  }
  
  /**
   * 更新所有标记位置（当边界或画布大小改变时）
   */
  updateAllMarkerPositions() {
    // WebGL模式：所有标记由WebGL渲染，无需更新Konva对象
    if (this.useWebGLMarkers) return
    
    // Konva模式：更新起点和当前位置
    for (const [robotId, marker] of this.markers) {
      // 更新起点位置
      if (marker.startDataPosition && marker.startGroup) {
        const startCanvasPos = this.dataToCanvas(marker.startDataPosition.x, marker.startDataPosition.y)
        marker.startGroup.x(startCanvasPos.x)
        marker.startGroup.y(startCanvasPos.y)
      }
      
      // 更新当前位置标记
      if (marker.dataPosition && marker.currentGroup) {
        const canvasPos = this.dataToCanvas(marker.dataPosition.x, marker.dataPosition.y)
        marker.currentGroup.x(canvasPos.x)
        marker.currentGroup.y(canvasPos.y)
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
        
        // 更新机器人位置数据（WebGL模式只保存数据）
        this.updateRobotPosition(
          robot.id,
          robot.currentPosition,
          robot.direction
        )

        // Konva模式：更新起点标记位置
        if (!this.useWebGLMarkers) {
          const marker = this.markers.get(robot.id)
          if (marker && marker.startDataPosition && marker.startGroup) {
            const startCanvasPos = this.dataToCanvas(marker.startDataPosition.x, marker.startDataPosition.y)
            marker.startGroup.x(startCanvasPos.x)
            marker.startGroup.y(startCanvasPos.y)
          }
        }
      }
    }

    // Konva模式才需要重绘
    if (!this.useWebGLMarkers && this.konvaLayer) {
      this.konvaLayer.overlayLayer.batchDraw()
    }
    this._boundsDirty = false
  }
  
  /**
   * 设置机器人焦点（高亮显示）
   */
  setFocus(robotId) {
    // WebGL模式：焦点由WebGL着色器控制（未来可扩展）
    if (this.useWebGLMarkers) {
      console.log(`WebGL模式：焦点设置为机器人 ${robotId}`)
      return
    }
    
    // Konva模式：重置所有标记的透明度
    for (const [id, marker] of this.markers) {
      if (id === robotId) {
        marker.currentGroup?.opacity(1)
        marker.startGroup?.opacity(1)
      } else {
        marker.currentGroup?.opacity(0.5)
        marker.startGroup?.opacity(0.5)
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
    
    // 移除图形
    marker.startGroup?.destroy()
    marker.currentGroup?.destroy()
    this.markers.delete(robotId)
    
    // 如果没有机器人了，停止全局动画
    if (this.markers.size === 0 && this.globalAnimation) {
      this.globalAnimation.stop()
      this.globalAnimation = null
    }
    
    this.konvaLayer.overlayLayer.draw()
  }
  
  /**
   * 清空所有标记
   */
  clear() {
    // 停止全局动画
    if (this.globalAnimation) {
      this.globalAnimation.stop()
      this.globalAnimation = null
    }
    
    // 销毁所有标记
    for (const marker of this.markers.values()) {
      marker.startGroup?.destroy()
      marker.currentGroup?.destroy()
    }
    this.markers.clear()
    this.konvaLayer.overlayLayer.draw()
  }
}
