' Para la web local de d3 basket abierta con abrir.vbs (el proceso que escucha en el puerto 4173).
Option Explicit
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell -NoProfile -WindowStyle Hidden -Command ""Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }""", 0, True
MsgBox "d3 basket cerrado.", vbInformation, "d3 basket"
