/**
 * Konva UI层 - 负责地图背景、网格、交互控制
 */
import Konva from 'konva'

export class KonvaLayer {
  constructor(container, size) {
    this.container = container
    this.size = size
    
    // Konva舞台和层
    this.stage = null
    this.backgroundLayer = null
    this.gridLayer = null
    this.overlayLayer = null
    
    // 视图变换
    this.transform = {
      x: 0,
      y: 0,
      scale: 1.0
    }
    
    // 网格配置
    this.gridConfig = {
      enabled: true,
      size: 50,
      color: '#333333',
      opacity: 0.5
    }
    
    // 回调函数
    this.onTransformChangeCallback = null
    this.pathTracker = null  // PathTracker引用（用于通知交互）
    
    // 交互状态
    this.isPanning = false
    this.lastPointerPosition = null
    
    // 性能优化：drawGrid节流
    this.lastGridDrawTime = 0
    this.gridDrawThrottle = 100 // 100ms内最多绘制一次网格
    
    this.init()
  }
  
  /**
   * 初始化Konva舞台
   */
  init() {
    // 创建舞台
    this.stage = new Konva.Stage({
      container: this.container,
      width: this.size.width,
      height: this.size.height
    })
    
    // 创建背景层
    this.backgroundLayer = new Konva.Layer()
    this.stage.add(this.backgroundLayer)
    
    // 创建网格层
    this.gridLayer = new Konva.Layer()
    this.stage.add(this.gridLayer)
    
    // 创建覆盖层（用于UI元素）
    this.overlayLayer = new Konva.Layer()
    this.stage.add(this.overlayLayer)
    
    // 初始化背景
    this.initBackground()
    
    // 初始化网格
    this.drawGrid()
    
    // 初始化UI元素
    this.initUIElements()
    
    // 设置交互
    this.setupInteraction()
  }
  
  /**
   * 初始化背景
   */
  initBackground() {
    // 不创建背景，让WebGL层可见
    // Konva层只用于UI交互和网格显示
    console.log('KonvaLayer: 背景层初始化（透明）')
  }
  
  /**
   * 绘制网格（带节流优化）
   */
  drawGrid(force = false) {
    if (!this.gridConfig.enabled) return
    
    // 节流：避免频繁重绘
    const now = performance.now()
    if (!force && now - this.lastGridDrawTime < this.gridDrawThrottle) {
      return
    }
    this.lastGridDrawTime = now
    
    this.gridLayer.destroyChildren()
    
    const gridSize = this.gridConfig.size * this.transform.scale
    const offsetX = this.transform.x % gridSize
    const offsetY = this.transform.y % gridSize
    
    // 垂直线
    for (let x = offsetX; x < this.size.width; x += gridSize) {
      const line = new Konva.Line({
        points: [x, 0, x, this.size.height],
        stroke: this.gridConfig.color,
        strokeWidth: 1,
        opacity: this.gridConfig.opacity * Math.min(this.transform.scale, 1)
      })
      this.gridLayer.add(line)
    }
    
    // 水平线
    for (let y = offsetY; y < this.size.height; y += gridSize) {
      const line = new Konva.Line({
        points: [0, y, this.size.width, y],
        stroke: this.gridConfig.color,
        strokeWidth: 1,
        opacity: this.gridConfig.opacity * Math.min(this.transform.scale, 1)
      })
      this.gridLayer.add(line)
    }
    
    this.gridLayer.draw()
  }
  
  /**
   * 初始化UI元素
   */
  initUIElements() {
    // 坐标显示
    this.coordinateText = new Konva.Text({
      x: 10,
      y: 10,
      text: 'X: 0, Y: 0',
      fontSize: 14,
      fontFamily: 'monospace',
      fill: '#00ff00',
      shadowColor: 'black',
      shadowBlur: 5,
      shadowOpacity: 0.7
    })
    
    // 缩放显示
    this.zoomText = new Konva.Text({
      x: 10,
      y: 30,
      text: 'Zoom: 100%',
      fontSize: 14,
      fontFamily: 'monospace',
      fill: '#00ff00',
      shadowColor: 'black',
      shadowBlur: 5,
      shadowOpacity: 0.7
    })
    
    // FPS显示
    this.fpsText = new Konva.Text({
      x: 10,
      y: 50,
      text: 'FPS: 0',
      fontSize: 14,
      fontFamily: 'monospace',
      fill: '#00ff00',
      shadowColor: 'black',
      shadowBlur: 5,
      shadowOpacity: 0.7
    })
    
    // 中心十字准星
    this.crosshair = new Konva.Group({
      x: this.size.width / 2,
      y: this.size.height / 2,
      visible: false
    })
    
    const horizontalLine = new Konva.Line({
      points: [-20, 0, 20, 0],
      stroke: '#ff0000',
      strokeWidth: 1,
      opacity: 0.5
    })
    
    const verticalLine = new Konva.Line({
      points: [0, -20, 0, 20],
      stroke: '#ff0000',
      strokeWidth: 1,
      opacity: 0.5
    })
    
    this.crosshair.add(horizontalLine)
    this.crosshair.add(verticalLine)
    
    // 小地图框架（可选）
    this.minimap = new Konva.Group({
      x: this.size.width - 210,
      y: 10,
      visible: false
    })
    
    const minimapBg = new Konva.Rect({
      width: 200,
      height: 150,
      fill: '#000000',
      opacity: 0.7,
      stroke: '#00ff00',
      strokeWidth: 1
    })
    
    this.minimap.add(minimapBg)
    
    // 添加到覆盖层
    this.overlayLayer.add(this.coordinateText)
    this.overlayLayer.add(this.zoomText)
    this.overlayLayer.add(this.fpsText)
    this.overlayLayer.add(this.crosshair)
    this.overlayLayer.add(this.minimap)
    this.overlayLayer.draw()
  }
  
  /**
   * 更新FPS显示
   */
  updateFPS(fps) {
    if (this.fpsText) {
      // 根据FPS值设置颜色（绿色=好，黄色=中等，红色=差）
      const color = fps >= 50 ? '#00ff00' : fps >= 30 ? '#ffff00' : '#ff0000'
      this.fpsText.fill(color)
      this.fpsText.text(`FPS: ${fps}`)
    }
  }
  
  /**
   * 设置交互
   */
  setupInteraction() {
    const stage = this.stage
    
    // 鼠标滚轮缩放
    stage.on('wheel', (e) => {
      e.evt.preventDefault()
      
      // 通知PathTracker用户正在交互
      this.pathTracker?.notifyUserInteractionStart()
      
      const oldScale = this.transform.scale
      const pointer = stage.getPointerPosition()
      const mousePointTo = {
        x: (pointer.x - this.transform.x) / oldScale,
        y: (pointer.y - this.transform.y) / oldScale
      }
      
      // 计算新的缩放级别
      let direction = e.evt.deltaY > 0 ? -1 : 1
      const scaleBy = 1.1
      const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy
      
      // 限制缩放范围
      this.transform.scale = Math.max(0.1, Math.min(10, newScale))
      
      // 调整位置以保持鼠标点不变
      this.transform.x = pointer.x - mousePointTo.x * this.transform.scale
      this.transform.y = pointer.y - mousePointTo.y * this.transform.scale
      
      this.updateTransform()
    })
    
    // 鼠标拖拽平移
    stage.on('mousedown', (e) => {
      if (e.evt.button === 0) { // 左键
        this.isPanning = true
        this.lastPointerPosition = stage.getPointerPosition()
        stage.container().style.cursor = 'grabbing'
        
        // 通知PathTracker用户正在交互
        this.pathTracker?.notifyUserInteractionStart()
      }
    })
    
    stage.on('mousemove', (e) => {
      const pointer = stage.getPointerPosition()
      
      // 更新坐标显示
      const worldX = (pointer.x - this.transform.x) / this.transform.scale
      const worldY = (pointer.y - this.transform.y) / this.transform.scale
      this.coordinateText.text(`X: ${worldX.toFixed(1)}, Y: ${worldY.toFixed(1)}`)
      this.overlayLayer.draw()
      
      // 处理拖拽
      if (this.isPanning && this.lastPointerPosition) {
        const dx = pointer.x - this.lastPointerPosition.x
        const dy = pointer.y - this.lastPointerPosition.y
        
        this.transform.x += dx
        this.transform.y += dy
        
        this.lastPointerPosition = pointer
        this.updateTransform()
      }
    })
    
    stage.on('mouseup', () => {
      this.isPanning = false
      this.lastPointerPosition = null
      stage.container().style.cursor = 'grab'
    })
    
    stage.on('mouseleave', () => {
      this.isPanning = false
      this.lastPointerPosition = null
      stage.container().style.cursor = 'default'
    })
    
    // H5触摸事件支持（移动端）
    stage.on('touchstart', (e) => {
      e.evt.preventDefault()
      const touch = e.evt.touches[0]
      this.isPanning = true
      this.lastPointerPosition = { x: touch.clientX, y: touch.clientY }
      
      // 通知PathTracker用户正在交互
      this.pathTracker?.notifyUserInteractionStart()
    })
    
    stage.on('touchmove', (e) => {
      e.evt.preventDefault()
      const touch = e.evt.touches[0]
      const pointer = { x: touch.clientX, y: touch.clientY }
      
      // 处理拖拽
      if (this.isPanning && this.lastPointerPosition) {
        const dx = pointer.x - this.lastPointerPosition.x
        const dy = pointer.y - this.lastPointerPosition.y
        
        this.transform.x += dx
        this.transform.y += dy
        
        this.lastPointerPosition = pointer
        this.updateTransform()
      }
    })
    
    stage.on('touchend', () => {
      this.isPanning = false
      this.lastPointerPosition = null
    })
    
    stage.on('touchcancel', () => {
      this.isPanning = false
      this.lastPointerPosition = null
    })
    
    // 初始鼠标样式
    stage.container().style.cursor = 'grab'
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      switch(e.key) {
        case 'g':
        case 'G':
          this.gridConfig.enabled = !this.gridConfig.enabled
          this.drawGrid(true) // 强制绘制
          break
        case 'c':
        case 'C':
          this.crosshair.visible(!this.crosshair.visible())
          this.overlayLayer.draw()
          break
        case 'm':
        case 'M':
          this.minimap.visible(!this.minimap.visible())
          this.overlayLayer.draw()
          break
        case 'r':
        case 'R':
          this.resetTransform()
          break
      }
    })
  }
  
  /**
   * 更新变换
   */
  updateTransform() {
    // 更新网格
    this.drawGrid()
    
    // 更新缩放显示
    this.zoomText.text(`Zoom: ${(this.transform.scale * 100).toFixed(0)}%`)
    this.overlayLayer.draw()
    
    // 触发回调
    if (this.onTransformChangeCallback) {
      this.onTransformChangeCallback(this.transform)
    }
  }
  
  /**
   * 重置变换
   */
  resetTransform() {
    this.transform = {
      x: 0,
      y: 0,
      scale: 1.0
    }
    this.updateTransform()
  }
  
  /**
   * 注册变换改变回调
   */
  onTransformChange(callback) {
    this.onTransformChangeCallback = callback
  }
  
  /**
   * 添加标记点（用于调试）
   */
  addMarker(x, y, color = '#ff0000') {
    const marker = new Konva.Circle({
      x: x * this.transform.scale + this.transform.x,
      y: y * this.transform.scale + this.transform.y,
      radius: 5,
      fill: color,
      opacity: 0.8
    })
    
    this.overlayLayer.add(marker)
    this.overlayLayer.draw()
    
    // 3秒后自动移除
    setTimeout(() => {
      marker.destroy()
      this.overlayLayer.draw()
    }, 3000)
  }
  
  /**
   * 调整大小
   */
  resize(width, height) {
    this.size.width = width
    this.size.height = height
    
    if (this.stage) {
      this.stage.width(width)
      this.stage.height(height)
      
      // 更新背景
      this.backgroundLayer.destroyChildren()
      this.initBackground()
      
      // 更新网格（强制立即绘制）
      this.drawGrid(true)
      
      // 更新十字准星位置
      this.crosshair.x(width / 2)
      this.crosshair.y(height / 2)
      
      // 更新小地图位置
      this.minimap.x(width - 210)
      
      this.overlayLayer.draw()
    }
  }
  
  /**
   * 销毁
   */
  destroy() {
    if (this.stage) {
      this.stage.destroy()
    }
  }
}
