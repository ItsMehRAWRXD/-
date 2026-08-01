@echo off
setlocal

:: ── Find ml64 ────────────────────────────────────────────────────────────
set ML64=
for /f "delims=" %%i in ('where ml64 2^>nul') do set ML64=%%i
if not defined ML64 (
    for %%v in (2022 2019 2017) do (
        for %%e in (Enterprise Professional Community BuildTools) do (
            set T=C:\Program Files\Microsoft Visual Studio\%%v\%%e\VC\Tools\MSVC
            if exist "!T!" (
                for /f "delims=" %%p in ('dir /b /ad "!T!"') do (
                    set ML64=!T!\%%p\bin\Hostx64\x64\ml64.exe
                    goto :found_ml64
                )
            )
        )
    )
)
:found_ml64
if not defined ML64 (
    echo [ERROR] ml64.exe not found. Install MSVC Build Tools.
    exit /b 1
)
echo [OK] ml64: %ML64%

:: ── Find link ────────────────────────────────────────────────────────────
for /f "delims=" %%i in ('where link 2^>nul') do set LINK=%%i
if not defined LINK (
    echo [ERROR] link.exe not found. Run from a VS Developer Command Prompt.
    exit /b 1
)

:: ── Paths ─────────────────────────────────────────────────────────────────
set SRC=%~dp0rawrz_ipc.asm
set OBJ=%~dp0rawrz_ipc.obj
set EXE=%~dp0..\rawrz_ipc.exe

:: ── Assemble ─────────────────────────────────────────────────────────────
echo [BUILD] Assembling %SRC%...
"%ML64%" /c /Fo "%OBJ%" /W0 "%SRC%"
if errorlevel 1 (
    echo [ERROR] Assembly failed.
    exit /b 1
)

:: ── Link ─────────────────────────────────────────────────────────────────
echo [BUILD] Linking...
"%LINK%" "%OBJ%" kernel32.lib ws2_32.lib ^
    /SUBSYSTEM:CONSOLE ^
    /ENTRY:IPC_Main ^
    /OUT:"%EXE%" ^
    /NODEFAULTLIB ^
    /MACHINE:X64
if errorlevel 1 (
    echo [ERROR] Link failed.
    exit /b 1
)

echo [OK] Built: %EXE%
echo [RUN] Starting IPC server on port 27182...
start "" "%EXE%"
echo [OK] rawrz_ipc.exe launched in background.
