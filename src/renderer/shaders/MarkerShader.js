/**
 * 机器人标记着色器（呼吸灯效果）
 * 职责：提供标记顶点和片段着色器源码
 */
export class MarkerShader {
  static getVertexSource() {
    return `#version 300 es
      precision highp float;
      
      in vec2 a_position;  // 世界坐标
      in vec4 a_color;     // 标记颜色
      in float a_size;     // 基础大小（起点8px，当前12px）
      
      uniform vec2 u_resolution;
      uniform vec2 u_dataMin;
      uniform vec2 u_dataMax;
      uniform vec2 u_viewTranslate;
      uniform float u_viewScale;
      uniform float u_time;  // 动画时间
      
      out vec4 v_color;
      out float v_pulse;  // 脉冲值
      out float v_baseSize; // 传递基础大小
      
      void main() {
        // 坐标变换（与路径一致）
        vec2 dataRange = max(u_dataMax - u_dataMin, vec2(1e-6));
        vec2 normalizedPos = (a_position - u_dataMin) / dataRange;
        float padding = 0.05;
        vec2 paddedPos = normalizedPos * (1.0 - 2.0 * padding) + padding;
        vec2 canvasPos = paddedPos * u_resolution;
        vec2 transformedPos = (canvasPos + u_viewTranslate) * u_viewScale;
        vec2 clipSpace = (transformedPos / u_resolution) * 2.0 - 1.0;
        clipSpace.y *= -1.0;
        gl_Position = vec4(clipSpace, 0.0, 1.0);
        
        // 自适应标记大小：根据屏幕尺寸调整
        // 基准：1920px宽度时使用原始大小，小屏幕按比例放大
        float screenScale = max(1.0, 800.0 / u_resolution.x); // H5小屏幕放大
        float adaptiveSize = a_size * screenScale;
        
        // 呼吸灯效果：当前位置有脉冲，起点固定
        v_pulse = sin(u_time * 0.002) * 0.5 + 0.5;
        float pulseAmount = a_size > 10.0 ? 4.0 * screenScale : 0.0;  // 脉冲也自适应
        gl_PointSize = (adaptiveSize + v_pulse * pulseAmount) * u_viewScale;
        
        v_color = a_color;
        v_baseSize = a_size;
      }
    `
  }
  
  static getFragmentSource() {
    return `#version 300 es
      precision highp float;
      
      in vec4 v_color;
      in float v_pulse;
      in float v_baseSize;
      
      out vec4 fragColor;
      
      void main() {
        // 圆形裁剪
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        
        if (dist > 0.5) {
          discard;  // 裁剪为圆形
        }
        
        float alpha = v_color.a;
        
        // 当前位置标记（大）：内圈实心 + 外圈呼吸光晕
        if (v_baseSize > 10.0) {
          if (dist > 0.3) {
            float glow = (0.5 - dist) / 0.2;
            alpha *= glow * v_pulse * 0.8;
          }
        } else {
          // 起点标记（小）：实心圆 + 白边
          if (dist > 0.4) {
            // 外圈白边
            fragColor = vec4(1.0, 1.0, 1.0, 0.8);
            return;
          }
        }
        
        fragColor = vec4(v_color.rgb, alpha);
      }
    `
  }
  
  static getAttributeNames() {
    return ['a_position', 'a_color', 'a_size']
  }
  
  static getUniformNames() {
    return [
      'u_resolution',
      'u_dataMin',
      'u_dataMax',
      'u_viewTranslate',
      'u_viewScale',
      'u_time'
    ]
  }
}
