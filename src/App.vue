<template>
  <div class="app-container">
    <!-- 双层Canvas容器 -->
    <div class="canvas-container" ref="canvasContainer">
      <!-- WebGL渲染层 -->
      <canvas
        ref="webglCanvas"
        class="webgl-canvas"
        :width="canvasSize.width"
        :height="canvasSize.height"
        :style="{
          width: canvasSize.width + 'px',
          height: canvasSize.height + 'px',
        }"
      ></canvas>
      <!-- Konva UI层 -->
      <div
        ref="konvaContainer"
        class="konva-container"
        :style="{
          width: canvasSize.width + 'px',
          height: canvasSize.height + 'px',
        }"
      ></div>
    </div>

    <!-- 控制面板 -->
    <div class="control-panel">
      <h3>控制面板</h3>

      <div class="control-group">
        <button @click="toggleSimulation" :class="{ active: isSimulating }">
          {{ isSimulating ? '停止模拟' : '开始模拟' }}
        </button>
      </div>

      <div class="control-group">
        <label>WS间隔 (ms):</label>
        <select v-model.number="wsInterval" :disabled="isSimulating">
          <option :value="50">50ms</option>
          <option :value="100">100ms</option>
          <option :value="200">200ms</option>
        </select>
      </div>

      <div class="control-group">
        <label>每条消息点数:</label>
        <input
          type="number"
          v-model.number="pointsPerMessage"
          min="1"
          max="1000"
          step="1"
        />
      </div>

      <div class="control-group">
        <label>机器人数量:</label>
        <input
          type="number"
          v-model.number="robotCount"
          :disabled="isSimulating"
          min="1"
          max="10"
          step="1"
        />
        <small style="color: #888; font-size: 12px">每个机器人不同颜色</small>
      </div>

      <div class="control-group">
        <label>
          <input
            type="checkbox"
            v-model="cameraFollow"
            @change="toggleCameraFollow"
          />
          镜头跟随
        </label>
        <select
          v-if="cameraFollow"
          v-model.number="focusedRobotId"
          @change="updateFocusedRobot"
          style="margin-left: 10px"
        >
          <option v-for="i in robotCount" :key="i - 1" :value="i - 1">
            机器人 {{ i }}
          </option>
        </select>
      </div>

      <div class="control-group">
        <label>LOD像素阈值:</label>
        <input
          type="range"
          v-model.number="lodThreshold"
          min="1"
          max="10"
          step="0.5"
        />
        <span>{{ lodThreshold }}px</span>
      </div>

      <div class="stats">
        <h4>性能统计</h4>
        <div>当前点数: {{ stats.totalPoints.toLocaleString() }}</div>
        <div>FPS: {{ stats.fps }}</div>
        <div>bufferSubData耗时: {{ stats.lastBufferUpdateTime }}ms</div>
        <div>Worker处理耗时: {{ stats.workerProcessTime }}ms</div>
        <div>渲染耗时: {{ stats.renderTime }}ms</div>
      </div>

      <div class="control-group">
        <button @click="clearPoints">清空点数据</button>
        <button @click="exportStats">导出性能数据</button>
      </div>

      <!-- 性能监控图表 -->
      <PerformanceChart :stats="stats" />
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import { WebGLRenderer } from './renderer/WebGLRenderer';
import { KonvaLayer } from './renderer/KonvaLayer';
import { RealRobotSimulator } from './simulator/RealRobotSimulator';
import { PathTracker } from './utils/PathTracker';
import { RobotMarkers } from './renderer/RobotMarkers';
import DataWorker from './workers/dataProcessor.worker.js?worker';
import PerformanceChart from './components/PerformanceChart.vue';

export default {
  name: 'App',
  components: {
    PerformanceChart,
  },
  setup() {
    // Canvas相关
    const canvasContainer = ref(null);
    const webglCanvas = ref(null);
    const konvaContainer = ref(null);
    const canvasSize = reactive({ width: 800, height: 600 });

    // 控制参数
    const isSimulating = ref(false);
    const wsInterval = ref(50);
    const pointsPerMessage = ref(10);
    const robotCount = ref(1); // 默认单个机器人
    const lodThreshold = ref(2.0);

    // 性能统计
    const stats = reactive({
      totalPoints: 0,
      fps: 0,
      lastBufferUpdateTime: 0,
      workerProcessTime: 0,
      renderTime: 0,
    });

    // 渲染器实例
    let webglRenderer = null;
    let konvaLayer = null;
    let wsSimulator = null;
    let dataWorker = null;
    let pathTracker = null;
    let robotMarkers = null;
    let animationId = null;
    let lastFrameTime = 0;
    let frameCount = 0;
    let fpsUpdateTime = 0;
    // 清空状态控制
    let clearAwaiting = false;
    let resumeAfterClear = false;
    let statsLog = [];
    let adaptiveLowCount = 0;
    let adaptiveHighCount = 0;
    let currentCulling = false;

    // 镜头跟随设置
    const cameraFollow = ref(false); // 是否启用镜头跟随
    const focusedRobotId = ref(0); // 聚焦的机器人ID

    // 视图变换矩阵
    const viewTransform = reactive({
      scale: 1.0,
      translateX: 0,
      translateY: 0,
    });

    // 初始化WebGL渲染器
    const initWebGL = () => {
      console.log('App: 初始化WebGL渲染器', {
        canvas: webglCanvas.value,
        size: { width: canvasSize.width, height: canvasSize.height },
      });
      webglRenderer = new WebGLRenderer(webglCanvas.value);
      webglRenderer.init();
      // 立即同步一次尺寸，确保viewport与CSS尺寸/DPR一致
      webglRenderer.resize(canvasSize.width, canvasSize.height);
      console.log('App: WebGL渲染器初始化完成');
    };

    // 初始化Konva层
    const initKonva = () => {
      konvaLayer = new KonvaLayer(konvaContainer.value, canvasSize);
      konvaLayer.onTransformChange((transform) => {
        viewTransform.scale = transform.scale;
        viewTransform.translateX = transform.x;
        viewTransform.translateY = transform.y;

        // 同步到WebGL渲染器
        if (webglRenderer) {
          webglRenderer.updateTransform(transform);
        }

        // 同步到机器人标记层（确保Konva元素随缩放平移更新）
        if (robotMarkers) {
          robotMarkers.setTransform(transform);
        }
      });
    };

    // 初始化Web Worker
    const initWorker = () => {
      dataWorker = new DataWorker();

      // 配置Worker
      dataWorker.postMessage({
        type: 'config',
        config: {
          lodThreshold: lodThreshold.value,
          viewBounds: {
            left: 0,
            top: 0,
            right: canvasSize.width,
            bottom: canvasSize.height,
          },
          maxPoints: 200000,
          enableLOD: true,
          enableCulling: false,
        },
      });

      // 处理Worker消息
      dataWorker.onmessage = (e) => {
        const { type, data, stats: workerStats } = e.data;

        if (type === 'processed') {
          // 清空过程中忽略处理结果，直到收到 cleared 回执
          if (clearAwaiting) return;
          // 更新统计
          if (workerStats) {
            stats.workerProcessTime = workerStats.processTime;
            stats.totalPoints = workerStats.totalPoints;
          }

          // 将处理后的数据发送到WebGL渲染器
          if (webglRenderer && data) {
            const startTime = performance.now();
            webglRenderer.updatePoints(data);
            stats.lastBufferUpdateTime = (
              performance.now() - startTime
            ).toFixed(2);
          } else {
            console.warn('App: WebGL渲染器未初始化或数据为空', {
              webglRenderer: !!webglRenderer,
              data: !!data,
            });
          }
        } else if (type === 'cleared') {
          // Worker 缓存已清空
          stats.totalPoints = 0;
          if (robotMarkers) {
            robotMarkers.clear();
          }
          if (pathTracker) {
            pathTracker.latestPoint = null;
          }
          // 根据标志恢复模拟
          if (resumeAfterClear && wsSimulator) {
            wsSimulator.start();
            isSimulating.value = true;
          }
          clearAwaiting = false;
          resumeAfterClear = false;
        }
      };
    };

    // 初始化WebSocket模拟器
    const initSimulator = () => {
      // 使用真实机器人模拟器
      wsSimulator = new RealRobotSimulator({
        pushInterval: wsInterval.value,
        pointsPerPush: pointsPerMessage.value,
        robotCount: robotCount.value,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
      });

      wsSimulator.onMessage((points) => {
        // 将原始数据发送到Worker处理
        if (dataWorker) {
          // 将 reactive 对象转换为普通对象
          const transformData = {
            scale: viewTransform.scale,
            translateX: viewTransform.translateX,
            translateY: viewTransform.translateY,
          };

          dataWorker.postMessage(
            {
              type: 'process',
              points: points,
              transform: transformData,
            },
            [points.buffer],
          );
        }
      });
    };

    // 渲染循环
    let lastTrackerUpdate = 0;
    const render = (timestamp) => {
      if (!lastFrameTime) lastFrameTime = timestamp;
      const deltaTime = timestamp - lastFrameTime;

      // 更新FPS
      frameCount++;
      if (timestamp - fpsUpdateTime >= 1000) {
        stats.fps = frameCount;
        frameCount = 0;
        fpsUpdateTime = timestamp;
        statsLog.push({
          ts: new Date().toISOString(),
          fps: stats.fps,
          totalPoints: stats.totalPoints,
          lastBufferUpdateTime: Number(stats.lastBufferUpdateTime),
          workerProcessTime: Number(stats.workerProcessTime),
          renderTime: Number(stats.renderTime),
          transform: {
            scale: viewTransform.scale,
            x: viewTransform.translateX,
            y: viewTransform.translateY,
          },
          canvas: { w: canvasSize.width, h: canvasSize.height },
        });

        const low = 40;
        const high = 50;
        if (stats.fps < low) {
          adaptiveLowCount++;
          adaptiveHighCount = 0;
        } else if (stats.fps > high) {
          adaptiveHighCount++;
          adaptiveLowCount = 0;
        } else {
          adaptiveLowCount = 0;
          adaptiveHighCount = 0;
        }

        let changed = false;
        if (adaptiveLowCount >= 3) {
          const next = Math.min(10, Number(lodThreshold.value) + 0.5);
          if (next !== lodThreshold.value) {
            lodThreshold.value = next;
            changed = true;
          }
          if (!currentCulling) {
            currentCulling = true;
            changed = true;
          }
          adaptiveLowCount = 0;
        } else if (adaptiveHighCount >= 3) {
          const next = Math.max(1, Number(lodThreshold.value) - 0.5);
          if (next !== lodThreshold.value) {
            lodThreshold.value = next;
            changed = true;
          }
          if (currentCulling) {
            currentCulling = false;
            changed = true;
          }
          adaptiveHighCount = 0;
        }

        if (changed && dataWorker) {
          dataWorker.postMessage({
            type: 'config',
            lodThreshold: lodThreshold.value,
            enableCulling: currentCulling,
          });
        }
      }

      // 渲染WebGL
      if (webglRenderer) {
        const startTime = performance.now();
        webglRenderer.render();
        stats.renderTime = (performance.now() - startTime).toFixed(2);

        // 同步数据边界并更新机器人标记位置
        if (robotMarkers && webglRenderer) {
          robotMarkers.setDataBounds(webglRenderer.dataBounds);
          robotMarkers.updateAllPositions(webglRenderer.robotManager);
        }

        // 更新镜头跟随
        if (pathTracker && cameraFollow.value) {
          if (!lastTrackerUpdate || timestamp - lastTrackerUpdate >= 100) {
            pathTracker.updateFromRobotManager();
            pathTracker.update();
            lastTrackerUpdate = timestamp;
          }
        }
      }

      lastFrameTime = timestamp;
      animationId = requestAnimationFrame(render);
    };

    // 开始/停止模拟
    const toggleSimulation = () => {
      isSimulating.value = !isSimulating.value;

      if (isSimulating.value) {
        wsSimulator.updateConfig({
          interval: wsInterval.value,
          pointsPerMessage: pointsPerMessage.value,
          robotCount: robotCount.value,
        });
        wsSimulator.start();
      } else {
        wsSimulator.stop();
      }
    };

    // 清空点数据
    const clearPoints = () => {
      // 1) 暂停模拟，避免清空过程中不断涌入新点
      const wasRunning = isSimulating.value;
      if (wasRunning && wsSimulator) {
        wsSimulator.stop();
        isSimulating.value = false;
      }

      // 2) 立即清空渲染器（含 robotManager/dataBounds）
      if (webglRenderer) {
        webglRenderer.clear();
      }
      // 3) 发送给Worker并等待回执
      stats.totalPoints = 0;
      if (dataWorker) {
        clearAwaiting = true;
        resumeAfterClear = wasRunning;
        dataWorker.postMessage({ type: 'clear' });
      } else {
        // 无Worker场景：直接清Konva
        if (robotMarkers) robotMarkers.clear();
        if (pathTracker) pathTracker.latestPoint = null;
        if (wasRunning && wsSimulator) {
          wsSimulator.start();
          isSimulating.value = true;
        }
      }
    };

    // 导出性能数据
    const exportStats = () => {
      const performanceData = {
        timestamp: new Date().toISOString(),
        stats: { ...stats },
        config: {
          wsInterval: wsInterval.value,
          pointsPerMessage: pointsPerMessage.value,
          lodThreshold: lodThreshold.value,
        },
        timeline: statsLog,
      };

      const blob = new Blob([JSON.stringify(performanceData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `performance-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    // 切换镜头跟随
    const toggleCameraFollow = () => {
      if (pathTracker) {
        if (cameraFollow.value) {
          pathTracker.setFocusedRobot(focusedRobotId.value);
          pathTracker.start();
        } else {
          pathTracker.stop();
        }
      }
    };

    // 更新聚焦的机器人
    const updateFocusedRobot = () => {
      if (pathTracker && cameraFollow.value) {
        pathTracker.setFocusedRobot(focusedRobotId.value);
        if (robotMarkers) {
          robotMarkers.setFocus(focusedRobotId.value);
        }
      }
    };

    // 调整Canvas大小
    const resizeCanvas = () => {
      if (canvasContainer.value) {
        const rect = canvasContainer.value.getBoundingClientRect();
        canvasSize.width = rect.width;
        canvasSize.height = rect.height;

        console.log('App: 调整Canvas大小', {
          width: canvasSize.width,
          height: canvasSize.height,
        });

        if (webglRenderer) {
          webglRenderer.resize(canvasSize.width, canvasSize.height);
        }
        if (konvaLayer) {
          konvaLayer.resize(canvasSize.width, canvasSize.height);
        }
        if (dataWorker) {
          dataWorker.postMessage({
            type: 'config',
            viewBounds: {
              left: 0,
              top: 0,
              right: canvasSize.width,
              bottom: canvasSize.height,
            },
          });
        }
      }
    };

    // 监听LOD阈值变化
    const updateLOD = () => {
      if (dataWorker) {
        dataWorker.postMessage({
          type: 'config',
          lodThreshold: lodThreshold.value,
        });
      }
    };

    // 动态监听并应用模拟参数变化
    watch(pointsPerMessage, (val) => {
      if (wsSimulator) wsSimulator.updateConfig({ pointsPerMessage: val });
    });
    watch(wsInterval, (val) => {
      if (wsSimulator) wsSimulator.updateConfig({ interval: val });
    });
    watch(robotCount, (val) => {
      if (wsSimulator) wsSimulator.updateConfig({ robotCount: val });
    });

    onMounted(() => {
      // 使用nextTick确保DOM完全渲染后再初始化
      setTimeout(() => {
        console.log('App: 开始初始化');
        resizeCanvas();
        initWebGL();
        initKonva();
        initWorker();
        initSimulator();

        // 初始化路径跟踪器和机器人标记
        if (webglRenderer && konvaLayer) {
          pathTracker = new PathTracker(konvaLayer, webglRenderer);
          robotMarkers = new RobotMarkers(konvaLayer);
          // 首次同步一次变换，避免创建后到第一次交互之间的偏差
          robotMarkers.setTransform(viewTransform);
          console.log('App: 路径跟踪器和机器人标记初始化完成');
        }

        console.log('App: 初始化完成，开始渲染循环');
        // 开始渲染循环
        animationId = requestAnimationFrame(render);

        // 监听窗口大小变化
        window.addEventListener('resize', resizeCanvas);
      }, 100);
    });

    onUnmounted(() => {
      // 清理资源
      if (animationId) {
        cancelAnimationFrame(animationId);
      }

      if (wsSimulator) {
        wsSimulator.stop();
      }

      if (dataWorker) {
        dataWorker.terminate();
      }

      if (webglRenderer) {
        webglRenderer.destroy();
      }

      if (konvaLayer) {
        konvaLayer.destroy();
      }

      window.removeEventListener('resize', resizeCanvas);
    });

    return {
      canvasContainer,
      webglCanvas,
      konvaContainer,
      canvasSize,
      isSimulating,
      wsInterval,
      pointsPerMessage,
      robotCount,
      lodThreshold,
      stats,
      cameraFollow,
      focusedRobotId,
      toggleSimulation,
      clearPoints,
      exportStats,
      toggleCameraFollow,
      updateFocusedRobot,
    };
  },
};
</script>

<style>
.app-container {
  display: flex;
  width: 100vw;
  height: 100vh;
  background: #1a1a1a;
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #2a2a2a;
}

.webgl-canvas {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

.konva-container {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  pointer-events: all;
}

.control-panel {
  width: 300px;
  background: #1e1e1e;
  color: #fff;
  padding: 20px;
  overflow-y: auto;
  border-left: 1px solid #333;
}

.control-panel h3 {
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #333;
}

.control-group {
  margin-bottom: 15px;
}

.control-group label {
  display: block;
  margin-bottom: 5px;
  font-size: 14px;
  color: #aaa;
}

.control-group input[type='number'],
.control-group select {
  width: 100%;
  padding: 8px;
  background: #2a2a2a;
  color: #fff;
  border: 1px solid #444;
  border-radius: 4px;
}

.control-group input[type='range'] {
  width: calc(100% - 50px);
  vertical-align: middle;
}

.control-group button {
  width: 100%;
  padding: 10px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}

.control-group button:hover {
  background: #45a049;
}

.control-group button.active {
  background: #f44336;
}

.control-group button.active:hover {
  background: #da190b;
}

.stats {
  margin: 20px 0;
  padding: 15px;
  background: #2a2a2a;
  border-radius: 4px;
}

.stats h4 {
  margin-bottom: 10px;
  color: #4caf50;
}

.stats div {
  margin: 5px 0;
  font-size: 14px;
  color: #aaa;
}
</style>
