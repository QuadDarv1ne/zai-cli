#!/usr/bin/env pwsh
# PowerShell-скрипт для удобного запуска zai-cli

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Args
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $scriptDir ".env"

# Загрузка переменных окружения из .env
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.+)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

& node (Join-Path $scriptDir "zai.js") @Args
