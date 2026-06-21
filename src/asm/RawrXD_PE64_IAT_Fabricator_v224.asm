; =============================================================================
; RawrXD PE64 IAT Fabricator - Sovereign-Link reference v22.4.0
; =============================================================================
; Manual IMAGE_IMPORT_DESCRIPTOR + ILT + IAT + hint/name table for:
;   KERNEL32.dll, USER32.dll, GDI32.dll
;
; Build (MASM x64):
;   ml64.exe /c /W3 /nologo /Zi /Fo RawrXD_PE64_IAT_Fabricator_v224.obj ^
;        RawrXD_PE64_IAT_Fabricator_v224.asm
;   link.exe /nologo /subsystem:windows /entry:main ^
;        your_entry.obj RawrXD_PE64_IAT_Fabricator_v224.obj kernel32.lib user32.lib gdi32.lib
;
; From code:
;   EXTERN __imp_ExitProcess:QWORD
;   call [__imp_ExitProcess]
;
; Notes:
;   - All IDT / thunk slots use RVA-relative addressing for correct PE layout.
;   - Hints are 0 (portable). The loader matches by name.
;   - ILT and IAT are pre-bound to the same hint/name RVAs; the loader overwrites IAT.
; =============================================================================

option  casemap:none

; =============================================================================
; DATA SEGMENT - Import Tables
; =============================================================================
.data

; --- IMAGE_IMPORT_DESCRIPTOR structure (20 bytes each) -----------------------
; OriginalFirstThunk (4), TimeDateStamp (4), ForwarderChain (4), Name (4), FirstThunk (4)

ALIGN   16

; Descriptor 0 - KERNEL32
iid_kernel32 LABEL BYTE
    dd      OFFSET ilt_k32          ; OriginalFirstThunk (RVA)
    dd      0                        ; TimeDateStamp
    dd      0                        ; ForwarderChain
    dd      OFFSET name_k32          ; Name (RVA)
    dd      OFFSET iat_k32           ; FirstThunk (RVA)

; Descriptor 1 - USER32
iid_user32 LABEL BYTE
    dd      OFFSET ilt_u32          ; OriginalFirstThunk (RVA)
    dd      0                        ; TimeDateStamp
    dd      0                        ; ForwarderChain
    dd      OFFSET name_u32          ; Name (RVA)
    dd      OFFSET iat_u32           ; FirstThunk (RVA)

; Descriptor 2 - GDI32
iid_gdi32 LABEL BYTE
    dd      OFFSET ilt_g32          ; OriginalFirstThunk (RVA)
    dd      0                        ; TimeDateStamp
    dd      0                        ; ForwarderChain
    dd      OFFSET name_g32          ; Name (RVA)
    dd      OFFSET iat_g32           ; FirstThunk (RVA)

; Null terminator (20 bytes of zeros)
iid_null LABEL BYTE
    dd      0, 0, 0, 0, 0

ALIGN   8

; --- Import Lookup Tables (ILT) - PE32+ IMAGE_THUNK_DATA64 (QWORD) -----------

ilt_k32 LABEL QWORD
    dq      OFFSET hn_ExitProcess
    dq      OFFSET hn_GetModuleHandleA
    dq      OFFSET hn_LoadLibraryA
    dq      OFFSET hn_GetProcAddress
    dq      0

ilt_u32 LABEL QWORD
    dq      OFFSET hn_MessageBoxA
    dq      OFFSET hn_CreateWindowExA
    dq      OFFSET hn_RegisterClassExA
    dq      OFFSET hn_DefWindowProcA
    dq      0

ilt_g32 LABEL QWORD
    dq      OFFSET hn_CreateSolidBrush
    dq      OFFSET hn_CreatePen
    dq      OFFSET hn_SelectObject
    dq      OFFSET hn_DeleteObject
    dq      0

ALIGN   8

; --- Import Address Tables (IAT) - mirror ILT until load-time patch ----------

iat_k32 LABEL QWORD
PUBLIC  __imp_ExitProcess
__imp_ExitProcess LABEL QWORD
    dq      OFFSET hn_ExitProcess
PUBLIC  __imp_GetModuleHandleA
__imp_GetModuleHandleA LABEL QWORD
    dq      OFFSET hn_GetModuleHandleA
PUBLIC  __imp_LoadLibraryA
__imp_LoadLibraryA LABEL QWORD
    dq      OFFSET hn_LoadLibraryA
PUBLIC  __imp_GetProcAddress
__imp_GetProcAddress LABEL QWORD
    dq      OFFSET hn_GetProcAddress
    dq      0

iat_u32 LABEL QWORD
PUBLIC  __imp_MessageBoxA
__imp_MessageBoxA LABEL QWORD
    dq      OFFSET hn_MessageBoxA
PUBLIC  __imp_CreateWindowExA
__imp_CreateWindowExA LABEL QWORD
    dq      OFFSET hn_CreateWindowExA
PUBLIC  __imp_RegisterClassExA
__imp_RegisterClassExA LABEL QWORD
    dq      OFFSET hn_RegisterClassExA
PUBLIC  __imp_DefWindowProcA
__imp_DefWindowProcA LABEL QWORD
    dq      OFFSET hn_DefWindowProcA
    dq      0

iat_g32 LABEL QWORD
PUBLIC  __imp_CreateSolidBrush
__imp_CreateSolidBrush LABEL QWORD
    dq      OFFSET hn_CreateSolidBrush
PUBLIC  __imp_CreatePen
__imp_CreatePen LABEL QWORD
    dq      OFFSET hn_CreatePen
PUBLIC  __imp_SelectObject
__imp_SelectObject LABEL QWORD
    dq      OFFSET hn_SelectObject
PUBLIC  __imp_DeleteObject
__imp_DeleteObject LABEL QWORD
    dq      OFFSET hn_DeleteObject
    dq      0

ALIGN   2

; --- Hint/Name table entries (WORD hint + ASCIIZ) ---------------------------

hn_ExitProcess LABEL BYTE
    dw      0
    db      'ExitProcess', 0

hn_GetModuleHandleA LABEL BYTE
    dw      0
    db      'GetModuleHandleA', 0

hn_LoadLibraryA LABEL BYTE
    dw      0
    db      'LoadLibraryA', 0

hn_GetProcAddress LABEL BYTE
    dw      0
    db      'GetProcAddress', 0

hn_MessageBoxA LABEL BYTE
    dw      0
    db      'MessageBoxA', 0

hn_CreateWindowExA LABEL BYTE
    dw      0
    db      'CreateWindowExA', 0

hn_RegisterClassExA LABEL BYTE
    dw      0
    db      'RegisterClassExA', 0

hn_DefWindowProcA LABEL BYTE
    dw      0
    db      'DefWindowProcA', 0

hn_CreateSolidBrush LABEL BYTE
    dw      0
    db      'CreateSolidBrush', 0

hn_CreatePen LABEL BYTE
    dw      0
    db      'CreatePen', 0

hn_SelectObject LABEL BYTE
    dw      0
    db      'SelectObject', 0

hn_DeleteObject LABEL BYTE
    dw      0
    db      'DeleteObject', 0

; --- DLL names (PE import name strings) --------------------------------------

name_k32 LABEL BYTE
    db      'KERNEL32.dll', 0

name_u32 LABEL BYTE
    db      'USER32.dll', 0

name_g32 LABEL BYTE
    db      'GDI32.dll', 0

; =============================================================================
; CODE SEGMENT - Stub entry (optional, for standalone testing)
; =============================================================================
.code

; Optional entry point for standalone testing
RawrXD_PE64_IAT_Fabricator_v224_Main PROC FRAME
    ; This is a stub - link with actual entry point or remove
    .endprolog
    ret
RawrXD_PE64_IAT_Fabricator_v224_Main ENDP

END


