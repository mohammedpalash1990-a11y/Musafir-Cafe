@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (python server.py) else (
    echo Python was not found. Install Python 3, or use the Android Termux instructions in LOCAL-SERVER-README-BN.txt.
    pause
  )
)
pause
