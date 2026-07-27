$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")

try {
    $listener.Start()
} catch {
    Write-Host "[Info] Server is already running on port 8080. Exiting this duplicate instance."
    exit 0
}

Write-Host "Server running at http://localhost:8080/ (Hidden mode with Watchdog)"
Write-Host "Press Ctrl+C to stop"

$root = $PSScriptRoot

# 1. Custom URL Protocol (pdftoolkit://) 자동 레지스트리 등록
try {
    $vbsPath = Join-Path $root "run_hidden_server.vbs"
    $regKey = "HKCU:\Software\Classes\pdftoolkit"
    if (-not (Test-Path $regKey)) { New-Item -Path $regKey -Force -ErrorAction SilentlyContinue | Out-Null }
    Set-ItemProperty -Path $regKey -Name "(Default)" -Value "URL:PDF Toolkit Protocol" -ErrorAction SilentlyContinue | Out-Null
    Set-ItemProperty -Path $regKey -Name "URL Protocol" -Value "" -ErrorAction SilentlyContinue | Out-Null
    
    $regCmd = "$regKey\shell\open\command"
    if (-not (Test-Path $regCmd)) { New-Item -Path $regCmd -Force -ErrorAction SilentlyContinue | Out-Null }
    $execVal = "`"C:\Windows\System32\wscript.exe`" `"//B`" `"$vbsPath`" `"%1`""
    Set-ItemProperty -Path $regCmd -Name "(Default)" -Value $execVal -ErrorAction SilentlyContinue | Out-Null
    Write-Host "[Success] Registered URL Protocol: pdftoolkit://"
} catch {
    Write-Host "[Warning] Could not register URL protocol: $_"
}

# 2. 탐색기 맞춤형 아이콘 (폴더 아이콘 및 전용 실행 바로가기) 설정
try {
    $icoPath = Join-Path $root "favicon.ico"
    $iniPath = Join-Path $root "desktop.ini"
    
    # 폴더 시스템 속성 부여 (desktop.ini 아이콘 반영)
    if (Test-Path $iniPath) {
        attrib.exe +s $root
        attrib.exe +h +s $iniPath
    }

    # 탐색기 전용 멋진 아이콘이 입혀진 바로가기(.lnk) 파일 자동 생성
    $lnkPath = Join-Path $root "PDF Toolkit v4 (아이콘 실행).lnk"
    $WshShell = New-Object -ComObject WScript.Shell
    $shortcut = $WshShell.CreateShortcut($lnkPath)
    $shortcut.TargetPath = "C:\Windows\System32\wscript.exe"
    $shortcut.Arguments = "`"//B`" `"$vbsPath`""
    if (Test-Path $icoPath) {
        $shortcut.IconLocation = "$icoPath, 0"
    }
    $shortcut.Description = "PDF Toolkit v4 - 숨김 모드 브라우저 실행"
    $shortcut.WorkingDirectory = $root
    $shortcut.Save()
    Write-Host "[Success] Configured Explorer folder icon and application shortcut."
} catch {
    Write-Host "[Warning] Could not create Explorer shortcut: $_"
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

$lastActivityTime = Get-Date

while ($listener.IsListening) {
    # 5분(300초) 비활성화 시 자동 종료를 위한 비동기 대기 루프
    $asyncResult = $listener.BeginGetContext($null, $null)
    while (-not $asyncResult.AsyncWaitHandle.WaitOne(1000)) {
        $elapsed = ((Get-Date) - $lastActivityTime).TotalSeconds
        if ($elapsed -ge 300) {
            Write-Host "[Watchdog] 5 minutes of inactivity elapsed. Auto-terminating server."
            $listener.Stop()
            exit 0
        }
    }

    try {
        $context = $listener.EndGetContext($asyncResult)
    } catch {
        break
    }

    $request = $context.Request
    $response = $context.Response
    $path = $request.Url.LocalPath

    if ($request.HttpMethod -eq 'OPTIONS') {
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Headers", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $response.StatusCode = 204
        $response.Close()
        continue
    }

    # 상태 조회 (타이머 리셋하지 않음)
    if ($path -eq "/api/status") {
        $response.ContentType = "application/json"
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $rem = [math]::max(0, 300 - [int]((Get-Date) - $lastActivityTime).TotalSeconds)
        $msg = [System.Text.Encoding]::UTF8.GetBytes("`{" + "`"status`":`"online`",`"remainingSeconds`":$rem" + "`}")
        $response.OutputStream.Write($msg, 0, $msg.Length)
        $response.Close()
        continue
    }

    # 활동 유지 신호 (타이머 리셋)
    if ($path -eq "/api/keep-alive") {
        $lastActivityTime = Get-Date
        $response.ContentType = "application/json"
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $msg = [System.Text.Encoding]::UTF8.GetBytes("`{" + "`"status`":`"refreshed`"" + "`}")
        $response.OutputStream.Write($msg, 0, $msg.Length)
        $response.Close()
        continue
    }

    # 서버 종료 요청 (다른 탭으로 이동 시 혹은 수동 종료 시)
    if ($path -eq "/api/shutdown") {
        Write-Host "[Command] Shutdown received from frontend."
        $response.ContentType = "application/json"
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $msg = [System.Text.Encoding]::UTF8.GetBytes("`{" + "`"status`":`"shutting_down`"" + "`}")
        $response.OutputStream.Write($msg, 0, $msg.Length)
        $response.Close()
        Start-Sleep -Milliseconds 200
        $listener.Stop()
        exit 0
    }

    # HWP -> PDF 변환 요청
    if ($path -eq "/api/convert-hwp" -and $request.HttpMethod -eq 'POST') {
        $lastActivityTime = Get-Date
        $fileNameHeader = $request.Headers["X-File-Name"]
        $ext = ".hwp"
        if ($fileNameHeader) {
            $ext = [System.IO.Path]::GetExtension([System.Uri]::UnescapeDataString($fileNameHeader))
            if (-not $ext) { $ext = ".hwp" }
        }
        
        $baseTemp = [System.IO.Path]::GetTempFileName()
        Remove-Item $baseTemp -Force -ErrorAction SilentlyContinue
        
        $tempHwp = $baseTemp -replace '\.tmp$', $ext
        $tempPdf = $baseTemp -replace '\.tmp$', '.pdf'
        
        try {
            # Read binary from POST body
            $stream = $request.InputStream
            $fileStream = [System.IO.File]::Create($tempHwp)
            $stream.CopyTo($fileStream)
            $fileStream.Close()

            Write-Host "Converting $tempHwp to PDF using Python pyhwpx..."

            $pythonScript = Join-Path $root "hwp_to_pdf.py"
            try {
                $process = Start-Process -FilePath "python" -ArgumentList "`"$pythonScript`"", "`"$tempHwp`"" -NoNewWindow -Wait -PassThru -ErrorAction Stop
            } catch {
                Write-Host "Python execution failed or not installed."
            }

            # Fallback to pure PowerShell COM if Python failed to create PDF
            if (-not (Test-Path $tempPdf)) {
                Write-Host "Falling back to native PowerShell COM object conversion..."
                $hwp = New-Object -ComObject HwpFrame.HwpObject
                $hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample") | Out-Null
                $opened = $hwp.Open($tempHwp, "", "forceopen:true")
                if ($opened) {
                    $hwp.SaveAs($tempPdf, "PDF", "")
                    $hwp.Quit()
                } else {
                    $hwp.Quit()
                    throw "Failed to open HWP file via COM"
                }
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($hwp) | Out-Null
            }

            if (Test-Path $tempPdf) {
                $response.ContentType = "application/pdf"
                $response.AddHeader("Access-Control-Allow-Origin", "*")
                $bytes = [System.IO.File]::ReadAllBytes($tempPdf)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "Converted HWP to PDF successfully"
            } else {
                throw "PDF conversion failed (file not created)"
            }
        } catch {
            Write-Host "Error during conversion: $_"
            $response.StatusCode = 500
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $msg = [System.Text.Encoding]::UTF8.GetBytes("Error: $_")
            $response.OutputStream.Write($msg, 0, $msg.Length)
        } finally {
            if (Test-Path $tempHwp) { Remove-Item $tempHwp -Force -ErrorAction SilentlyContinue }
            if (Test-Path $tempPdf) { Remove-Item $tempPdf -Force -ErrorAction SilentlyContinue }
            $response.Close()
            $lastActivityTime = Get-Date
        }
        continue
    }

    # 정적 파일 서빙 (일반 요청)
    if ($path -eq "/") { $path = "/index.html" }
    $filePath = Join-Path $root $path.TrimStart("/")

    if (Test-Path $filePath) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        $contentType = $mimeTypes[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }

        $response.ContentType = $contentType
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        Write-Host "$($request.HttpMethod) $path -> 200"
    } else {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($msg, 0, $msg.Length)
        Write-Host "$($request.HttpMethod) $path -> 404"
    }
    $response.Close()
}
