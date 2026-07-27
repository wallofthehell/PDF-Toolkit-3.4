@echo off
:: 관리자 권한 확인
NET SESSION >nul 2>&1
if %errorLevel% == 0 (
    echo Administrator privileges confirmed.
) else (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

echo Searching for hwp.exe...

set "HWP_PATH="
for /f "tokens=*" %%a in ('dir /s /b "C:\Program Files\HNC\*hwp.exe" 2^>nul') do set "HWP_PATH=%%a"
if not defined HWP_PATH (
    for /f "tokens=*" %%a in ('dir /s /b "C:\Program Files (x86)\HNC\*hwp.exe" 2^>nul') do set "HWP_PATH=%%a"
)

if defined HWP_PATH (
    echo Found HWP: "%HWP_PATH%"
    echo Running -regserver...
    "%HWP_PATH%" -regserver
    echo Registration complete! The COM interface error should be fixed.
) else (
    echo ERROR: Could not find hwp.exe in C:\Program Files\HNC or C:\Program Files (x86)\HNC.
    echo Please locate your Hancom Office installation folder and run "hwp.exe -regserver" manually from an Administrator Command Prompt.
)

pause
