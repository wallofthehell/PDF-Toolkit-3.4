Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

psScript = currentDir & "\server.ps1"
cmd = "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & psScript & """"

openBrowser = True
If WScript.Arguments.Count > 0 Then
    arg = LCase(WScript.Arguments(0))
    If InStr(arg, "quiet") > 0 Or InStr(arg, "pdftoolkit:") > 0 Then
        openBrowser = False
    End If
End If

WshShell.Run cmd, 0, False

If openBrowser Then
    WScript.Sleep 1000
    WshShell.Run "http://localhost:8080/", 1, False
End If
