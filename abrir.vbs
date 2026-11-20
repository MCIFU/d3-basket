' d3 basket sin ventanas: hace lo mismo que iniciar.bat pero oculto y abre la web en el navegador.
' Doble clic para abrir. Si la web ya esta abierta, solo abre el navegador.
' Lo que haria la ventana negra se guarda en data\iniciar.log; si algo falla, sale un aviso.
' Para pararlo: cerrar.vbs.
Option Explicit
Dim sh, fso, dir, url, http, ok, code
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://localhost:4173"

ok = False
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.Open "GET", url, False
http.Send
If Err.Number = 0 Then
  If http.Status = 200 Then ok = True
End If
Err.Clear
On Error GoTo 0

If ok Then
  sh.Run url
Else
  If Not fso.FolderExists(dir & "\data") Then fso.CreateFolder dir & "\data"
  sh.CurrentDirectory = dir
  sh.Environment("Process")("D3_OCULTO") = "1"
  ' 0 = ventana oculta; True = esperar (iniciar.bat se queda sirviendo la web hasta cerrar.vbs).
  code = sh.Run("cmd /c iniciar.bat > data\iniciar.log 2>&1", 0, True)
  If code <> 0 Then
    MsgBox "d3 basket no ha podido abrirse." & vbCrLf & vbCrLf & _
      "El detalle esta en " & dir & "\data\iniciar.log", vbExclamation, "d3 basket"
  End If
End If
