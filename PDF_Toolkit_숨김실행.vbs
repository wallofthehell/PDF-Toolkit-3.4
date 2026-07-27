Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

psScript = currentDir & "\server.ps1"
cmd = "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & psScript & """"

' 실행 환경 및 인자 확인 (레지스트리 프로토콜 pdftoolkit:// 호출 여부 등)
openBrowser = True
If WScript.Arguments.Count > 0 Then
    arg = LCase(WScript.Arguments(0))
    If InStr(arg, "quiet") > 0 Or InStr(arg, "pdftoolkit:") > 0 Then
        openBrowser = False
    End If
End If

' 검은색 도스 창을 완전히 숨김(0) 처리하여 백그라운드로 실행
WshShell.Run cmd, 0, False

If openBrowser Then
    WScript.Sleep 1000
    WshShell.Run "http://localhost:8080/", 1, False
End If
