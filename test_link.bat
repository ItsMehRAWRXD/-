@echo off
setlocal

set "LINK=C:\VS2022Enterprise\VC\Tools\MSVC\14.50.35717\bin\Hostx64\x64\link.exe"
set "WINSDK_PATH=C:\Program Files (x86)\Windows Kits\10"
set "WINSDK_VER=10.0.22621.0"

echo Running linker...
"%LINK%" /DLL /DEBUG /INCREMENTAL:NO /ENTRY:DllMain ^
    /LIBPATH:"%WINSDK_PATH%\Lib\%WINSDK_VER%\um\x64" ^
    /LIBPATH:"%WINSDK_PATH%\Lib\%WINSDK_VER%\ucrt\x64" ^
    /OUT:d:\rawrxd\build-syntax-pipeline\bin\syntax_pipeline.dll ^
    d:\rawrxd\build-syntax-pipeline\syntax_highlight.obj ^
    kernel32.lib user32.lib

echo Exit code: %ERRORLEVEL%
echo.
echo Checking output directory...
dir d:\rawrxd\build-syntax-pipeline\bin\*.dll

endlocal