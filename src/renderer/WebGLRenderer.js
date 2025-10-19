import { RobotPathManager } from './RobotPathManager.js'

/**
 * WebGL渲染器 - 负责高性能路径渲染
 * 使用环形缓冲区和增量更新优化
 */
export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas
    this.gl = null
    
    // 最大点数（预分配缓冲区大小，GPU预算阈值）
    this.MAX_POINTS = 120000
    
    // 机器人路径管理器
    this.robotManager = new RobotPathManager(10, 50000)
    
    // 环形缓冲区管理（保留用于兼容）
    this.ringBuffer = {
      vertices: null,      // Float32Array - 存储顶点位置
      colors: null,        // Float32Array - 存储顶点颜色
      writeIndex: 0,       // 当前写入位置
      pointCount: 0,       // 当前点数
      dirty: false         // 是否需要更新GPU缓冲区
    }
    // 关闭环形缓冲上传（仅保留兼容代码不上传），性能优先
    this._useRingBuffer = false
    
    // WebGL资源
    this.program = null
    this.buffers = {
      position: null,
      color: null
    }
    this.uniforms = {}
    
    // 视图变换
    this.transform = {
      scale: 1.0,
      translateX: 0,
      translateY: 0
    }
    
    // 数据边界（用于自动缩放）
    this.dataBounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      initialized: false
    }
    
    // 渲染配置
    this.pointSize = 5.0  // 点的大小
    this.lineWidth = 2.5
    this.renderMode = 'lines' // 连续线条模式

    // 调试与打包状态
    this.debug = false
    this._needsPack = false
    this._stagingPos = new Float32Array(this.MAX_POINTS * 2)
    this._stagingColorU8 = new Uint8Array(this.MAX_POINTS * 4)
    this._packedDraws = [] // {start, count} per robot
    this._packedTotal = 0
    this._gpuDirty = false
  }
  
  /**
   * 初始化WebGL上下文和资源
   */
  init() {
    // 获取WebGL2上下文
    this.gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    })
    
    if (!this.gl) {
      throw new Error('WebGL2 not supported')
    }
    
    const gl = this.gl
    
    // 设置视口（确保使用canvas的实际尺寸，含DPR）
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
    const cssW = this.canvas.clientWidth || this.canvas.width
    const cssH = this.canvas.clientHeight || this.canvas.height
    this.canvas.width = Math.max(1, Math.round(cssW * dpr))
    this.canvas.height = Math.max(1, Math.round(cssH * dpr))
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    
    console.debug('WebGL: 初始化视口', {
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      clientWidth: this.canvas.clientWidth,
      clientHeight: this.canvas.clientHeight,
      dpr
    })
    
    // 启用混合
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    
    // 设置线宽（注意：WebGL2可能不支持大于1的线宽）
    gl.lineWidth(this.lineWidth)
    
    // 设置清空颜色为深灰色（便于看到绿色的点）
    gl.clearColor(0.1, 0.1, 0.1, 1.0)
    
    console.debug('WebGL: 初始化完成', {
      viewport: [this.canvas.width, this.canvas.height],
      blendEnabled: gl.isEnabled(gl.BLEND)
    })
    
    // 初始化着色器程序
    this.initShaders()
    
    // 初始化缓冲区
    this.initBuffers()
    
    // 初始化环形缓冲区数据
    this.initRingBuffer()
  }
  
  /**
   * 初始化着色器
   */
  initShaders() {
    const gl = this.gl
    
    // 顶点着色器源码
    const vertexShaderSource = `#version 300 es
      precision highp float;
      
      // 顶点属性
      in vec2 a_position;  // 世界坐标
      in vec4 a_color;     // 顶点颜色
      
      // 统一变量
      uniform vec2 u_resolution;     // 画布分辨率
      uniform vec2 u_dataMin;        // 数据最小边界
      uniform vec2 u_dataMax;        // 数据最大边界
      uniform vec2 u_viewTranslate;  // 视图平移
      uniform float u_viewScale;     // 视图缩放
      uniform float u_pointSize;
      
      // 输出到片段着色器
      out vec4 v_color;
      
      void main() {
        // 1) 归一化到[0,1]
        vec2 dataRange = u_dataMax - u_dataMin;
        dataRange = max(dataRange, vec2(1e-6));
        vec2 normalizedPos = (a_position - u_dataMin) / dataRange;
        // 2) padding
        float padding = 0.05;
        vec2 paddedPos = normalizedPos * (1.0 - 2.0 * padding) + padding;
        // 3) 应用视图变换（在像素空间）
        vec2 canvasPos = paddedPos * u_resolution;
        vec2 transformedPos = (canvasPos + u_viewTranslate) * u_viewScale;
        // 4) 转裁剪坐标
        vec2 clipSpace = (transformedPos / u_resolution) * 2.0 - 1.0;
        clipSpace.y *= -1.0;
        gl_Position = vec4(clipSpace, 0.0, 1.0);
        gl_PointSize = u_pointSize * u_viewScale;
        v_color = a_color;
      }
    `
    
    // 片段着色器源码
    const fragmentShaderSource = `#version 300 es
      precision highp float;
      
      // 从顶点着色器接收
      in vec4 v_color;
      
      // 输出颜色
      out vec4 fragColor;
      
      void main() {
        // 圆形点渲染（使用点精灵）
        if (length(gl_PointCoord - vec2(0.5)) > 0.5) {
          discard;
        }
        
        fragColor = v_color;
      }
    `
    
    // 编译着色器
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource)
    
    // 创建着色器程序
    this.program = gl.createProgram()
    gl.attachShader(this.program, vertexShader)
    gl.attachShader(this.program, fragmentShader)
    gl.linkProgram(this.program)
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error('Failed to link shader program: ' + gl.getProgramInfoLog(this.program))
    }
    
    // 获取attribute和uniform位置
    this.attributes = {
      position: gl.getAttribLocation(this.program, 'a_position'),
      color: gl.getAttribLocation(this.program, 'a_color')
    }
    
    this.uniforms = {
      resolution: gl.getUniformLocation(this.program, 'u_resolution'),
      dataMin: gl.getUniformLocation(this.program, 'u_dataMin'),
      dataMax: gl.getUniformLocation(this.program, 'u_dataMax'),
      viewTranslate: gl.getUniformLocation(this.program, 'u_viewTranslate'),
      viewScale: gl.getUniformLocation(this.program, 'u_viewScale'),
      pointSize: gl.getUniformLocation(this.program, 'u_pointSize')
    }
  }
  
  /**
   * 编译单个着色器
   */
  compileShader(type, source) {
    const gl = this.gl
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('Shader compilation failed: ' + gl.getShaderInfoLog(shader))
    }
    
    return shader
  }
  
  /**
   * 初始化缓冲区
   */
  initBuffers() {
    const gl = this.gl
    
    // 创建顶点缓冲区
    this.buffers.position = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position)
    gl.bufferData(gl.ARRAY_BUFFER, this.MAX_POINTS * 2 * 4, gl.STREAM_DRAW) // 2 floats per point
    
    // 创建颜色缓冲区
    this.buffers.color = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color)
    gl.bufferData(gl.ARRAY_BUFFER, this.MAX_POINTS * 4, gl.STREAM_DRAW) // 4 u8 per color
    
    // 创建VAO
    this.vao = gl.createVertexArray()
    gl.bindVertexArray(this.vao)
    
    // 设置顶点属性
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position)
    gl.enableVertexAttribArray(this.attributes.position)
    gl.vertexAttribPointer(this.attributes.position, 2, gl.FLOAT, false, 0, 0)
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color)
    gl.enableVertexAttribArray(this.attributes.color)
    gl.vertexAttribPointer(this.attributes.color, 4, gl.UNSIGNED_BYTE, true, 0, 0)
    
    gl.bindVertexArray(null)
  }
  
  /**
   * 初始化环形缓冲区
   */
  initRingBuffer() {
    this.ringBuffer.vertices = new Float32Array(this.MAX_POINTS * 2)
    this.ringBuffer.colors = new Float32Array(this.MAX_POINTS * 4)
    for (let i = 0; i < this.MAX_POINTS; i++) {
      const ci = i * 4
      this.ringBuffer.colors[ci] = 0.0
      this.ringBuffer.colors[ci + 1] = 1.0
      this.ringBuffer.colors[ci + 2] = 0.0
      this.ringBuffer.colors[ci + 3] = 0.7
    }
    this.ringBuffer.writeIndex = 0
    this.ringBuffer.pointCount = 0
    this.ringBuffer.dirty = false
  }

  /**
   * 更新视图变换（供外部交互调用，如 Konva 缩放/平移）
   */
  updateTransform(transform) {
    this.transform.scale = (transform && typeof transform.scale === 'number') ? transform.scale : 1.0
    this.transform.translateX = (transform && typeof transform.x === 'number') ? transform.x : 0
    this.transform.translateY = (transform && typeof transform.y === 'number') ? transform.y : 0
  }

  /**
   * 更新点数据（从Worker接收处理后的数据）
   */
  updatePoints(data) {
    if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.time('[PERF_DEGRADE] updatePoints');
    const dataView = new DataView(data)
    const pointCount = dataView.getUint32(0, true)
    
    if (this.debug) {
      console.log('WebGL: 接收点数据', { pointCount, bufferSize: data.byteLength })
    }
    if (pointCount === 0) {
        if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.timeEnd('[PERF_DEGRADE] updatePoints');
        return;
    }
    
    // 读取点数据（每个点7个float：x, y, r, g, b, a, robotId）
    const pointsData = new Float32Array(data, 4, pointCount * 7)
    if (this.debug && pointCount > 0) {
      console.log('WebGL: 第一个点数据', {
        x: pointsData[0], y: pointsData[1], r: pointsData[2], g: pointsData[3], b: pointsData[4], a: pointsData[5], robotId: pointsData[6]
      })
    }
    
    // 解析点数据并按机器人分组 -> 添加到路径管理器
    const points = []
    for (let i = 0; i < pointCount; i++) {
      const base = i * 7
      points.push({
        x: pointsData[base],
        y: pointsData[base + 1],
        r: pointsData[base + 2],
        g: pointsData[base + 3],
        b: pointsData[base + 4],
        a: pointsData[base + 5],
        robotId: Math.floor(pointsData[base + 6])
      })
    }
    this.robotManager.addPoints(points)
    
    // 更新数据边界
    const bounds = this.robotManager.getBoundingBox()
    if (bounds.minX !== Infinity) {
      this.dataBounds.minX = bounds.minX
      this.dataBounds.maxX = bounds.maxX
      this.dataBounds.minY = bounds.minY
      this.dataBounds.maxY = bounds.maxY
      this.dataBounds.initialized = true
    }
    if (this.debug) {
      if (!this._updateCount) this._updateCount = 0
      this._updateCount++
      if (this._updateCount % 20 === 0) {
        console.log('WebGL: 路径边界', {
          minX: this.dataBounds.minX.toFixed(0), maxX: this.dataBounds.maxX.toFixed(0),
          minY: this.dataBounds.minY.toFixed(0), maxY: this.dataBounds.maxY.toFixed(0),
          robotCount: this.robotManager.getActiveRobots().length,
          canvasSize: { w: this.canvas.width, h: this.canvas.height }
        })
      }
    }
    
    // 标记需要重新打包并上传GPU
    this._needsPack = true
    if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.timeEnd('[PERF_DEGRADE] updatePoints');
  }

  /**
   * 兼容旧环形缓冲上传（当前关闭）
   */
  uploadBufferData() {
    if (!this._useRingBuffer || !this.ringBuffer.dirty) return
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.ringBuffer.vertices.subarray(0, this.ringBuffer.pointCount * 2))
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color)
    // 注意：颜色缓冲已改为U8，此路径仅作兼容
    const colorSlice = new Uint8Array(this.ringBuffer.pointCount * 4)
    for (let i = 0; i < this.ringBuffer.pointCount * 4; i++) {
      colorSlice[i] = Math.min(255, Math.max(0, Math.round(this.ringBuffer.colors[i] * 255)))
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, colorSlice)
    this.ringBuffer.dirty = false
  }

  /**
   * 将所有机器人的路径打包到连续暂存缓冲，减少到每帧2次上传
   */
  _packRobotsToStaging() {
    if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.time('[PERF_DEGRADE] _packRobotsToStaging');
    const robots = this.robotManager.getActiveRobots()
    this._packedDraws.length = 0
    let total = 0
    for (const r of robots) total += r.pointCount
    // 超额时对每机器人均分预算，保留末尾
    let perCap = Infinity
    if (total > this.MAX_POINTS) {
      perCap = Math.max(1, Math.floor(this.MAX_POINTS / Math.max(1, robots.length)))
    }
    let write = 0
    for (const r of robots) {
      const count = r.pointCount
      if (count <= 0) { this._packedDraws.push({ start: write, count: 0 }); continue }
      const keep = perCap === Infinity ? count : Math.min(count, perCap)
      const startIndex = (count - keep) * 2
      const endIndex = count * 2
      // 位置
      this._stagingPos.set(r.vertices.subarray(startIndex, endIndex), write * 2)
      // 颜色（float -> u8）
      const cStart = (count - keep) * 4
      for (let i = 0; i < keep; i++) {
        const src = cStart + i * 4
        const dst = (write + i) * 4
        this._stagingColorU8[dst]     = Math.min(255, Math.max(0, Math.round(r.colors[src]     * 255)))
        this._stagingColorU8[dst + 1] = Math.min(255, Math.max(0, Math.round(r.colors[src + 1] * 255)))
        this._stagingColorU8[dst + 2] = Math.min(255, Math.max(0, Math.round(r.colors[src + 2] * 255)))
        this._stagingColorU8[dst + 3] = Math.min(255, Math.max(0, Math.round(r.colors[src + 3] * 255)))
      }
      this._packedDraws.push({ start: write, count: keep })
      write += keep
      if (write >= this.MAX_POINTS) break
    }
    this._packedTotal = write
    this._needsPack = false
    if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.timeEnd('[PERF_DEGRADE] _packRobotsToStaging');
  }

  /**
   * 渲染每个机器人的路径
   */
  renderRobotPaths(totalPoints = 0) {
    const logSuffix = ` | totalPoints: ${totalPoints}`;
    if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.time(`[PERF_DEGRADE] renderRobotPaths${logSuffix}`);
    const gl = this.gl
    const robots = this.robotManager.getActiveRobots()
    if (robots.length === 0 || !this.dataBounds.initialized) {
        if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.timeEnd(`[PERF_DEGRADE] renderRobotPaths${logSuffix}`);
        return;
    }
    
    gl.useProgram(this.program)
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
    gl.uniform2f(this.uniforms.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.uniform2f(this.uniforms.dataMin, this.dataBounds.minX, this.dataBounds.minY)
    gl.uniform2f(this.uniforms.dataMax, this.dataBounds.maxX, this.dataBounds.maxY)
    gl.uniform2f(this.uniforms.viewTranslate, this.transform.translateX * dpr, this.transform.translateY * dpr)
    gl.uniform1f(this.uniforms.viewScale, this.transform.scale)
    gl.uniform1f(this.uniforms.pointSize, this.pointSize)
    
    gl.bindVertexArray(this.vao)
    if (this._needsPack) { this._packRobotsToStaging(); this._gpuDirty = true }
    if (this._gpuDirty && this._packedTotal > 0) {
      if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.time(`[PERF_DEGRADE] GPU Upload${logSuffix}`);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._stagingPos.subarray(0, this._packedTotal * 2))
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._stagingColorU8.subarray(0, this._packedTotal * 4))
      this._gpuDirty = false
      if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.timeEnd(`[PERF_DEGRADE] GPU Upload${logSuffix}`);
    }
    if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.time(`[PERF_DEGRADE] Draw Calls${logSuffix}`);
    for (const seg of this._packedDraws) {
      if (seg.count > 1) {
        gl.drawArrays(gl.LINE_STRIP, seg.start, seg.count)
      }
    }
    if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.timeEnd(`[PERF_DEGRADE] Draw Calls${logSuffix}`);
    gl.bindVertexArray(null)
    if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.timeEnd(`[PERF_DEGRADE] renderRobotPaths${logSuffix}`);
  }
  
  /**
   * 渲染一帧
   */
  render() {
    const totalPoints = this.robotManager ? this.robotManager.getTotalPoints() : 0;
    const logSuffix = ` | totalPoints: ${totalPoints}`;
    if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.time(`[PERF_DEGRADE] render${logSuffix}`);
    const gl = this.gl
    
    // 清空画布
    gl.clear(gl.COLOR_BUFFER_BIT)
    
    // 渲染机器人路径（如果有）
    const hasRobotPaths = this.robotManager.getActiveRobots().length > 0
    if (hasRobotPaths) {
      this.renderRobotPaths(totalPoints)
    }
    
    // 如果没有机器人路径数据，渲染测试点和环形缓冲区数据
    if (!hasRobotPaths) {
      // 渲染测试点（十字星）
      this.renderTestPoints()
      
      // 渲染环形缓冲区数据（如果有）
      if (this.ringBuffer.pointCount > 0) {
        this.renderRingBuffer()
      }
    }
    if (typeof window !== 'undefined' && window.__PERF_VERBOSE__) console.timeEnd(`[PERF_DEGRADE] render${logSuffix}`);
  }
  
  /**
   * 渲染环形缓冲区数据
   */
  renderRingBuffer() {
    const gl = this.gl
    
    // 每100帧输出一次渲染信息
    if (!this._frameCounter) this._frameCounter = 0
    this._frameCounter++
    if (this._frameCounter % 100 === 0) {
      console.debug('WebGL: 渲染环形缓冲区', {
        pointCount: this.ringBuffer.pointCount,
        canvasSize: { width: this.canvas.width, height: this.canvas.height },
        transform: this.transform
      })
    }
    
    // 使用着色器程序
    gl.useProgram(this.program)
    
    // 设置uniform变量（使用绘制缓冲区分辨率 + 数据边界），并按DPR缩放平移
    const dpr2 = Math.max(1, Math.floor(window.devicePixelRatio || 1))
    const minX = this.dataBounds.initialized ? this.dataBounds.minX : 0
    const minY = this.dataBounds.initialized ? this.dataBounds.minY : 0
    const maxX = this.dataBounds.initialized ? this.dataBounds.maxX : this.canvas.width
    const maxY = this.dataBounds.initialized ? this.dataBounds.maxY : this.canvas.height
    gl.uniform2f(this.uniforms.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.uniform2f(this.uniforms.dataMin, minX, minY)
    gl.uniform2f(this.uniforms.dataMax, maxX, maxY)
    gl.uniform2f(this.uniforms.viewTranslate, this.transform.translateX * dpr2, this.transform.translateY * dpr2)
    gl.uniform1f(this.uniforms.viewScale, this.transform.scale)
    gl.uniform1f(this.uniforms.pointSize, this.pointSize)
    
    // 绑定VAO并绘制
    gl.bindVertexArray(this.vao)
    
    // 根据渲染模式选择绘制方式
    switch (this.renderMode) {
      case 'lines':
        // 使用LINE_STRIP绘制连续路径
        if (this.ringBuffer.pointCount > 1) {
          gl.drawArrays(gl.LINE_STRIP, 0, this.ringBuffer.pointCount)
        }
        break
      case 'triangles':
        // TODO: 实现三角形带渲染（需要额外的索引缓冲区）
        gl.drawArrays(gl.TRIANGLES, 0, this.ringBuffer.pointCount)
        break
      case 'points':
      default:
        gl.drawArrays(gl.POINTS, 0, this.ringBuffer.pointCount)
        break
    }
    
    // 检查WebGL错误
    const error = gl.getError()
    if (error !== gl.NO_ERROR) {
      console.error('WebGL Error:', error)
    }
    
    gl.bindVertexArray(null)
  }
  
  /**
   * 创建变换矩阵（3x3） - 已废弃，但保留以兼容旧代码
   * 注意：WebGL使用列主序矩阵
   */
  createTransformMatrix(scale, translateX, translateY) {
    // 列主序矩阵：
    // | scale   0      translateX |
    // | 0       scale  translateY |
    // | 0       0      1          |
    return new Float32Array([
      scale, 0, 0,        // 第一列
      0, scale, 0,        // 第二列
      translateX, translateY, 1  // 第三列
    ])
  }
  
  /**
   * 渲染测试点（验证坐标系）
   */
  renderTestPoints() {
    const gl = this.gl
    
    // 获取当前实际Canvas尺寸
    const currentWidth = this.gl.drawingBufferWidth
    const currentHeight = this.gl.drawingBufferHeight
    
    // 测试数据：在屏幕中心绘制一个十字
    const testVertices = new Float32Array([
      // 水平线
      100, currentHeight / 2,
      currentWidth - 100, currentHeight / 2,
      // 垂直线
      currentWidth / 2, 100,
      currentWidth / 2, currentHeight - 100,
      // 中心点
      currentWidth / 2, currentHeight / 2
    ])
    
    const testColors = new Float32Array([
      1, 0, 0, 1,  // 红色
      1, 0, 0, 1,
      0, 1, 0, 1,  // 绿色
      0, 1, 0, 1,
      0, 0, 1, 1   // 蓝色
    ])
    const testColorsU8 = new Uint8Array(testColors.length)
    for (let i = 0; i < testColors.length; i++) {
      testColorsU8[i] = Math.min(255, Math.max(0, Math.round(testColors[i] * 255)))
    }
    
    // 更新缓冲区
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, testVertices)
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, testColorsU8)
    
    // 使用着色器
    gl.useProgram(this.program)
    gl.uniform2f(this.uniforms.resolution, currentWidth, currentHeight)
    gl.uniform2f(this.uniforms.dataMin, 0, 0)
    gl.uniform2f(this.uniforms.dataMax, currentWidth, currentHeight)
    gl.uniform2f(this.uniforms.viewTranslate, 0, 0)
    gl.uniform1f(this.uniforms.viewScale, 1.0)
    gl.uniform1f(this.uniforms.pointSize, 20.0)
    
    // 绘制
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.LINES, 0, 4)  // 画两条线
    gl.drawArrays(gl.POINTS, 4, 1) // 画中心点
    
    // 每100帧输出一次测试点信息
    if (!this._testFrameCounter) this._testFrameCounter = 0
    this._testFrameCounter++
    if (this._testFrameCounter % 100 === 0) {
      console.debug('WebGL: 测试点渲染', {
        canvasSize: { w: currentWidth, h: currentHeight },
        centerPoint: { x: currentWidth / 2, y: currentHeight / 2 },
        uniforms: {
          resolution: [currentWidth, currentHeight],
          dataMin: [0, 0],
          dataMax: [currentWidth, currentHeight],
          viewTranslate: [0, 0],
          viewScale: 1.0
        },
        testVertices: {
          centerX: currentWidth / 2,
          centerY: currentHeight / 2,
          horizontalLine: `(100, ${currentHeight/2}) to (${currentWidth-100}, ${currentHeight/2})`,
          verticalLine: `(${currentWidth/2}, 100) to (${currentWidth/2}, ${currentHeight-100})`
        }
      })
    }
  }
  
  /**
   * 调整画布大小
   */
  resize(width, height) {
    // 处理高DPR屏幕，确保绘制缓冲区尺寸与CSS尺寸匹配
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
    const dw = Math.max(1, Math.round(width * dpr))
    const dh = Math.max(1, Math.round(height * dpr))

    // 设置绘制缓冲区尺寸
    this.canvas.width = dw
    this.canvas.height = dh

    if (this.gl) {
      this.gl.viewport(0, 0, dw, dh)
      console.debug('WebGL: Canvas调整大小', { cssWidth: width, cssHeight: height, dpr, drawingBuffer: { w: dw, h: dh } })
    }
  }
  
  /**
   * 清空所有点
   */
  clear() {
    this.ringBuffer.writeIndex = 0
    this.ringBuffer.pointCount = 0
    this.ringBuffer.dirty = false
    if (this.robotManager && typeof this.robotManager.clearAll === 'function') {
      this.robotManager.clearAll()
    }
    this.dataBounds.minX = Infinity
    this.dataBounds.maxX = -Infinity
    this.dataBounds.minY = Infinity
    this.dataBounds.maxY = -Infinity
    this.dataBounds.initialized = false
    if (this.gl) {
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    }
  }
  
  /**
   * 销毁渲染器，释放资源
   */
  destroy() {
    const gl = this.gl
    
    if (gl) {
      gl.deleteBuffer(this.buffers.position)
      gl.deleteBuffer(this.buffers.color)
      gl.deleteVertexArray(this.vao)
      gl.deleteProgram(this.program)
    }
    
    this.ringBuffer.vertices = null
    this.ringBuffer.colors = null
  }
}
