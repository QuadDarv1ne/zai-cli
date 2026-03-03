@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

:: Загрузка переменных окружения из .env
if exist "%SCRIPT_DIR%.env" (
    for /f "tokens=*" %%a in ('findstr /r /c:"^[^#][^=]*=" "%SCRIPT_DIR%.env"') do (
        set "%%a"
    )
)

node "%SCRIPT_DIR%zai.js" %*
