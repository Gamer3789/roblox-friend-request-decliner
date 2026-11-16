@echo off
setlocal
cd /d "%~dp0"
set "COMPILER=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%COMPILER%" set "COMPILER=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%COMPILER%" (
  echo .NET Framework compiler not found. Install the .NET Framework developer tools.
  pause
  exit /b 1
)
"%COMPILER%" /nologo /target:winexe /out:RequestDecliner-v2.exe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Security.dll /reference:System.Web.Extensions.dll RequestDecliner.cs
if errorlevel 1 (
  echo Build failed. Close the app before rebuilding it.
  pause
  exit /b 1
)
echo Build complete.
pause
