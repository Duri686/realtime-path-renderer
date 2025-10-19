/**
 * 坐标映射工具
 * 职责：数据坐标 ↔ 画布坐标 ↔ 世界坐标转换
 */
export class CoordinateMapper {
  /**
   * 数据坐标转画布坐标
   * @param {number} dataX - 数据X坐标
   * @param {number} dataY - 数据Y坐标
   * @param {Object} dataBounds - 数据边界 {minX, minY, maxX, maxY}
   * @param {Object} canvasSize - 画布尺寸 {width, height}
   * @param {number} padding - 边距比例 (默认0.05)
   * @returns {Object} {x, y} 画布坐标
   */
  static dataToCanvas(dataX, dataY, dataBounds, canvasSize, padding = 0.05) {
    const rangeX = Math.max(1e-6, dataBounds.maxX - dataBounds.minX)
    const rangeY = Math.max(1e-6, dataBounds.maxY - dataBounds.minY)
    
    // 归一化到 [0, 1]
    const normalizedX = (dataX - dataBounds.minX) / rangeX
    const normalizedY = (dataY - dataBounds.minY) / rangeY
    
    // 应用padding
    const paddedX = normalizedX * (1 - 2 * padding) + padding
    const paddedY = normalizedY * (1 - 2 * padding) + padding
    
    return {
      x: paddedX * canvasSize.width,
      y: paddedY * canvasSize.height
    }
  }
  
  /**
   * 画布坐标转数据坐标
   */
  static canvasToData(canvasX, canvasY, dataBounds, canvasSize, padding = 0.05) {
    // 反向计算
    const paddedX = canvasX / canvasSize.width
    const paddedY = canvasY / canvasSize.height
    
    const normalizedX = (paddedX - padding) / (1 - 2 * padding)
    const normalizedY = (paddedY - padding) / (1 - 2 * padding)
    
    const rangeX = dataBounds.maxX - dataBounds.minX
    const rangeY = dataBounds.maxY - dataBounds.minY
    
    return {
      x: normalizedX * rangeX + dataBounds.minX,
      y: normalizedY * rangeY + dataBounds.minY
    }
  }
  
  /**
   * 应用视图变换
   */
  static applyViewTransform(x, y, transform) {
    return {
      x: (x + transform.translateX) * transform.scale,
      y: (y + transform.translateY) * transform.scale
    }
  }
  
  /**
   * 反向视图变换
   */
  static reverseViewTransform(screenX, screenY, transform) {
    return {
      x: screenX / transform.scale - transform.translateX,
      y: screenY / transform.scale - transform.translateY
    }
  }
  
  /**
   * 完整的数据坐标到屏幕坐标
   */
  static dataToScreen(dataX, dataY, dataBounds, canvasSize, transform, padding = 0.05) {
    const canvas = this.dataToCanvas(dataX, dataY, dataBounds, canvasSize, padding)
    return this.applyViewTransform(canvas.x, canvas.y, transform)
  }
}
