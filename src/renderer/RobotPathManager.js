/**
 * 机器人路径管理器 - 管理多个机器人的独立路径
 */
export class RobotPathManager {
  constructor(maxRobots = 10, maxPointsPerRobot = 50000) {
    this.maxRobots = maxRobots
    this.maxPointsPerRobot = maxPointsPerRobot
    
    // 每个机器人的路径数据
    this.robots = new Map()
    
    // 当前聚焦的机器人ID
    this.focusedRobotId = 0
    
    // 机器人颜色池
    this.colorPool = []
    this.generateColorPool()
  }
  
  /**
   * 生成颜色池
   */
  generateColorPool() {
    const colors = [
      [1.0, 0.2, 0.2, 0.9],  // 红色
      [0.2, 1.0, 0.2, 0.9],  // 绿色
      [0.2, 0.2, 1.0, 0.9],  // 蓝色
      [1.0, 1.0, 0.2, 0.9],  // 黄色
      [1.0, 0.2, 1.0, 0.9],  // 紫色
      [0.2, 1.0, 1.0, 0.9],  // 青色
      [1.0, 0.6, 0.2, 0.9],  // 橙色
      [0.6, 0.2, 1.0, 0.9],  // 靛蓝
      [1.0, 0.4, 0.7, 0.9],  // 粉色
      [0.4, 1.0, 0.4, 0.9],  // 浅绿
    ]
    this.colorPool = colors
  }
  
  /**
   * 添加机器人
   */
  addRobot(robotId) {
    if (!this.robots.has(robotId)) {
      const colorIndex = this.robots.size % this.colorPool.length
      this.robots.set(robotId, {
        id: robotId,
        color: this.colorPool[colorIndex],
        points: [],
        vertices: new Float32Array(this.maxPointsPerRobot * 2),
        colors: new Float32Array(this.maxPointsPerRobot * 4),
        pointCount: 0,
        startPosition: null,
        currentPosition: null,
        isActive: true
      })
    }
    return this.robots.get(robotId)
  }
  
  /**
   * 添加点到机器人路径
   */
  addPoint(robotId, x, y, color = null) {
    let robot = this.robots.get(robotId)
    if (!robot) {
      robot = this.addRobot(robotId)
    }
    
    // 记录起始位置
    if (!robot.startPosition) {
      robot.startPosition = { x, y }
      console.log(`机器人${robotId}起始位置: (${x.toFixed(0)}, ${y.toFixed(0)})`)
    }
    
    // 更新当前位置
    robot.currentPosition = { x, y }
    
    // 如果超过最大点数，移除最旧的点
    if (robot.pointCount >= this.maxPointsPerRobot) {
      // 左移数组，丢弃最旧的点
      robot.vertices.copyWithin(0, 2)
      robot.colors.copyWithin(0, 4)
      robot.pointCount--
    }
    
    // 添加新点
    const vertexIndex = robot.pointCount * 2
    const colorIndex = robot.pointCount * 4
    
    robot.vertices[vertexIndex] = x
    robot.vertices[vertexIndex + 1] = y
    
    const c = color || robot.color
    robot.colors[colorIndex] = c[0]
    robot.colors[colorIndex + 1] = c[1]
    robot.colors[colorIndex + 2] = c[2]
    robot.colors[colorIndex + 3] = c[3]
    
    robot.pointCount++
    
    return robot
  }
  
  /**
   * 批量添加点
   */
  addPoints(points) {
    // 按robotId分组
    const grouped = {}
    for (const point of points) {
      const robotId = point.robotId || 0
      if (!grouped[robotId]) {
        grouped[robotId] = []
      }
      grouped[robotId].push(point)
    }
    
    // 添加到各个机器人
    for (const [robotId, robotPoints] of Object.entries(grouped)) {
      for (const point of robotPoints) {
        this.addPoint(
          parseInt(robotId), 
          point.x, 
          point.y,
          point.color ? [point.r, point.g, point.b, point.a] : null
        )
      }
    }
  }
  
  /**
   * 获取机器人数据用于渲染
   */
  getRobotData(robotId) {
    return this.robots.get(robotId)
  }
  
  /**
   * 获取所有激活的机器人
   */
  getActiveRobots() {
    return Array.from(this.robots.values()).filter(r => r.isActive)
  }
  
  /**
   * 设置聚焦的机器人
   */
  setFocusedRobot(robotId) {
    this.focusedRobotId = robotId
    return this.robots.get(robotId)
  }
  
  /**
   * 获取聚焦机器人的当前位置
   */
  getFocusedPosition() {
    const robot = this.robots.get(this.focusedRobotId)
    return robot ? robot.currentPosition : null
  }
  
  /**
   * 清空某个机器人的路径
   */
  clearRobotPath(robotId) {
    const robot = this.robots.get(robotId)
    if (robot) {
      robot.points = []
      robot.pointCount = 0
      robot.startPosition = null
      robot.currentPosition = null
    }
  }
  
  /**
   * 清空所有路径
   */
  clearAll() {
    for (const robot of this.robots.values()) {
      this.clearRobotPath(robot.id)
    }
  }
  
  /**
   * 获取边界框
   */
  getBoundingBox() {
    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity
    
    for (const robot of this.robots.values()) {
      for (let i = 0; i < robot.pointCount; i++) {
        const x = robot.vertices[i * 2]
        const y = robot.vertices[i * 2 + 1]
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    
    return { minX, minY, maxX, maxY }
  }
}
