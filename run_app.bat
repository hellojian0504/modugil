@echo off
cd /d %~dp0
if exist ".venv\Scripts\python.exe" (
    .venv\Scripts\python.exe -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
) else (
    python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
)
pause
