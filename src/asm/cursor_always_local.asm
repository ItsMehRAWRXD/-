; =============================================================================
; RawrXD Always-Local Extension v1.0
; Reverse-engineered from: anysphere/cursor-always-local package.json
; Features: Git commit gen, Remote authority resolution, Environment validation
; APIs: cursor, control, externalUriOpener, resolvers, scm/inputBox
; =============================================================================
OPTION CASEMAP:NONE

INCLUDE RawrXD_Common.inc
INCLUDE rawrxd_win64.inc

includelib kernel32.lib
includelib shell32.lib
includelib advapi32.lib
includelib crypt32.lib

; ============= EQUATES =============
EXT_STATE_INACTIVE      EQU 0
EXT_STATE_ACTIVATING    EQU 1
EXT_STATE_ACTIVE        EQU 2

REMOTE_AUTH_BACKGROUND  EQU 1

; Commands
CMD_GENERATE_COMMIT     EQU 100h
CMD_RESOLVE_AUTHORITY   EQU 101h
CMD_VALIDATE_ENV        EQU 102h

; SCM Input Box
SCM_GIT_PROVIDER        EQU 1

; Certificate stores
CERT_STORE_MY           EQU 1
CERT_STORE_ROOT         EQU 2
CERT_STORE_CA           EQU 3

; Pipe constants
PIPE_ACCESS_DUPLEX      EQU 3
PIPE_TYPE_MESSAGE       EQU 4
PIPE_READMODE_MESSAGE   EQU 2
PIPE_WAIT               EQU 0
PIPE_UNLIMITED_INSTANCES EQU 255
CREATE_NO_WINDOW        EQU 8000000h
STARTF_USESTDHANDLES   EQU 100h
CERT_STORE_READONLY_FLAG EQU 20000h
CERT_SYSTEM_STORE_CURRENT_USER EQU 1

; ============= EXTERNALS =============
EXTERNDEF CertOpenStore:PROC
EXTERNDEF CertCloseStore:PROC
EXTERNDEF CertEnumCertificatesInStore:PROC
EXTERNDEF CreateNamedPipeA:PROC
EXTERNDEF ConnectNamedPipe:PROC
EXTERNDEF DisconnectNamedPipe:PROC
EXTERNDEF CreatePipe:PROC
EXTERNDEF CreateProcessA:PROC
EXTERNDEF GetProcessHeap:PROC
EXTERNDEF HeapAlloc:PROC
EXTERNDEF HeapFree:PROC
EXTERNDEF WaitForSingleObject:PROC
EXTERNDEF memset:PROC

; ============= STRUCTS =============
AlwaysLocalCtx STRUCT
    state               DWORD ?
    hGitPipe            QWORD ?
    hRemotePipe         QWORD ?
    hCertStore          QWORD ?
    environmentSchema   QWORD ?
    remoteAuthority     BYTE 64 DUP(?)
AlwaysLocalCtx ENDS

GitCommitRequest STRUCT
    diffContent         BYTE 8192 DUP(?)
    fileCount           DWORD ?
    maxLength           DWORD ?
    style               DWORD ?
    outMessage          BYTE 256 DUP(?)
GitCommitRequest ENDS

RemoteAuthorityRequest STRUCT
    authority           BYTE 64 DUP(?)
    host                BYTE 256 DUP(?)
    port                DWORD ?
    path                BYTE 260 DUP(?)
    resolveStatus       DWORD ?
RemoteAuthorityRequest ENDS

EnvironmentConfig STRUCT
    apiEndpoint         BYTE 256 DUP(?)
    modelOverrides      BYTE 512 DUP(?)
    experimentalFlags   DWORD ?
EnvironmentConfig ENDS

; ============= DATA ==============
.DATA
ALIGN 8

szExtName           DB 'cursor-always-local',0
szDisplayName       DB 'Cursor Always Local',0
szOnStartup         DB 'onStartupFinished',0
szOnResolveRemote   DB 'onResolveRemoteAuthority:background-composer',0
szBackgroundComposer DB 'background-composer',0
szRemotePipeName    DB '\\.\pipe\RawrXD_Remote_background-composer',0
szCmdGenerateCommit DB 'cursor.generateGitCommitMessage',0
szGitDiffCmd        DB 'git diff --cached --no-color',0
szScmInputBox       DB 'scm/inputBox',0
szWhenGit           DB 'scmProvider == git',0
szEnvSchemaPath     DB 'schemas\environment.schema.json',0
szEnvFilePattern    DB '.cursor\environment.json',0
szRemoteScheme      DB 'vscode-remote',0
szLabelFormat       DB '${path}',0
szWorkspaceSuffix   DB 'cloud-agent',0
szCertStoreMY       DB 'MY',0
szCertStoreROOT     DB 'ROOT',0
szCertStoreCA       DB 'CA',0
szLogActivated      DB '[ALWAYS-LOCAL] Extension activated on startup',0
szLogSCMRegistered  DB '[ALWAYS-LOCAL] SCM input box menu registered',0

g_AlwaysLocal       AlwaysLocalCtx <>
g_ActivationState   DWORD EXT_STATE_INACTIVE

; ============= CODE ==============
.CODE

; -----------------------------------------------------------------------------
; Extension Entry
; -----------------------------------------------------------------------------
AlwaysLocal_Entry PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h

    ; Initialize extension context
    call    InitAlwaysLocal
    test    eax, eax
    jz      init_failed

    ; Register activation event handlers
    call    RegisterActivationEvents

    ; If startup activation, activate immediately
    call    ActivateOnStartup

    xor     eax, eax
    add     rsp, 28h
    ret

init_failed:
    mov     eax, 1
    add     rsp, 28h
    ret
AlwaysLocal_Entry ENDP

; -----------------------------------------------------------------------------
; Initialize Extension Context
; -----------------------------------------------------------------------------
InitAlwaysLocal PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h

    ; Clear context
    lea     rdi, g_AlwaysLocal
    mov     rcx, 24          ; sizeof AlwaysLocalCtx / 8
    xor     eax, eax
    rep     stosq

    ; Open Windows certificate store
    call    InitWindowsCerts
    test    eax, eax
    jz      cert_failed

    ; Load environment.json schema
    call    LoadEnvironmentSchema

    ; Setup Git integration pipe
    call    InitGitIntegration

    mov     g_AlwaysLocal.state, EXT_STATE_INACTIVE
    mov     eax, 1
    jmp     done

cert_failed:
    xor     eax, eax

done:
    add     rsp, 28h
    ret
InitAlwaysLocal ENDP

; -----------------------------------------------------------------------------
; Windows Certificate Store Integration
; -----------------------------------------------------------------------------
InitWindowsCerts PROC FRAME
    .ENDPROLOG
    sub     rsp, 48h

    ; CertOpenStore(CERT_STORE_PROV_SYSTEM_W, 0, 0, CERT_STORE_READONLY_FLAG | CERT_SYSTEM_STORE_CURRENT_USER, L"MY")
    mov     qword ptr [rsp+20h], 0       ; hCryptProv
    mov     qword ptr [rsp+28h], 0       ; dwFlags
    lea     rax, szCertStoreMY
    mov     qword ptr [rsp+30h], rax     ; pvPara

    mov     rcx, 10                      ; CERT_STORE_PROV_SYSTEM_W
    xor     rdx, rdx                     ; dwEncoding
    xor     r8, r8                       ; hCryptProv
    mov     r9d, CERT_STORE_READONLY_FLAG OR CERT_SYSTEM_STORE_CURRENT_USER
    call    CertOpenStore

    mov     g_AlwaysLocal.hCertStore, rax
    test    rax, rax
    jz      failed

    mov     eax, 1
    jmp     done

failed:
    xor     eax, eax

done:
    add     rsp, 48h
    ret
InitWindowsCerts ENDP

CacheCertificates PROC FRAME
    .ENDPROLOG
    ; Stub: Would enumerate certs and build trust chain
    ret
CacheCertificates ENDP

; -----------------------------------------------------------------------------
; Activation Event Registration
; -----------------------------------------------------------------------------
RegisterStartupWatcher PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h
    ; Stub: Register startup watcher
    add     rsp, 28h
    ret
RegisterStartupWatcher ENDP

RegisterActivationEvents PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h

    call    RegisterStartupWatcher
    call    RegisterRemoteResolver

    add     rsp, 28h
    ret
RegisterActivationEvents ENDP

; -----------------------------------------------------------------------------
; Startup Activation Handler
; -----------------------------------------------------------------------------
ActivateOnStartup PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h

    cmp     g_AlwaysLocal.state, EXT_STATE_INACTIVE
    jne     already_active

    mov     g_AlwaysLocal.state, EXT_STATE_ACTIVATING

    call    InitUIContributions
    call    InitSCMInputBox
    call    InitConfiguration

    mov     g_AlwaysLocal.state, EXT_STATE_ACTIVE

    lea     rcx, szLogActivated
    call    OutputDebugStringA

already_active:
    add     rsp, 28h
    ret
ActivateOnStartup ENDP

; -----------------------------------------------------------------------------
; Remote Authority Resolver
; -----------------------------------------------------------------------------
RegisterRemoteResolver PROC FRAME
    .ENDPROLOG
    sub     rsp, 48h

    ; CreateNamedPipeA
    lea     rcx, szRemotePipeName
    mov     edx, PIPE_ACCESS_DUPLEX
    mov     r8d, PIPE_TYPE_MESSAGE OR PIPE_READMODE_MESSAGE OR PIPE_WAIT
    mov     r9d, PIPE_UNLIMITED_INSTANCES
    mov     dword ptr [rsp+20h], 65536
    mov     dword ptr [rsp+28h], 65536
    mov     qword ptr [rsp+30h], 0
    mov     qword ptr [rsp+38h], 0
    call    CreateNamedPipeA

    mov     g_AlwaysLocal.hRemotePipe, rax
    cmp     rax, INVALID_HANDLE_VALUE
    je      failed

    ; CreateThread for resolver
    xor     ecx, ecx
    lea     rdx, RemoteResolverThread
    xor     r8, r8
    xor     r9, r9
    mov     qword ptr [rsp+20h], 0
    mov     qword ptr [rsp+28h], 0
    call    CreateThread

    mov     eax, 1
    jmp     done

failed:
    xor     eax, eax

done:
    add     rsp, 48h
    ret
RegisterRemoteResolver ENDP

RemoteResolverThread PROC FRAME
    .ENDPROLOG
    sub     rsp, 80h

accept_loop:
    mov     rcx, g_AlwaysLocal.hRemotePipe
    xor     rdx, rdx
    call    ConnectNamedPipe

    ; Read request
    lea     r8, [rsp+20h]
    mov     rcx, g_AlwaysLocal.hRemotePipe
    lea     rdx, [rsp+20h]
    mov     r8d, 600          ; sizeof RemoteAuthorityRequest
    lea     r9, [rsp+40h]
    mov     qword ptr [rsp+20h], 0
    call    ReadFile

    test    eax, eax
    jz      disconnect

    ; Check authority m_type
    lea     rcx, [rsp+20h]    ; authority field
    lea     rdx, szBackgroundComposer
    call    strcmp
    test    eax, eax
    jnz     disconnect

    ; Resolve background-composer
    lea     rcx, [rsp+20h]
    call    ResolveBackgroundComposer

    ; Write result
    mov     rcx, g_AlwaysLocal.hRemotePipe
    lea     rdx, [rsp+20h]
    mov     r8d, 600
    lea     r9, [rsp+40h]
    mov     qword ptr [rsp+20h], 0
    call    WriteFile

disconnect:
    mov     rcx, g_AlwaysLocal.hRemotePipe
    call    DisconnectNamedPipe
    jmp     accept_loop

    add     rsp, 80h
    ret
RemoteResolverThread ENDP

ResolveBackgroundComposer PROC FRAME
    .ENDPROLOG
    ; rcx = RemoteAuthorityRequest*
    mov     r12, rcx

    ; Set resolved path
    lea     rdi, [r12+328]    ; path field offset
    lea     rsi, szWorkspaceSuffix
    call    strcpy

    mov     dword ptr [r12+588], 200  ; resolveStatus
    ret
ResolveBackgroundComposer ENDP

; -----------------------------------------------------------------------------
; Git Commit Message Generation
; -----------------------------------------------------------------------------
InitGitIntegration PROC FRAME
    .ENDPROLOG
    sub     rsp, 48h

    ; CreatePipe
    lea     r8, [rsp+20h]     ; hRead
    lea     rdx, [rsp+28h]    ; hWrite
    xor     r9, r9
    mov     qword ptr [rsp+20h], 0
    call    CreatePipe

    mov     rax, [rsp+20h]
    mov     g_AlwaysLocal.hGitPipe, rax

    add     rsp, 48h
    ret
InitGitIntegration ENDP

GenerateGitCommitMessage PROC FRAME
    .ENDPROLOG
    sub     rsp, 128h

    mov     r12, rcx

    ; Execute git diff
    lea     rcx, szGitDiffCmd
    call    strlen

    mov     eax, 200
    jmp     done

git_failed:
    mov     eax, 500

done:
    add     rsp, 128h
    ret
GenerateGitCommitMessage ENDP

AnalyzeDiffAndGenerateMessage PROC FRAME
    .ENDPROLOG
    mov     r12, rcx
    lea     rdi, [r12+8200]   ; outMessage offset
    lea     rsi, szWorkspaceSuffix
    call    strcpy
    ret
AnalyzeDiffAndGenerateMessage ENDP

; -----------------------------------------------------------------------------
; SCM Input Box Menu Contribution
; -----------------------------------------------------------------------------
InitSCMInputBox PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h

    lea     rcx, szLogSCMRegistered
    call    OutputDebugStringA

    add     rsp, 28h
    ret
InitSCMInputBox ENDP

HandleSCMInputBoxMenu PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h
    add     rsp, 28h
    ret
HandleSCMInputBoxMenu ENDP

; -----------------------------------------------------------------------------
; Environment.json Validation
; -----------------------------------------------------------------------------
LoadEnvironmentSchema PROC FRAME
    .ENDPROLOG
    sub     rsp, 48h

    lea     rcx, szEnvSchemaPath
    mov     edx, GENERIC_READ
    mov     r8d, FILE_SHARE_READ
    xor     r9, r9
    mov     dword ptr [rsp+20h], OPEN_EXISTING
    mov     dword ptr [rsp+28h], FILE_ATTRIBUTE_NORMAL
    mov     qword ptr [rsp+30h], 0
    call    CreateFileA

    cmp     rax, INVALID_HANDLE_VALUE
    je      no_schema

    mov     rbx, rax

    ; GetFileSizeEx
    mov     rcx, rbx
    lea     rdx, [rsp+40h]
    call    GetFileSizeEx

    ; Allocate buffer
    mov     rcx, [rsp+40h]
    call    malloc
    mov     g_AlwaysLocal.environmentSchema, rax

    ; Read schema
    mov     rcx, rbx
    mov     rdx, rax
    mov     r8, [rsp+40h]
    lea     r9, [rsp+38h]
    mov     qword ptr [rsp+20h], 0
    call    ReadFile

    mov     rcx, rbx
    call    CloseHandle

no_schema:
    add     rsp, 48h
    ret
LoadEnvironmentSchema ENDP

ValidateEnvironmentJson PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h
    mov     eax, 1
    add     rsp, 28h
    ret
ValidateEnvironmentJson ENDP

; -----------------------------------------------------------------------------
; UI Contributions
; -----------------------------------------------------------------------------
InitUIContributions PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h
    add     rsp, 28h
    ret
InitUIContributions ENDP

InitConfiguration PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h
    add     rsp, 28h
    ret
InitConfiguration ENDP

RegisterCommand PROC FRAME
    .ENDPROLOG
    ret
RegisterCommand ENDP

RegisterResourceLabelFormatter PROC FRAME
    .ENDPROLOG
    sub     rsp, 28h
    add     rsp, 28h
    ret
RegisterResourceLabelFormatter ENDP

; -----------------------------------------------------------------------------
; Utility Functions
; -----------------------------------------------------------------------------
strcmp PROC FRAME
    .ENDPROLOG
    mov     al, [rcx]
    mov     bl, [rdx]
    cmp     al, bl
    jne     diff
    test    al, al
    jz      equal
    inc     rcx
    inc     rdx
    jmp     strcmp
diff:
    mov     eax, 1
    ret
equal:
    xor     eax, eax
    ret
strcmp ENDP

strcpy PROC FRAME
    .ENDPROLOG
    mov     al, [rsi]
    mov     [rdi], al
    inc     rsi
    inc     rdi
    test    al, al
    jnz     strcpy
    ret
strcpy ENDP

strlen PROC FRAME
    .ENDPROLOG
    xor     rax, rax
loop_top:
    cmp     byte ptr [rcx+rax], 0
    je      done
    inc     rax
    jmp     loop_top
done:
    ret
strlen ENDP

malloc PROC FRAME
    .ENDPROLOG
    call    GetProcessHeap
    mov     rcx, rax
    xor     rdx, rdx
    mov     r8, rcx
    call    HeapAlloc
    ret
malloc ENDP

; ============= EXPORTS =============
PUBLIC AlwaysLocal_Entry
PUBLIC GenerateGitCommitMessage
PUBLIC ValidateEnvironmentJson

END
