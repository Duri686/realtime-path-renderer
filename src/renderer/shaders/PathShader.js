/**
 * 路径渲染着色器
 * 职责：提供路径顶点和片段着色器源码
 */
export class PathShader {
  static getVertexSource() {
    return `#version 300 es
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
  }
  
  static getFragmentSource() {
    return `#version 300 es
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
  }
  
  static getAttributeNames() {
    return ['a_position', 'a_color']
  }
  
  static getUniformNames() {
    return [
      'u_resolution',
      'u_dataMin',
      'u_dataMax',
      'u_viewTranslate',
      'u_viewScale',
      'u_pointSize'
    ]
  }
}
