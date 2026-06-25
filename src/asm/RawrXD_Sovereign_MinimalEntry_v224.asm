; =============================================================================
; Sovereign-Link v22.4.0 - Minimal entry for IAT smoke test
; =============================================================================
; Links with RawrXD_PE64_IAT_Fabricator_v224.asm only - no CRT, no import .lib.
; Entry: main (use /ENTRY:main). Subsystem: Windows (MessageBox).
; =============================================================================

OPTION CASEMAP:NONE

EXTERNDEF __imp_MessageBoxA:QWORD
EXTERNDEF __imp_ExitProcess:QWORD

.DATA
msg_text    BYTE 'Sovereign-Link v22.4.0-IAT', 0
msg_title   BYTE 'RawrXD', 0

.CODE

RawrXD_Sovereign_MinimalEntry_v224_Main PROC
    sub     rsp, 40
    xor     ecx, ecx
    lea     rdx, [msg_text]
    lea     r8, [msg_title]
    xor     r9d, r9d
    call    qword ptr [__imp_MessageBoxA]
    xor     ecx, ecx
    call    qword ptr [__imp_ExitProcess]
    add     rsp, 40
    xor     eax, eax
    ret
RawrXD_Sovereign_MinimalEntry_v224_Main ENDP

END



