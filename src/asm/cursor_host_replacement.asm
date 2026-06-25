; =============================================================================
; RawrXD Extension Host v1.0 - Pure MASM64 Implementation
; =============================================================================
OPTION CASEMAP:NONE

include masm64_compat.inc
include rawrxd_win64.inc

; ============= EQUATES =============
EXT_MSG_LOAD        equ 1
EXT_MSG_UNLOAD      equ 2
EXT_MSG_RPC         equ 3
EXT_MSG_RIPGREP     equ 4
EXT_MSG_PROTO       equ 5

RIPGREP_TIMEOUT     equ 30000
PROTO_BUF_SIZE      equ 65536
EXT_API_ABI_VERSION equ 1

; Permissions
PERM_FILESYSTEM_READ  equ 1
PERM_FILESYSTEM_WRITE equ 2
PERM_NETWORK          equ 4
PERM_PROCESS          equ 8
PERM_SHELL            equ 16
PERM_DEBUG            equ 128

; ============= STRUCTS =============
ExtensionHostCtx struct
    hPipe           dq ?
    hMailSlot       dq ?
    hRipgrepProc    dq ?
    hProtoPipe      dq ?
    activeExts      dd ?
    maxExts         dd ?
    extTable        dq ?
ExtensionHostCtx ends

RipgrepRequest struct
    query           BYTE 512 DUP (?)
    workingDir      BYTE 260 DUP (?)
    includePattern  BYTE 256 DUP (?)
    excludePattern  BYTE 256 DUP (?)
    caseSensitive   DWORD ?
RipgrepRequest ends

ProtoMessage struct
    msgType         DWORD ?
    payloadLen      DWORD ?
    payload         BYTE PROTO_BUF_SIZE DUP (?)
ProtoMessage ends

RawrXD_ExtensionApi struct
    structSize      dq ?
    abiVersion      dq ?
    pfnLog          dq ?
    pfnRequestPerm  dq ?
    pfnReadFile     dq ?
    pfnWriteFile    dq ?
RawrXD_ExtensionApi ends

RawrXD_ExtActivationCtx struct
    pHostCtx        dq ?
    pApi            dq ?
    extensionSlot   dq ?
    reserved        dq ?
RawrXD_ExtActivationCtx ends

; ============= DATA ==============
.data
szPipeName          db '\\.\pipe\RawrXD_ExtHost',0
szMailSlotName      db '\\.\mailslot\RawrXD_HostEvents',0
szRipgrepExe        db 'rg.exe',0
szRipgrepFallback   db 'C:\Program Files\RawrXD\bin\rg.exe',0
szRipgrepCmdLine    db 'rg.exe --json --stdin',0
szProtoPipe         db '\\.\pipe\RawrXD_AIServer',0
szExtActivate       db 'ExtensionActivate',0
szExtActivateLegacy db 'activate',0
szLogRipgrepNotFound db '[EXT_HOST] Ripgrep not found',0
szLogRipgrepFailed  db '[EXT_HOST] Failed to spawn ripgrep',0

g_HostCtx           ExtensionHostCtx <>
g_ExtApi            RawrXD_ExtensionApi <>
g_ExtActCtx         RawrXD_ExtActivationCtx <>
g_Running           dd 1

; ============= CODE ==============
.code

; -----------------------------------------------------------------------------
; Entry Point
; -----------------------------------------------------------------------------
RawrXD_ExtensionHost proc FRAME
    push rbx
    .pushreg rbx
    sub rsp, 28h
    .allocstack 28h
    .endprolog

    call InitHostContext
    test eax, eax
    jz init_failed

    call InitRipgrepExternal
    call InitProtoHandler
    call HostEventLoop
    call CleanupHost

    xor eax, eax
    add rsp, 28h
    pop rbx
    ret

init_failed:
    mov eax, 1
    add rsp, 28h
    pop rbx
    ret
RawrXD_ExtensionHost endp

; -----------------------------------------------------------------------------
; Initialize Host IPC
; -----------------------------------------------------------------------------
InitHostContext proc FRAME
    push rbx
    .pushreg rbx
    sub rsp, 68h
    .allocstack 68h
    .endprolog

    ; Create named pipe
    mov qword ptr [rsp+60h], 0
    mov qword ptr [rsp+58h], 0
    mov qword ptr [rsp+50h], 65536
    mov qword ptr [rsp+48h], 65536
    mov r9d, PIPE_UNLIMITED_INSTANCES
    mov r8d, PIPE_TYPE_MESSAGE or PIPE_READMODE_MESSAGE or PIPE_WAIT
    mov edx, PIPE_ACCESS_DUPLEX
    lea rcx, szPipeName
    call CreateNamedPipeA
    mov g_HostCtx.hPipe, rax

    cmp rax, INVALID_HANDLE_VALUE
    je failed

    ; Create mailslot
    lea rcx, szMailSlotName
    xor rdx, rdx
    mov r8d, MAILSLOT_WAIT_FOREVER
    xor r9d, r9d
    mov qword ptr [rsp+28h], 0
    call CreateMailslotA
    mov g_HostCtx.hMailSlot, rax

    ; Allocate extension table
    call GetProcessHeap
    mov rcx, rax
    mov edx, HEAP_ZERO_MEMORY
    mov r8, 2048
    call HeapAlloc
    mov g_HostCtx.extTable, rax
    mov g_HostCtx.maxExts, 256

    call InitExtensionApi

    mov eax, 1
    jmp done

failed:
    xor eax, eax

done:
    add rsp, 68h
    pop rbx
    ret
InitHostContext endp

; -----------------------------------------------------------------------------
; Build host API dispatch table
; -----------------------------------------------------------------------------
InitExtensionApi proc FRAME
    .endprolog
    mov g_ExtApi.structSize, SIZEOF RawrXD_ExtensionApi
    mov g_ExtApi.abiVersion, EXT_API_ABI_VERSION

    lea rax, HostApi_Log
    mov g_ExtApi.pfnLog, rax

    lea rax, HostApi_RequestPermission
    mov g_ExtApi.pfnRequestPerm, rax

    lea rax, HostApi_ReadFile
    mov g_ExtApi.pfnReadFile, rax

    lea rax, HostApi_WriteFile
    mov g_ExtApi.pfnWriteFile, rax

    ret
InitExtensionApi endp

; -----------------------------------------------------------------------------
; Ripgrep External Handler
; -----------------------------------------------------------------------------
InitRipgrepExternal proc FRAME
    push rbx
    .pushreg rbx
    push rsi
    .pushreg rsi
    sub rsp, 188h
    .allocstack 188h
    .endprolog

    ; Find ripgrep binary
    lea rcx, szRipgrepExe
    call GetFileAttributesA
    cmp eax, INVALID_FILE_ATTRIBUTES
    jne found_ripgrep

    lea rcx, szRipgrepFallback
    call GetFileAttributesA
    cmp eax, INVALID_FILE_ATTRIBUTES
    jne found_ripgrep

    lea rcx, szLogRipgrepNotFound
    call OutputDebugStringA
    jmp done

found_ripgrep:
    ; Create pipe for ripgrep output
    lea r8, [rsp+40h]
    lea rdx, [rsp+48h]
    xor r9d, r9d
    call CreatePipe

    mov rcx, [rsp+40h]
    mov edx, 1
    xor r8d, r8d
    call SetHandleInformation

    ; Store handle
    mov rbx, [rsp+48h]

    ; Start ripgrep reader thread
    xor ecx, ecx
    lea rdx, RipgrepReaderThread
    xor r8d, r8d
    mov r9, [rsp+40h]
    mov qword ptr [rsp+28h], 0
    mov qword ptr [rsp+20h], 0
    call CreateThread

done:
    add rsp, 188h
    pop rsi
    pop rbx
    ret
InitRipgrepExternal endp

; -----------------------------------------------------------------------------
; Proto Handler
; -----------------------------------------------------------------------------
InitProtoHandler proc FRAME
    sub rsp, 68h
    .allocstack 68h
    .endprolog

    mov qword ptr [rsp+60h], 0
    mov qword ptr [rsp+58h], 0
    mov qword ptr [rsp+50h], 65536
    mov qword ptr [rsp+48h], 65536
    mov r9d, 1
    mov r8d, PIPE_TYPE_MESSAGE or PIPE_READMODE_MESSAGE or PIPE_WAIT
    mov edx, PIPE_ACCESS_DUPLEX
    lea rcx, szProtoPipe
    call CreateNamedPipeA
    mov g_HostCtx.hProtoPipe, rax

    xor ecx, ecx
    lea rdx, ProtoHandlerThread
    xor r8d, r8d
    xor r9d, r9d
    mov qword ptr [rsp+28h], 0
    mov qword ptr [rsp+20h], 0
    call CreateThread

    add rsp, 68h
    ret
InitProtoHandler endp

; -----------------------------------------------------------------------------
; Main Event Loop
; -----------------------------------------------------------------------------
HostEventLoop proc FRAME
    push r12
    .pushreg r12
    sub rsp, 48h
    .allocstack 48h
    .endprolog

loop_top:
    cmp g_Running, 0
    je loop_done

    mov rcx, g_HostCtx.hPipe
    xor rdx, rdx
    call ConnectNamedPipe

    lea r12, [rsp+20h]
    lea r9, [rsp+40h]
    mov r8, 16
    mov rdx, r12
    mov rcx, g_HostCtx.hPipe
    call ReadFile

    test eax, eax
    jz disconnect

    mov eax, dword ptr [r12]

    cmp eax, EXT_MSG_LOAD
    je handle_load
    cmp eax, EXT_MSG_UNLOAD
    je handle_unload
    cmp eax, EXT_MSG_RPC
    je handle_rpc
    cmp eax, EXT_MSG_RIPGREP
    je handle_ripgrep
    cmp eax, EXT_MSG_PROTO
    je handle_proto
    jmp unknown

handle_load:
    lea rcx, [r12+8]
    call HandleExtensionLoad
    jmp respond

handle_unload:
    lea rcx, [r12+8]
    call HandleExtensionUnload
    jmp respond

handle_rpc:
    lea rcx, [r12+8]
    mov rdx, [rsp+40h]
    sub rdx, 8
    call HandleExtensionRPC
    jmp respond

handle_ripgrep:
    lea rcx, [r12+8]
    call HandleRipgrepRequest
    jmp respond

handle_proto:
    lea rcx, [r12+8]
    call HandleProtoMessage
    jmp respond

unknown:
    mov eax, 400

respond:
    mov [rsp+30h], rax
    lea r9, [rsp+40h]
    mov r8, 8
    lea rdx, [rsp+30h]
    mov rcx, g_HostCtx.hPipe
    call WriteFile
    mov rcx, g_HostCtx.hPipe
    call FlushFileBuffers

disconnect:
    mov rcx, g_HostCtx.hPipe
    call DisconnectNamedPipe
    jmp loop_top

loop_done:
    add rsp, 48h
    pop r12
    ret
HostEventLoop endp

; -----------------------------------------------------------------------------
; Extension Loading
; -----------------------------------------------------------------------------
HandleExtensionLoad proc FRAME
    push rsi
    .pushreg rsi
    push rdi
    .pushreg rdi
    push rbx
    .pushreg rbx
    sub rsp, 28h
    .allocstack 28h
    .endprolog

    mov rsi, rcx
    mov rdi, g_HostCtx.extTable
    xor ebx, ebx

find_slot:
    cmp qword ptr [rdi+rbx*8], 0
    je found_slot
    inc ebx
    cmp ebx, g_HostCtx.maxExts
    jb find_slot

    mov eax, 507
    jmp done

found_slot:
    mov rcx, rsi
    call LoadLibraryA
    test rax, rax
    jz load_failed

    mov [rdi+rbx*8], rax

    mov rcx, rax
    lea rdx, szExtActivate
    call GetProcAddress

    test rax, rax
    jnz have_activate

    mov rcx, [rdi+rbx*8]
    lea rdx, szExtActivateLegacy
    call GetProcAddress
    test rax, rax
    jz no_activate

have_activate:
    lea rcx, g_HostCtx
    mov g_ExtActCtx.pHostCtx, rcx
    lea rcx, g_ExtApi
    mov g_ExtActCtx.pApi, rcx
    mov g_ExtActCtx.extensionSlot, rbx
    xor rcx, rcx
    mov g_ExtActCtx.reserved, rcx

    lea rcx, g_ExtActCtx
    call rax

    inc g_HostCtx.activeExts
    mov eax, 200
    jmp done

load_failed:
    mov eax, 500
    jmp done

no_activate:
    mov eax, 501

done:
    add rsp, 28h
    pop rbx
    pop rdi
    pop rsi
    ret
HandleExtensionLoad endp

; -----------------------------------------------------------------------------
; Extension Unload
; -----------------------------------------------------------------------------
HandleExtensionUnload proc FRAME
    .endprolog
    mov eax, 200
    ret
HandleExtensionUnload endp

; -----------------------------------------------------------------------------
; Extension RPC
; -----------------------------------------------------------------------------
HandleExtensionRPC proc FRAME
    .endprolog
    mov rax, 200
    ret
HandleExtensionRPC endp

; -----------------------------------------------------------------------------
; Ripgrep Request Handler
; -----------------------------------------------------------------------------
HandleRipgrepRequest proc FRAME
    push rsi
    .pushreg rsi
    sub rsp, 48h
    .allocstack 48h
    .endprolog

    mov rsi, rcx

    cmp g_HostCtx.hRipgrepProc, 0
    je no_rg

    lea rdx, [rsi].RipgrepRequest.workingDir
    lea r9, [rsp+20h]
    mov r8, 260
    mov rcx, g_HostCtx.hRipgrepProc
    call WriteFile

    mov eax, 202
    jmp done

no_rg:
    mov eax, 503

done:
    add rsp, 48h
    pop rsi
    ret
HandleRipgrepRequest endp

; -----------------------------------------------------------------------------
; Proto Message Handler
; -----------------------------------------------------------------------------
HandleProtoMessage proc FRAME
    push rsi
    .pushreg rsi
    sub rsp, 28h
    .allocstack 28h
    .endprolog

    mov rsi, rcx
    mov eax, (ProtoMessage ptr [rsi]).msgType

    cmp eax, 1
    je config_get
    cmp eax, 2
    je config_set

    mov eax, 400
    jmp done

config_get:
    mov eax, 200
    jmp done

config_set:
    mov eax, 200

done:
    add rsp, 28h
    pop rsi
    ret
HandleProtoMessage endp

; -----------------------------------------------------------------------------
; Background Threads
; -----------------------------------------------------------------------------
RipgrepReaderThread proc FRAME
    push rbx
    .pushreg rbx
    sub rsp, 1048h
    .allocstack 1048h
    .endprolog

    mov rbx, rcx

read_loop:
    lea r12, [rsp+20h]
    lea r9, [rsp+40h]
    mov r8, 4096
    mov rdx, r12
    mov rcx, rbx
    call ReadFile

    test eax, eax
    jz eof

    lea r9, [rsp+48h]
    mov r8, [rsp+40h]
    mov rdx, r12
    mov rcx, g_HostCtx.hMailSlot
    call WriteFile

    jmp read_loop

eof:
    add rsp, 1048h
    pop rbx
    ret
RipgrepReaderThread endp

ProtoHandlerThread proc FRAME
    push r12
    .pushreg r12
    sub rsp, 10040h
    .allocstack 10040h
    .endprolog

accept_loop:
    mov rcx, g_HostCtx.hProtoPipe
    xor rdx, rdx
    call ConnectNamedPipe

    lea r12, [rsp+20h]
    lea r9, [rsp+40h]
    mov r8, SIZEOF ProtoMessage
    mov rdx, r12
    mov rcx, g_HostCtx.hProtoPipe
    call ReadFile

    mov rcx, r12
    call HandleProtoMessage

    mov [rsp+30h], rax
    lea r9, [rsp+40h]
    mov r8, 8
    lea rdx, [rsp+30h]
    mov rcx, g_HostCtx.hProtoPipe
    call WriteFile
    mov rcx, g_HostCtx.hProtoPipe
    call DisconnectNamedPipe

    jmp accept_loop

    add rsp, 10040h
    pop r12
    ret
ProtoHandlerThread endp

; -----------------------------------------------------------------------------
; Host API Functions
; -----------------------------------------------------------------------------
HostApi_Log proc FRAME
    .endprolog
    test rcx, rcx
    jz done
    call OutputDebugStringA
done:
    xor eax, eax
    ret
HostApi_Log endp

HostApi_RequestPermission proc FRAME
    .endprolog
    mov rax, rcx
    and rax, (PERM_PROCESS or PERM_SHELL or PERM_DEBUG)
    test rax, rax
    jnz deny
    mov eax, 1
    ret
deny:
    xor eax, eax
    ret
HostApi_RequestPermission endp

HostApi_ReadFile proc FRAME
    push r10
    .pushreg r10
    push r11
    .pushreg r11
    sub rsp, 58h
    .allocstack 58h
    .endprolog

    mov r10, rdx
    mov r11, r8

    mov qword ptr [rsp+50h], 0
    mov qword ptr [rsp+48h], FILE_ATTRIBUTE_NORMAL
    mov qword ptr [rsp+40h], OPEN_EXISTING
    xor r9d, r9d
    mov r8d, FILE_SHARE_READ
    mov edx, GENERIC_READ
    call CreateFileA

    cmp rax, INVALID_HANDLE_VALUE
    je fail_read

    mov [rsp+18h], rax

    mov eax, r11d
    mov r8d, eax
    lea r9, [rsp+20h]
    mov rdx, r10
    mov rcx, [rsp+18h]
    call ReadFile

    test eax, eax
    jz close_fail_read

    mov rcx, [rsp+18h]
    call CloseHandle
    mov eax, dword ptr [rsp+20h]
    add rsp, 58h
    pop r11
    pop r10
    ret

close_fail_read:
    mov rcx, [rsp+18h]
    call CloseHandle
fail_read:
    mov rax, -1
    add rsp, 58h
    pop r11
    pop r10
    ret
HostApi_ReadFile endp

HostApi_WriteFile proc FRAME
    push r10
    .pushreg r10
    push r11
    .pushreg r11
    sub rsp, 58h
    .allocstack 58h
    .endprolog

    mov r10, rdx
    mov r11, r8

    mov qword ptr [rsp+50h], 0
    mov qword ptr [rsp+48h], FILE_ATTRIBUTE_NORMAL
    mov qword ptr [rsp+40h], CREATE_ALWAYS
    xor r9d, r9d
    xor r8d, r8d
    mov edx, GENERIC_WRITE
    call CreateFileA

    cmp rax, INVALID_HANDLE_VALUE
    je fail_write

    mov [rsp+18h], rax

    mov eax, r11d
    mov r8d, eax
    lea r9, [rsp+20h]
    mov rdx, r10
    mov rcx, [rsp+18h]
    call WriteFile

    test eax, eax
    jz close_fail_write

    mov rcx, [rsp+18h]
    call CloseHandle
    mov eax, dword ptr [rsp+20h]
    add rsp, 58h
    pop r11
    pop r10
    ret

close_fail_write:
    mov rcx, [rsp+18h]
    call CloseHandle
fail_write:
    mov rax, -1
    add rsp, 58h
    pop r11
    pop r10
    ret
HostApi_WriteFile endp

CleanupHost proc FRAME
    .endprolog
    ret
CleanupHost endp

; ============= EXPORTS =============
public RawrXD_ExtensionHost

END

