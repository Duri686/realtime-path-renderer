/**
 * 性能监控器 - 收集和分析渲染性能数据
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      fps: [],
      renderTime: [],
      bufferUpdateTime: [],
      workerProcessTime: [],
      pointCount: [],
      memoryUsage: []
    }
    
    this.maxSamples = 100 // 保存最近100个样本
    this.startTime = Date.now()
    
    // FPS计算
    this.frameCount = 0
    this.lastFPSUpdate = 0
    this.currentFPS = 0
    
    // 性能图表数据
    this.chartData = {
      labels: [],
      datasets: []
    }
  }
  
  /**
   * 记录指标
   */
  record(metric, value) {
    if (!this.metrics[metric]) {
      this.metrics[metric] = []
    }
    
    this.metrics[metric].push({
      timestamp: Date.now() - this.startTime,
      value: value
    })
    
    // 限制样本数量
    if (this.metrics[metric].length > this.maxSamples) {
      this.metrics[metric].shift()
    }
  }
  
  /**
   * 更新FPS
   */
  updateFPS() {
    this.frameCount++
    const now = Date.now()
    
    if (now - this.lastFPSUpdate >= 1000) {
      this.currentFPS = this.frameCount
      this.record('fps', this.currentFPS)
      this.frameCount = 0
      this.lastFPSUpdate = now
    }
    
    return this.currentFPS
  }
  
  /**
   * 获取平均值
   */
  getAverage(metric) {
    const samples = this.metrics[metric]
    if (!samples || samples.length === 0) return 0
    
    const sum = samples.reduce((acc, sample) => acc + sample.value, 0)
    return sum / samples.length
  }
  
  /**
   * 获取最大值
   */
  getMax(metric) {
    const samples = this.metrics[metric]
    if (!samples || samples.length === 0) return 0
    
    return Math.max(...samples.map(s => s.value))
  }
  
  /**
   * 获取最小值
   */
  getMin(metric) {
    const samples = this.metrics[metric]
    if (!samples || samples.length === 0) return 0
    
    return Math.min(...samples.map(s => s.value))
  }
  
  /**
   * 获取性能报告
   */
  getReport() {
    const report = {
      timestamp: new Date().toISOString(),
      duration: (Date.now() - this.startTime) / 1000, // 秒
      metrics: {}
    }
    
    for (const metric in this.metrics) {
      const samples = this.metrics[metric]
      if (samples.length > 0) {
        report.metrics[metric] = {
          average: this.getAverage(metric).toFixed(2),
          max: this.getMax(metric).toFixed(2),
          min: this.getMin(metric).toFixed(2),
          current: samples[samples.length - 1].value.toFixed(2),
          samples: samples.length
        }
      }
    }
    
    return report
  }
  
  /**
   * 生成性能图表数据
   */
  getChartData() {
    const chartData = {
      labels: [],
      datasets: [
        {
          label: 'FPS',
          data: [],
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        },
        {
          label: '渲染时间 (ms)',
          data: [],
          borderColor: 'rgb(255, 99, 132)',
          tension: 0.1
        },
        {
          label: 'Worker处理时间 (ms)',
          data: [],
          borderColor: 'rgb(54, 162, 235)',
          tension: 0.1
        }
      ]
    }
    
    // 获取最近的样本
    const fpsSamples = this.metrics.fps.slice(-30)
    const renderSamples = this.metrics.renderTime.slice(-30)
    const workerSamples = this.metrics.workerProcessTime.slice(-30)
    
    // 生成时间标签
    for (let i = 0; i < 30; i++) {
      chartData.labels.push(i.toString())
    }
    
    // 填充数据
    chartData.datasets[0].data = fpsSamples.map(s => s.value)
    chartData.datasets[1].data = renderSamples.map(s => s.value)
    chartData.datasets[2].data = workerSamples.map(s => s.value)
    
    return chartData
  }
  
  /**
   * 检测性能问题
   */
  detectIssues() {
    const issues = []
    
    // FPS过低
    const avgFPS = this.getAverage('fps')
    if (avgFPS < 30) {
      issues.push({
        severity: 'high',
        type: 'fps',
        message: `平均FPS过低: ${avgFPS.toFixed(1)}, 建议降低点密度或更新频率`
      })
    } else if (avgFPS < 50) {
      issues.push({
        severity: 'medium',
        type: 'fps',
        message: `平均FPS偏低: ${avgFPS.toFixed(1)}, 可能需要优化`
      })
    }
    
    // 渲染时间过长
    const avgRenderTime = this.getAverage('renderTime')
    if (avgRenderTime > 16.67) { // 60fps = 16.67ms per frame
      issues.push({
        severity: 'high',
        type: 'render',
        message: `渲染时间过长: ${avgRenderTime.toFixed(1)}ms, 超过16.67ms`
      })
    }
    
    // Worker处理时间过长
    const avgWorkerTime = this.getAverage('workerProcessTime')
    if (avgWorkerTime > 10) {
      issues.push({
        severity: 'medium',
        type: 'worker',
        message: `Worker处理时间偏长: ${avgWorkerTime.toFixed(1)}ms`
      })
    }
    
    // 内存使用（如果支持）
    if (performance.memory) {
      const usedMemory = performance.memory.usedJSHeapSize / 1048576 // MB
      if (usedMemory > 100) {
        issues.push({
          severity: 'medium',
          type: 'memory',
          message: `内存使用较高: ${usedMemory.toFixed(1)}MB`
        })
      }
    }
    
    return issues
  }
  
  /**
   * 导出CSV格式数据
   */
  exportCSV() {
    let csv = 'Timestamp,Metric,Value\n'
    
    for (const metric in this.metrics) {
      const samples = this.metrics[metric]
      for (const sample of samples) {
        csv += `${sample.timestamp},${metric},${sample.value}\n`
      }
    }
    
    return csv
  }
  
  /**
   * 重置监控数据
   */
  reset() {
    for (const metric in this.metrics) {
      this.metrics[metric] = []
    }
    
    this.frameCount = 0
    this.lastFPSUpdate = 0
    this.currentFPS = 0
    this.startTime = Date.now()
  }
}

/**
 * 性能基准测试
 */
export class PerformanceBenchmark {
  constructor() {
    this.tests = []
    this.results = []
  }
  
  /**
   * 添加测试
   */
  addTest(name, fn, iterations = 100) {
    this.tests.push({
      name,
      fn,
      iterations
    })
  }
  
  /**
   * 运行所有测试
   */
  async runAll() {
    this.results = []
    
    for (const test of this.tests) {
      console.log(`Running benchmark: ${test.name}`)
      const result = await this.runTest(test)
      this.results.push(result)
      console.log(`Result: ${result.average.toFixed(2)}ms average`)
    }
    
    return this.results
  }
  
  /**
   * 运行单个测试
   */
  async runTest(test) {
    const times = []
    
    // 预热
    for (let i = 0; i < 10; i++) {
      await test.fn()
    }
    
    // 正式测试
    for (let i = 0; i < test.iterations; i++) {
      const start = performance.now()
      await test.fn()
      const end = performance.now()
      times.push(end - start)
    }
    
    // 计算统计数据
    const average = times.reduce((a, b) => a + b, 0) / times.length
    const min = Math.min(...times)
    const max = Math.max(...times)
    
    // 计算标准差
    const variance = times.reduce((acc, time) => {
      return acc + Math.pow(time - average, 2)
    }, 0) / times.length
    const stdDev = Math.sqrt(variance)
    
    return {
      name: test.name,
      iterations: test.iterations,
      average,
      min,
      max,
      stdDev,
      times
    }
  }
  
  /**
   * 生成报告
   */
  generateReport() {
    let report = '性能基准测试报告\n'
    report += '================\n\n'
    
    for (const result of this.results) {
      report += `测试: ${result.name}\n`
      report += `迭代次数: ${result.iterations}\n`
      report += `平均耗时: ${result.average.toFixed(2)}ms\n`
      report += `最小耗时: ${result.min.toFixed(2)}ms\n`
      report += `最大耗时: ${result.max.toFixed(2)}ms\n`
      report += `标准差: ${result.stdDev.toFixed(2)}ms\n`
      report += '\n'
    }
    
    return report
  }
}
