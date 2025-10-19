/**
 * 压力测试脚本 - 生成高密度点流进行性能测试
 */

export class StressTestGenerator {
  constructor() {
    this.testProfiles = {
      // 轻量级测试
      light: {
        totalPoints: 10000,
        batchSize: 100,
        interval: 100,
        duration: 10000 // 10秒
      },
      // 中等强度测试
      medium: {
        totalPoints: 50000,
        batchSize: 500,
        interval: 50,
        duration: 20000 // 20秒
      },
      // 高强度测试
      heavy: {
        totalPoints: 100000,
        batchSize: 1000,
        interval: 50,
        duration: 30000 // 30秒
      },
      // 极限测试
      extreme: {
        totalPoints: 200000,
        batchSize: 2000,
        interval: 25,
        duration: 60000 // 60秒
      }
    }
    
    this.currentTest = null
    this.testResults = []
  }
  
  /**
   * 生成测试数据集
   */
  generateTestDataset(profile) {
    const config = this.testProfiles[profile] || this.testProfiles.medium
    const datasets = []
    
    // 生成不同模式的数据集
    datasets.push(this.generateRandomPoints(config))
    datasets.push(this.generateClusteredPoints(config))
    datasets.push(this.generateSpiralPoints(config))
    datasets.push(this.generateGridPoints(config))
    datasets.push(this.generateWavePoints(config))
    
    return datasets
  }
  
  /**
   * 随机分布点
   */
  generateRandomPoints(config) {
    const points = []
    const { totalPoints } = config
    
    for (let i = 0; i < totalPoints; i++) {
      points.push({
        x: Math.random() * 2000,
        y: Math.random() * 1500,
        timestamp: Date.now() + i,
        id: `random_${i}`
      })
    }
    
    return {
      name: 'Random Distribution',
      points,
      type: 'random'
    }
  }
  
  /**
   * 聚类分布点
   */
  generateClusteredPoints(config) {
    const points = []
    const { totalPoints } = config
    const clusterCount = 10
    const pointsPerCluster = Math.floor(totalPoints / clusterCount)
    
    for (let c = 0; c < clusterCount; c++) {
      const centerX = Math.random() * 1800 + 100
      const centerY = Math.random() * 1300 + 100
      const spread = 50 + Math.random() * 100
      
      for (let i = 0; i < pointsPerCluster; i++) {
        const angle = Math.random() * Math.PI * 2
        const distance = Math.random() * spread
        
        points.push({
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
          timestamp: Date.now() + c * pointsPerCluster + i,
          id: `cluster_${c}_${i}`,
          clusterId: c
        })
      }
    }
    
    return {
      name: 'Clustered Distribution',
      points,
      type: 'clustered'
    }
  }
  
  /**
   * 螺旋分布点
   */
  generateSpiralPoints(config) {
    const points = []
    const { totalPoints } = config
    const centerX = 1000
    const centerY = 750
    const maxRadius = 600
    const rotations = 10
    
    for (let i = 0; i < totalPoints; i++) {
      const progress = i / totalPoints
      const angle = progress * Math.PI * 2 * rotations
      const radius = progress * maxRadius
      
      // 添加一些噪声
      const noise = (Math.random() - 0.5) * 20
      
      points.push({
        x: centerX + Math.cos(angle) * (radius + noise),
        y: centerY + Math.sin(angle) * (radius + noise),
        timestamp: Date.now() + i,
        id: `spiral_${i}`,
        progress
      })
    }
    
    return {
      name: 'Spiral Pattern',
      points,
      type: 'spiral'
    }
  }
  
  /**
   * 网格分布点
   */
  generateGridPoints(config) {
    const points = []
    const { totalPoints } = config
    const gridSize = Math.ceil(Math.sqrt(totalPoints))
    const spacing = 1800 / gridSize
    
    let count = 0
    for (let row = 0; row < gridSize && count < totalPoints; row++) {
      for (let col = 0; col < gridSize && count < totalPoints; col++) {
        // 添加一些抖动
        const jitter = (Math.random() - 0.5) * spacing * 0.3
        
        points.push({
          x: col * spacing + 100 + jitter,
          y: row * spacing + 100 + jitter,
          timestamp: Date.now() + count,
          id: `grid_${row}_${col}`,
          row,
          col
        })
        count++
      }
    }
    
    return {
      name: 'Grid Pattern',
      points,
      type: 'grid'
    }
  }
  
  /**
   * 波形分布点
   */
  generateWavePoints(config) {
    const points = []
    const { totalPoints } = config
    const waveCount = 5
    const pointsPerWave = Math.floor(totalPoints / waveCount)
    
    for (let w = 0; w < waveCount; w++) {
      const amplitude = 100 + Math.random() * 200
      const frequency = 0.005 + Math.random() * 0.01
      const phase = Math.random() * Math.PI * 2
      const baseY = 200 + w * 250
      
      for (let i = 0; i < pointsPerWave; i++) {
        const x = (i / pointsPerWave) * 2000
        const y = baseY + Math.sin(x * frequency + phase) * amplitude
        
        // 添加一些噪声
        const noiseY = (Math.random() - 0.5) * 30
        
        points.push({
          x,
          y: y + noiseY,
          timestamp: Date.now() + w * pointsPerWave + i,
          id: `wave_${w}_${i}`,
          waveId: w
        })
      }
    }
    
    return {
      name: 'Wave Pattern',
      points,
      type: 'wave'
    }
  }
  
  /**
   * 运行压力测试
   */
  async runStressTest(profile, onUpdate) {
    const config = this.testProfiles[profile]
    const datasets = this.generateTestDataset(profile)
    
    console.log(`开始压力测试: ${profile}`)
    console.log(`配置:`, config)
    
    const testResult = {
      profile,
      config,
      startTime: Date.now(),
      datasets: [],
      metrics: {
        totalPointsSent: 0,
        averageFPS: 0,
        minFPS: 999,
        maxFPS: 0,
        droppedFrames: 0
      }
    }
    
    this.currentTest = testResult
    
    // 依次发送每个数据集
    for (const dataset of datasets) {
      console.log(`发送数据集: ${dataset.name}`)
      
      const batchCount = Math.ceil(dataset.points.length / config.batchSize)
      
      for (let i = 0; i < batchCount; i++) {
        const start = i * config.batchSize
        const end = Math.min(start + config.batchSize, dataset.points.length)
        const batch = dataset.points.slice(start, end)
        
        // 发送批次
        if (onUpdate) {
          await onUpdate({
            type: 'batch',
            data: batch,
            progress: (i + 1) / batchCount,
            dataset: dataset.name
          })
        }
        
        testResult.metrics.totalPointsSent += batch.length
        
        // 等待间隔
        await this.wait(config.interval)
      }
      
      testResult.datasets.push({
        name: dataset.name,
        type: dataset.type,
        pointCount: dataset.points.length
      })
    }
    
    testResult.endTime = Date.now()
    testResult.duration = testResult.endTime - testResult.startTime
    
    this.testResults.push(testResult)
    this.currentTest = null
    
    console.log('压力测试完成')
    return testResult
  }
  
  /**
   * 生成性能报告
   */
  generateReport(testResult) {
    const report = {
      summary: {
        profile: testResult.profile,
        duration: `${(testResult.duration / 1000).toFixed(1)}秒`,
        totalPoints: testResult.metrics.totalPointsSent,
        throughput: `${(testResult.metrics.totalPointsSent / (testResult.duration / 1000)).toFixed(0)}点/秒`
      },
      datasets: testResult.datasets,
      performance: {
        averageFPS: testResult.metrics.averageFPS,
        minFPS: testResult.metrics.minFPS,
        maxFPS: testResult.metrics.maxFPS,
        droppedFrames: testResult.metrics.droppedFrames,
        frameDropRate: `${((testResult.metrics.droppedFrames / (testResult.duration / 16.67)) * 100).toFixed(1)}%`
      },
      recommendations: this.generateRecommendations(testResult)
    }
    
    return report
  }
  
  /**
   * 生成优化建议
   */
  generateRecommendations(testResult) {
    const recommendations = []
    const { metrics } = testResult
    
    if (metrics.averageFPS < 30) {
      recommendations.push({
        level: 'critical',
        message: '平均FPS低于30，严重影响用户体验',
        suggestions: [
          '减少每批次的点数量',
          '增加数据发送间隔',
          '启用更激进的LOD策略',
          '考虑使用WebGL instancing'
        ]
      })
    } else if (metrics.averageFPS < 50) {
      recommendations.push({
        level: 'warning',
        message: '平均FPS低于50，可能出现卡顿',
        suggestions: [
          '优化Worker处理逻辑',
          '减少不必要的重绘',
          '使用更高效的数据结构'
        ]
      })
    }
    
    if (metrics.droppedFrames > testResult.duration / 16.67 * 0.05) {
      recommendations.push({
        level: 'warning',
        message: '掉帧率超过5%',
        suggestions: [
          '优化渲染循环',
          '使用requestAnimationFrame节流',
          '考虑分帧渲染'
        ]
      })
    }
    
    if (metrics.totalPointsSent > 100000) {
      recommendations.push({
        level: 'info',
        message: '处理大量数据点',
        suggestions: [
          '考虑实现数据虚拟化',
          '使用时间窗口限制显示的点数',
          '实现基于距离的点聚合'
        ]
      })
    }
    
    return recommendations
  }
  
  /**
   * 等待工具函数
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  /**
   * 导出测试结果
   */
  exportResults() {
    return {
      timestamp: new Date().toISOString(),
      results: this.testResults,
      summary: {
        totalTests: this.testResults.length,
        profiles: this.testResults.map(r => r.profile),
        totalPointsTested: this.testResults.reduce((sum, r) => sum + r.metrics.totalPointsSent, 0)
      }
    }
  }
}

// 导出单例实例
export const stressTest = new StressTestGenerator()
