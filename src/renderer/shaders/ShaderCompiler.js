/**
 * 着色器编译工具
 * 职责：编译、链接、错误处理
 */
export class ShaderCompiler {
  /**
   * 编译单个着色器
   */
  static compileShader(gl, type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`Shader compilation failed: ${log}`)
    }
    
    return shader
  }
  
  /**
   * 创建着色器程序
   */
  static createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram()
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Program link failed: ${log}`)
    }
    
    return program
  }
  
  /**
   * 从源码创建完整程序
   */
  static createProgramFromSource(gl, vertexSource, fragmentSource) {
    const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
    const program = this.createProgram(gl, vertexShader, fragmentShader)
    
    // 清理着色器对象（程序已链接）
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    
    return program
  }
  
  /**
   * 获取所有attribute位置
   * @param {Object} attributeNames - 可以是数组 ['a_position'] 或对象 {position: 'a_position'}
   * @returns {Object} 键值对 {position: location}
   */
  static getAttributeLocations(gl, program, attributeNames) {
    const locations = {}
    
    if (Array.isArray(attributeNames)) {
      // 数组格式：['a_position', 'a_color'] → {position: loc, color: loc}
      for (const name of attributeNames) {
        const key = name.replace(/^a_/, '') // 去掉 'a_' 前缀
        locations[key] = gl.getAttribLocation(program, name)
      }
    } else {
      // 对象格式：{position: 'a_position'} → {position: loc}
      for (const [key, name] of Object.entries(attributeNames)) {
        locations[key] = gl.getAttribLocation(program, name)
      }
    }
    
    return locations
  }
  
  /**
   * 获取所有uniform位置
   * @param {Object} uniformNames - 可以是数组 ['u_resolution'] 或对象 {resolution: 'u_resolution'}
   * @returns {Object} 键值对 {resolution: location}
   */
  static getUniformLocations(gl, program, uniformNames) {
    const locations = {}
    
    if (Array.isArray(uniformNames)) {
      // 数组格式：['u_resolution'] → {resolution: loc}
      for (const name of uniformNames) {
        const key = name.replace(/^u_/, '') // 去掉 'u_' 前缀
        locations[key] = gl.getUniformLocation(program, name)
      }
    } else {
      // 对象格式：{resolution: 'u_resolution'} → {resolution: loc}
      for (const [key, name] of Object.entries(uniformNames)) {
        locations[key] = gl.getUniformLocation(program, name)
      }
    }
    
    return locations
  }
}
