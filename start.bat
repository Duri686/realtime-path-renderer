@echo off
echo ========================================
echo 高性能实时路径渲染 Demo 启动脚本
echo ========================================
echo.

echo [1/2] 安装依赖...
call yarn install

if %errorlevel% neq 0 (
    echo 依赖安装失败，请检查网络连接和Node.js环境
    pause
    exit /b 1
)

echo.
echo [2/2] 启动开发服务器...
echo.
echo 项目将在 http://localhost:3000 运行
echo 按 Ctrl+C 停止服务器
echo.

call yarn dev

pause
