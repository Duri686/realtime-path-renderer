/**
 * 真实机器人运动模拟器 - Worker 版本
 * 在后台线程中运行，避免阻塞主线程。
 */
class RealRobotSimulator {
  constructor(config = {}) {
    this.config = {
      pushInterval: 50,
      pointsPerPush: config.pointsPerPush ?? 3,
      pixelsPerMeter: 100,
      baseSpeed: 0.75,
      speedVariation: 0.25,
      directionChangeRate: 0.02,
      maxTurnAngle: Math.PI / 6,
      smoothingFactor: 0.3,
      robotCount: config.robotCount || 1,
      canvasWidth: config.canvasWidth || 1600,
      canvasHeight: config.canvasHeight || 1200,
      ...config
    }
    this.isRunning = false
    this.intervalId = null
    this.totalPointsSent = 0
    this.startTime = 0
    this.robots = []
    this.initRobots()
    this.messageCallback = null
  }

  initRobots() {
    this.robots = []; // Clear existing robots before re-initializing
    const centerX = this.config.canvasWidth / 2
    const centerY = this.config.canvasHeight / 2
    for (let i = 0; i < this.config.robotCount; i++) {
      const angle = (i / this.config.robotCount) * Math.PI * 2
      const startRadius = 50
      this.robots.push({
        id: i,
        x: centerX + Math.cos(angle) * startRadius,
        y: centerY + Math.sin(angle) * startRadius,
        speed: this.config.baseSpeed,
        direction: angle + Math.random() * Math.PI / 4,
        targetDirection: angle,
        totalDistance: 0,
        pathHistory: [],
        maxHistorySize: 10,
        hue: (i / this.config.robotCount) * 360,
        color: this.hslToRgb((i / this.config.robotCount) * 360, 80, 50)
      })
    }
  }

  generateNextPoints() {
    const points = []
    const currentTime = Date.now()
    const deltaTime = this.config.pushInterval / 1000
    for (const robot of this.robots) {
      const pointCount = (Number.isFinite(this.config.pointsPerPush) && this.config.pointsPerPush > 0)
        ? Math.max(1, Math.floor(this.config.pointsPerPush))
        : (Math.floor(Math.random() * 4) + 1)
      for (let i = 0; i < pointCount; i++) {
        const t = (i + 1) / (pointCount + 1)
        const stepTime = deltaTime * t
        this.updateRobotMotion(robot, stepTime)
        const point = {
          id: `r${robot.id}_${currentTime}_${i}`,
          robotId: robot.id,
          timestamp: currentTime + stepTime * 1000,
          x: robot.x,
          y: robot.y,
          direction: robot.direction,
          speed: robot.speed,
          r: robot.color.r / 255,
          g: robot.color.g / 255,
          b: robot.color.b / 255,
          a: 0.9
        }
        points.push(point)
        robot.pathHistory.push({ x: robot.x, y: robot.y })
        if (robot.pathHistory.length > robot.maxHistorySize) {
          robot.pathHistory.shift()
        }
      }
    }
    return points
  }

  updateRobotMotion(robot, deltaTime) {
    if (Math.random() < 0.1) {
      robot.targetDirection += (Math.random() - 0.5) * this.config.maxTurnAngle
    }
    let directionDiff = robot.targetDirection - robot.direction
    while (directionDiff > Math.PI) directionDiff -= Math.PI * 2
    while (directionDiff < -Math.PI) directionDiff += Math.PI * 2
    robot.direction += directionDiff * this.config.directionChangeRate
    const speedNoise = (Math.random() - 0.5) * this.config.speedVariation * 2
    robot.speed = Math.max(0.3, Math.min(1.2, this.config.baseSpeed + speedNoise))
    const distance = robot.speed * deltaTime * this.config.pixelsPerMeter
    const dx = Math.cos(robot.direction) * distance
    const dy = Math.sin(robot.direction) * distance
    if (robot.pathHistory.length > 2) {
      const smoothing = this.config.smoothingFactor
      const lastPoint = robot.pathHistory[robot.pathHistory.length - 1]
      robot.x = lastPoint.x * (1 - smoothing) + (robot.x + dx) * smoothing
      robot.y = lastPoint.y * (1 - smoothing) + (robot.y + dy) * smoothing
    } else {
      robot.x += dx
      robot.y += dy
    }
    const margin = 100
    const maxX = this.config.canvasWidth - margin
    const maxY = this.config.canvasHeight - margin
    if (robot.x < margin) {
      robot.targetDirection = 0
      robot.x = Math.max(margin, robot.x)
    } else if (robot.x > maxX) {
      robot.targetDirection = Math.PI
      robot.x = Math.min(maxX, robot.x)
    }
    if (robot.y < margin) {
      robot.targetDirection = Math.PI / 2
      robot.y = Math.max(margin, robot.y)
    } else if (robot.y > maxY) {
      robot.targetDirection = -Math.PI / 2
      robot.y = Math.min(maxY, robot.y)
    }
    robot.totalDistance += distance / this.config.pixelsPerMeter
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.startTime = Date.now()
    this.totalPointsSent = 0
    this._applyInterval()
  }

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
        // Correctly transfer the ArrayBuffer
        this.messageCallback(buffer, [buffer])
      }
      if (this.totalPointsSent >= 100000) {
        this.stop()
      }
    }, this.config.pushInterval)
  }

  stop() {
    if (!this.isRunning) return
    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  pointsToBuffer(points) {
    const buffer = new ArrayBuffer(4 + points.length * 28)
    const view = new DataView(buffer)
    view.setUint32(0, points.length, true)
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

  onMessage(callback) {
    this.messageCallback = callback
  }

  updateConfig(config) {
    if (!config) return
    const newCfg = { ...config }
    if (typeof newCfg.pointsPerMessage !== 'undefined') {
      newCfg.pointsPerPush = newCfg.pointsPerMessage
      delete newCfg.pointsPerMessage
    }
    if (typeof newCfg.interval !== 'undefined') {
      newCfg.pushInterval = newCfg.interval
      delete newCfg.interval
    }
    const prevInterval = this.config.pushInterval
    const prevRobotCount = this.config.robotCount
    this.config = { ...this.config, ...newCfg }
    if (typeof newCfg.robotCount !== 'undefined' && newCfg.robotCount !== prevRobotCount) {
      this.initRobots()
    }
    if (this.isRunning && typeof newCfg.pushInterval !== 'undefined' && newCfg.pushInterval !== prevInterval) {
      this._applyInterval()
    }
  }

  hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }
}

// --- Worker Logic ---
let simulator = null;

self.onmessage = (e) => {
  const { type, config } = e.data;

  switch (type) {
    case 'init':
      simulator = new RealRobotSimulator(config);
      simulator.onMessage((buffer, transferables) => {
        self.postMessage(buffer, transferables);
      });
      break;

    case 'start':
      if (simulator) simulator.start();
      break;

    case 'stop':
      if (simulator) simulator.stop();
      break;

    case 'config':
      if (simulator) simulator.updateConfig(config);
      break;
  }
};