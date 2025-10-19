<template>
  <div class="performance-chart">
    <h3>性能监控</h3>
    
    <!-- 实时指标 -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">FPS</div>
        <div class="metric-value" :class="getFPSClass(currentFPS)">
          {{ currentFPS }}
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-label">点数</div>
        <div class="metric-value">
          {{ totalPoints.toLocaleString() }}
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-label">渲染</div>
        <div class="metric-value">
          {{ renderTime }}ms
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-label">Worker</div>
        <div class="metric-value">
          {{ workerTime }}ms
        </div>
      </div>
    </div>
    
    <!-- 性能图表 -->
    <div class="chart-container">
      <canvas ref="chartCanvas"></canvas>
    </div>
    
    <!-- 性能问题提示 -->
    <div class="issues-panel" v-if="issues.length > 0">
      <h4>性能提示</h4>
      <div 
        v-for="issue in issues" 
        :key="issue.message"
        class="issue-item"
        :class="`issue-${issue.severity}`"
      >
        {{ issue.message }}
      </div>
    </div>
    
    <!-- 操作按钮 -->
    <div class="actions">
      <button @click="runBenchmark" :disabled="isRunningBenchmark">
        {{ isRunningBenchmark ? '测试中...' : '运行基准测试' }}
      </button>
      <button @click="exportReport">导出报告</button>
      <button @click="reset">重置数据</button>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { PerformanceMonitor, PerformanceBenchmark } from '../utils/PerformanceMonitor'
import { stressTest } from '../test/stressTest'

export default {
  name: 'PerformanceChart',
  props: {
    stats: {
      type: Object,
      default: () => ({})
    }
  },
  setup(props) {
    const chartCanvas = ref(null)
    const currentFPS = ref(0)
    const totalPoints = ref(0)
    const renderTime = ref(0)
    const workerTime = ref(0)
    const issues = ref([])
    const isRunningBenchmark = ref(false)
    
    let monitor = null
    let benchmark = null
    let chart = null
    let updateInterval = null
    
    // 初始化性能监控
    const initMonitor = () => {
      monitor = new PerformanceMonitor()
      benchmark = new PerformanceBenchmark()
      
      // 添加基准测试
      benchmark.addTest('渲染10k点', async () => {
        // 模拟渲染测试
        const points = new Float32Array(10000 * 2)
        for (let i = 0; i < points.length; i++) {
          points[i] = Math.random() * 1000
        }
        // 模拟处理延迟
        await new Promise(resolve => setTimeout(resolve, 10))
      }, 50)
      
      benchmark.addTest('Worker处理', async () => {
        // 模拟Worker处理
        const data = new ArrayBuffer(1000 * 8)
        // 模拟处理延迟
        await new Promise(resolve => setTimeout(resolve, 5))
      }, 50)
    }
    
    // 初始化图表
    const initChart = () => {
      if (!chartCanvas.value) return
      
      const ctx = chartCanvas.value.getContext('2d')
      const width = chartCanvas.value.width = 300
      const height = chartCanvas.value.height = 150
      
      // 简单的折线图绘制
      const drawChart = () => {
        ctx.clearRect(0, 0, width, height)
        
        // 绘制网格
        ctx.strokeStyle = '#333'
        ctx.lineWidth = 0.5
        for (let i = 0; i <= 5; i++) {
          const y = (height / 5) * i
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
          ctx.stroke()
        }
        
        // 获取数据
        const chartData = monitor.getChartData()
        
        // 绘制FPS曲线
        if (chartData.datasets[0].data.length > 0) {
          ctx.strokeStyle = '#4CAF50'
          ctx.lineWidth = 2
          ctx.beginPath()
          
          const fpsData = chartData.datasets[0].data
          const xStep = width / (fpsData.length - 1)
          
          for (let i = 0; i < fpsData.length; i++) {
            const x = i * xStep
            const y = height - (fpsData[i] / 60) * height
            
            if (i === 0) {
              ctx.moveTo(x, y)
            } else {
              ctx.lineTo(x, y)
            }
          }
          
          ctx.stroke()
        }
      }
      
      chart = { draw: drawChart }
    }
    
    // 更新指标
    const updateMetrics = () => {
      // 更新显示值
      currentFPS.value = props.stats.fps || 0
      totalPoints.value = props.stats.totalPoints || 0
      renderTime.value = props.stats.renderTime || 0
      workerTime.value = props.stats.workerProcessTime || 0
      
      // 记录到监控器
      if (monitor) {
        monitor.record('fps', currentFPS.value)
        monitor.record('pointCount', totalPoints.value)
        monitor.record('renderTime', parseFloat(renderTime.value))
        monitor.record('workerProcessTime', parseFloat(workerTime.value))
        
        // 检测问题
        issues.value = monitor.detectIssues()
        
        // 更新图表
        if (chart) {
          chart.draw()
        }
      }
    }
    
    // 获取FPS样式类
    const getFPSClass = (fps) => {
      if (fps >= 50) return 'fps-good'
      if (fps >= 30) return 'fps-warning'
      return 'fps-bad'
    }
    
    // 运行基准测试
    const runBenchmark = async () => {
      if (isRunningBenchmark.value) return
      
      isRunningBenchmark.value = true
      console.log('开始基准测试...')
      
      try {
        const results = await benchmark.runAll()
        console.log('基准测试结果:', results)
        
        // 显示结果
        const report = benchmark.generateReport()
        console.log(report)
        alert('基准测试完成，请查看控制台')
      } catch (error) {
        console.error('基准测试失败:', error)
      } finally {
        isRunningBenchmark.value = false
      }
    }
    
    // 导出报告
    const exportReport = () => {
      if (!monitor) return
      
      const report = monitor.getReport()
      const csv = monitor.exportCSV()
      
      // 创建JSON报告
      const jsonBlob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const jsonUrl = URL.createObjectURL(jsonBlob)
      const jsonLink = document.createElement('a')
      jsonLink.href = jsonUrl
      jsonLink.download = `performance-report-${Date.now()}.json`
      jsonLink.click()
      URL.revokeObjectURL(jsonUrl)
      
      // 创建CSV数据
      const csvBlob = new Blob([csv], { type: 'text/csv' })
      const csvUrl = URL.createObjectURL(csvBlob)
      const csvLink = document.createElement('a')
      csvLink.href = csvUrl
      csvLink.download = `performance-data-${Date.now()}.csv`
      csvLink.click()
      URL.revokeObjectURL(csvUrl)
      
      console.log('报告已导出')
    }
    
    // 重置数据
    const reset = () => {
      if (monitor) {
        monitor.reset()
      }
      issues.value = []
      if (chart) {
        chart.draw()
      }
    }
    
    // 监听属性变化
    watch(() => props.stats, updateMetrics, { deep: true })
    
    onMounted(() => {
      initMonitor()
      initChart()
      
      // 定期更新
      updateInterval = setInterval(updateMetrics, 100)
    })
    
    onUnmounted(() => {
      if (updateInterval) {
        clearInterval(updateInterval)
      }
    })
    
    return {
      chartCanvas,
      currentFPS,
      totalPoints,
      renderTime,
      workerTime,
      issues,
      isRunningBenchmark,
      getFPSClass,
      runBenchmark,
      exportReport,
      reset
    }
  }
}
</script>

<style scoped>
.performance-chart {
  padding: 15px;
  background: #1a1a1a;
  border-radius: 8px;
  margin-top: 20px;
}

.performance-chart h3 {
  margin: 0 0 15px 0;
  color: #4CAF50;
  font-size: 16px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 15px;
}

.metric-card {
  background: #2a2a2a;
  padding: 10px;
  border-radius: 4px;
  text-align: center;
}

.metric-label {
  font-size: 12px;
  color: #888;
  margin-bottom: 5px;
}

.metric-value {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
}

.fps-good {
  color: #4CAF50 !important;
}

.fps-warning {
  color: #FFA726 !important;
}

.fps-bad {
  color: #EF5350 !important;
}

.chart-container {
  background: #0a0a0a;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 15px;
}

.chart-container canvas {
  width: 100%;
  height: 150px;
}

.issues-panel {
  background: #2a2a2a;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 15px;
}

.issues-panel h4 {
  margin: 0 0 10px 0;
  color: #FFA726;
  font-size: 14px;
}

.issue-item {
  padding: 5px;
  margin-bottom: 5px;
  border-radius: 3px;
  font-size: 12px;
}

.issue-high {
  background: rgba(239, 83, 80, 0.2);
  color: #EF5350;
}

.issue-medium {
  background: rgba(255, 167, 38, 0.2);
  color: #FFA726;
}

.issue-low {
  background: rgba(66, 165, 245, 0.2);
  color: #42A5F5;
}

.actions {
  display: flex;
  gap: 10px;
}

.actions button {
  flex: 1;
  padding: 8px;
  background: #333;
  color: #fff;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.3s;
}

.actions button:hover {
  background: #444;
}

.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
