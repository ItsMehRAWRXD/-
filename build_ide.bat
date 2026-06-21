@echo off
setlocal

set MSVC_VER=14.51.36231
set WINSDK_VER=10.0.22621.0

set "VCROOT=C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Tools\MSVC\%MSVC_VER%"
set "WINSDK=C:\Program Files (x86)\Windows Kits\10"

set "INCLUDE=%VCROOT%\include;%WINSDK%\Include\%WINSDK_VER%\ucrt;%WINSDK%\Include\%WINSDK_VER%\um;%WINSDK%\Include\%WINSDK_VER%\shared"
set "LIB=%VCROOT%\lib\x64;%WINSDK%\Lib\%WINSDK_VER%\ucrt\x64;%WINSDK%\Lib\%WINSDK_VER%\um\x64"
set "PATH=%VCROOT%\bin\Hostx64\x64;%PATH%"

cl.exe /nologo /O2 /W3 /std:c++17 /Fe:d:\rawrxd\build-autocomplete\bin\RawrXD_IDE.exe d:\rawrxd\src\ide\RawrXD_IDE.cpp /link /SUBSYSTEM:WINDOWS user32.lib kernel32.lib gdi32.lib comctl32.lib shell32.lib ws2_32.lib advapi32.lib ole32.lib oleaut32.lib comdlg32.lib

echo Exit code: %ERRORLEVEL%
