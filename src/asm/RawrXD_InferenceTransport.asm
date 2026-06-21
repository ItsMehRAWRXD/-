; =============================================================================
; RawrXD_InferenceTransport.asm
; Pure x64 MASM - Raw Winsock2 HTTP/1.1 inference transport
;
; No WinHTTP. No Ollama client SDK. No scaffolding. No bridges.
; Direct TCP socket stream to any HTTP/1.1 inference server.
;
; Exports:
;   RawrInfer_Init         -- call once at startup (WSAStartup)
;   RawrInfer_Shutdown     -- call at exit (WSACleanup)
;   RawrInfer_Connect      -- TCP connect to host:port -> SOCKET (UINT64)
;   RawrInfer_Disconnect   -- closesocket
;   RawrInfer_PostSync     -- HTTP POST, collect full body into caller buffer
;   RawrInfer_PostStream   -- HTTP POST, call line_cb per NDJSON line
;
; Callback proto for PostStream:
;   INT64 __cdecl cb(const char* line, SIZE_T line_len, void* ctx)
;   Return 1 to continue, 0 to stop.
;
; Architecture: x64 MASM64, Windows x64 ABI (RCX, RDX, R8, R9, stack+28h...)
; Build: ml64.exe /c /Zi /Zd RawrXD_InferenceTransport.asm
; Link: part of RawrXD-Win32IDE target (added to ASM_KERNEL_SOURCES in CMakeLists)
; =============================================================================

OPTION CASEMAP:NONE
INCLUDE RawrXD_Common.inc

; === Winsock2 / socket constants ==============================================
SOCK_STREAM_V           EQU 1
AF_INET_V               EQU 2
IPPROTO_TCP_V           EQU 6
INVALID_SOCKET_V        EQU 0FFFFFFFFFFFFFFFFh
SOCKET_ERROR_V          EQU 0FFFFFFFFh
WSA_VERSION             EQU 0202h           ; MAKEWORD(2,2)

; ADDRINFOA field offsets (Windows x64 ABI)
AI_FLAGS_OFF            EQU 0
AI_FAMILY_OFF           EQU 4
AI_SOCKTYPE_OFF         EQU 8
AI_PROTOCOL_OFF         EQU 12
AI_ADDRLEN_OFF          EQU 16
AI_CANONNAME_OFF        EQU 24
AI_ADDR_OFF             EQU 32
AI_NEXT_OFF             EQU 40
AI_SIZEOF               EQU 48

; Heap
HEAP_ZERO_MEMORY_V      EQU 8h

; Buffer sizes (heap allocated)
RECV_BUF_SIZE_V         EQU 4096
LINE_BUF_SIZE_V         EQU 65536
HDR_BUF_SIZE_V          EQU 2048

; === Library imports ==========================================================
includelib ws2_32.lib
includelib kernel32.lib

EXTERN WSAStartup       : PROC
EXTERN WSACleanup       : PROC
EXTERN socket           : PROC
EXTERN connect          : PROC
EXTERN send             : PROC
EXTERN recv             : PROC
EXTERN closesocket      : PROC
EXTERN getaddrinfo      : PROC
EXTERN freeaddrinfo     : PROC
EXTERN GetProcessHeap   : PROC
EXTERN HeapAlloc        : PROC
EXTERN HeapFree         : PROC
EXTERN RtlZeroMemory    : PROC

; === Public exports ===========================================================
PUBLIC RawrInfer_Init
PUBLIC RawrInfer_Shutdown
PUBLIC RawrInfer_Connect
PUBLIC RawrInfer_Disconnect
PUBLIC RawrInfer_PostSync
PUBLIC RawrInfer_PostStream

; === Read-only string literals ================================================
.const
ALIGN 4
s_POST              DB "POST ", 0
s_HTTP11            DB " HTTP/1.1", 0Dh, 0Ah, 0
s_HostHdr           DB "Host: ", 0
s_HostPortSep       DB ":", 0
s_ContentType       DB "Content-Type: application/json", 0Dh, 0Ah, 0
s_ContentLength     DB "Content-Length: ", 0
s_ConnClose         DB "Connection: close", 0Dh, 0Ah, 0
s_CRLF              DB 0Dh, 0Ah, 0
s_Localhost         DB "localhost", 0

; === Writable data ============================================================
.data
ALIGN 8
g_wsadata           DB 512 DUP(0)   ; WSADATA (max blockSize = ~400 bytes)
g_wsaStarted        BYTE 0

; ADDRINFOA hints - written once by Init, treated as read-only thereafter
ALIGN 8
g_hints             DWORD 0             ; ai_flags
                    DWORD AF_INET_V     ; ai_family
                    DWORD SOCK_STREAM_V ; ai_socktype
                    DWORD IPPROTO_TCP_V ; ai_protocol
                    QWORD 0             ; ai_addrlen
                    QWORD 0             ; ai_canonname
                    QWORD 0             ; ai_addr
                    QWORD 0             ; ai_next

; === Code =====================================================================
.code

; =============================================================================
; PRIVATE: rawrinfer_strlen
;   RCX = PCSTR str
;   Returns RAX = length (not including null)
;   Clobbers: RAX only
; =============================================================================
rawrinfer_strlen PROC FRAME
    sub     rsp, 28h
    .allocstack 28h
    .endprolog

    xor     eax, eax
@@sl:
    cmp     BYTE PTR [rcx+rax], 0
    je      @@sld
    inc     rax
    jmp     @@sl
@@sld:
    add     rsp, 28h
    ret
rawrinfer_strlen ENDP

; =============================================================================
; PRIVATE: rawrinfer_append_str
;   RCX = PCSTR src (null-terminated)
;   RDX = PCHAR dst write cursor
;   Returns RAX = new write cursor (past last byte written, before null)
;   Clobbers: RAX, R8
; =============================================================================
rawrinfer_append_str PROC FRAME
    sub     rsp, 28h
    .allocstack 28h
    .endprolog

    mov     rax, rdx            ; init write cursor
@@loop:
    movzx   r8d, BYTE PTR [rcx]
    test    r8b, r8b
    jz      @@done
    mov     [rax], r8b
    inc     rcx
    inc     rax
    jmp     @@loop
@@done:
    add     rsp, 28h
    ret
rawrinfer_append_str ENDP

; =============================================================================
; PRIVATE: rawrinfer_append_u64
;   RCX = UINT64 value
;   RDX = PCHAR dst write cursor
;   Returns RAX = new write cursor past last digit
;   Clobbers: RAX, R8, R9, R10, R11
; =============================================================================
rawrinfer_append_u64 PROC FRAME
    push    rsi
    .pushreg rsi
    push    rdi
    .pushreg rdi
    sub     rsp, 38h
    .allocstack 38h
    .endprolog

    ; digit string buffer at [rsp+20h], 24 bytes (22 digits max + null)
    mov     rdi, rdx            ; dst cursor -> rdi
    mov     rax, rcx            ; value -> rax

    test    rax, rax
    jnz     @@nonzero
    mov     BYTE PTR [rdi], '0'
    inc     rdi
    jmp     @@done

@@nonzero:
    ; Write digits in reverse into [rsp+20h..rsp+37h]
    lea     rsi, [rsp+20h]      ; buffer start
    xor     r8d, r8d            ; digit count

    mov     r9, 10              ; divisor

@@div_loop:
    test    rax, rax
    jz      @@copy_back
    xor     edx, edx
    div     r9                  ; rax=quot, rdx=rem
    add     dl, '0'
    mov     [rsi+r8], dl
    inc     r8
    jmp     @@div_loop

@@copy_back:
    ; digits are at [rsi+0..r8-1] reversed -> copy reversed to [rdi]
    dec     r8
@@copy_loop:
    cmp     r8, 0
    jl      @@done
    movzx   r10d, BYTE PTR [rsi+r8]
    mov     [rdi], r10b
    inc     rdi
    dec     r8
    jmp     @@copy_loop

@@done:
    mov     rax, rdi            ; return new cursor
    add     rsp, 38h
    pop     rdi
    pop     rsi
    ret
rawrinfer_append_u64 ENDP

; =============================================================================
; PRIVATE: rawrinfer_build_request
;   RCX = PCHAR host
;   RDX = PCHAR path
;   R8  = PCHAR body (unused, just for signature consistency)
;   R9  = SIZE_T body_len
;   [rsp+28h] = PCHAR out_buf (output buffer, HDR_BUF_SIZE_V bytes)
;   Returns RAX = total request bytes written to out_buf
;
;   Builds:
;     POST <path> HTTP/1.1\r\n
;     Host: <host>\r\n
;     Content-Type: application/json\r\n
;     Content-Length: <body_len>\r\n
;     Connection: close\r\n
;     \r\n
;   (body is NOT appended here - caller sends header then body separately)
; =============================================================================
rawrinfer_build_request PROC FRAME
    push    rbx
    .pushreg rbx
    push    rsi
    .pushreg rsi
    push    rdi
    .pushreg rdi
    push    r12
    .pushreg r12
    push    r13
    .pushreg r13
    push    r14
    .pushreg r14
    sub     rsp, 50h
    .allocstack 50h
    .endprolog

    mov     rbx, rcx            ; host
    mov     rsi, rdx            ; path
    mov     r12, r8             ; body (unused here, just received)
    mov     r13, r9             ; body_len
    ; 5th arg at [rsp+28h] from caller's perspective
    ; After 6 pushes (48 bytes) + sub 50h (80 bytes) + ret addr (8 bytes) = 136 bytes
    ; Entry RSP = caller_RSP - 8. After pushes: caller_RSP - 8 - 48 = caller_RSP - 56
    ; After sub 50h: caller_RSP - 56 - 80 = caller_RSP - 136
    ; Arg5 at caller_RSP + 28h = our_RSP + 136 + 28h = our_RSP + 15Eh? No.
    ; Let's recalculate: our_RSP + 6*8 + 50h + 8 + 28h = our_RSP + 48 + 80 + 8 + 40 = our_RSP + 176 = our_RSP + 0B0h
    mov     r14, [rsp+0B0h]     ; out_buf

    mov     rdi, r14            ; write cursor

    ; "POST "
    lea     rcx, s_POST
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; <path>
    mov     rcx, rsi
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; " HTTP/1.1\r\n"
    lea     rcx, s_HTTP11
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "Host: "
    lea     rcx, s_HostHdr
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; <host>
    mov     rcx, rbx
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "\r\n"
    lea     rcx, s_CRLF
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "Content-Type: application/json\r\n"
    lea     rcx, s_ContentType
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "Content-Length: "
    lea     rcx, s_ContentLength
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; <body_len as decimal>
    mov     rcx, r13
    mov     rdx, rdi
    call    rawrinfer_append_u64
    mov     rdi, rax

    ; "\r\n"
    lea     rcx, s_CRLF
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "Connection: close\r\n"
    lea     rcx, s_ConnClose
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "\r\n" (blank line - end of headers)
    lea     rcx, s_CRLF
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; return byte count
    sub     rdi, r14
    mov     rax, rdi

    add     rsp, 50h
    pop     r14
    pop     r13
    pop     r12
    pop     rdi
    pop     rsi
    pop     rbx
    ret
rawrinfer_build_request ENDP

; =============================================================================
; PRIVATE: rawrinfer_skip_headers
;   RCX = PCHAR buf
;   RDX = SIZE_T buf_len
;   Returns RAX = offset of first byte of body (past \r\n\r\n), or 0 if not found
; =============================================================================
rawrinfer_skip_headers PROC FRAME
    sub     rsp, 28h
    .allocstack 28h
    .endprolog

    ; scan for \r\n\r\n
    xor     eax, eax            ; current offset
    sub     rdx, 3              ; need at least 4 bytes remaining
    jle     @@not_found
@@scan:
    cmp     rax, rdx
    jge     @@not_found
    movzx   r8d, BYTE PTR [rcx+rax]
    cmp     r8b, 0Dh
    jne     @@next
    movzx   r8d, BYTE PTR [rcx+rax+1]
    cmp     r8b, 0Ah
    jne     @@next
    movzx   r8d, BYTE PTR [rcx+rax+2]
    cmp     r8b, 0Dh
    jne     @@next
    movzx   r8d, BYTE PTR [rcx+rax+3]
    cmp     r8b, 0Ah
    jne     @@next
    ; found \r\n\r\n at offset rax
    add     rax, 4              ; body starts here
    jmp     @@done
@@next:
    inc     rax
    jmp     @@scan
@@not_found:
    xor     eax, eax
@@done:
    add     rsp, 28h
    ret
rawrinfer_skip_headers ENDP

; =============================================================================
; RawrInfer_Init
;   Initializes Winsock2. Call once at startup.
;   Returns: 0 on success, nonzero on failure.
; =============================================================================
RawrInfer_Init PROC FRAME
    sub     rsp, 28h
    .allocstack 28h
    .endprolog

    cmp     BYTE PTR [g_wsaStarted], 0
    jne     @@already_done

    mov     ecx, WSA_VERSION
    lea     rdx, g_wsadata
    call    WSAStartup
    test    eax, eax
    jnz     @@fail

    mov     BYTE PTR [g_wsaStarted], 1
    xor     eax, eax
    jmp     @@done

@@already_done:
    xor     eax, eax
    jmp     @@done

@@fail:
    ; eax already has error code
@@done:
    add     rsp, 28h
    ret
RawrInfer_Init ENDP

; =============================================================================
; RawrInfer_Shutdown
;   Cleans up Winsock2.
; =============================================================================
RawrInfer_Shutdown PROC FRAME
    sub     rsp, 28h
    .allocstack 28h
    .endprolog

    cmp     BYTE PTR [g_wsaStarted], 0
    je      @@done

    call    WSACleanup
    mov     BYTE PTR [g_wsaStarted], 0

@@done:
    add     rsp, 28h
    ret
RawrInfer_Shutdown ENDP

; =============================================================================
; RawrInfer_Connect
;   RCX = const char* host  (ASCII)
;   RDX = int port
;   Returns RAX = SOCKET handle, or INVALID_SOCKET_V on failure
; =============================================================================
RawrInfer_Connect PROC FRAME
    push    rbx
    .pushreg rbx
    push    rsi
    .pushreg rsi
    push    rdi
    .pushreg rdi
    push    r12
    .pushreg r12
    push    r13
    .pushreg r13
    sub     rsp, 70h
    .allocstack 70h
    .endprolog

    mov     rbx, rcx            ; host string
    mov     r12d, edx           ; port (int)

    ; Convert port to ASCII for getaddrinfo service arg
    ; Port string buffer at [rsp+40h]
    lea     rdi, [rsp+40h]
    mov     rcx, r12            ; port value
    movzx   rcx, cx             ; ensure 16-bit port, zero-extend to 64
    mov     rdx, rdi
    call    rawrinfer_append_u64
    ; null-terminate
    mov     BYTE PTR [rax], 0

    ; getaddrinfo(host, port_str, &hints, &result)
    ; result ptr stored at [rsp+30h]
    lea     r13, [rsp+30h]      ; &result storage
    mov     QWORD PTR [r13], 0  ; zero result pointer

    mov     rcx, rbx            ; host
    lea     rdx, [rsp+40h]      ; port string
    lea     r8, g_hints         ; hints
    mov     r9, r13             ; &result
    call    getaddrinfo
    test    eax, eax
    jnz     @@fail_no_free

    ; Load result->ai_addr and result->ai_addrlen
    mov     rsi, [r13]          ; rsi = PADDRINFOA result
    test    rsi, rsi
    jz      @@fail_no_free

    ; Create socket using ai_family/ai_socktype/ai_protocol from result
    movsx   rcx, word ptr [rsi+AI_FAMILY_OFF]
    movsx   rdx, word ptr [rsi+AI_SOCKTYPE_OFF]
    movsx   r8, word ptr [rsi+AI_PROTOCOL_OFF]
    call    socket
    cmp     rax, INVALID_SOCKET_V
    je      @@fail_free

    mov     rbx, rax            ; save socket handle

    ; connect(sock, result->ai_addr, (int)result->ai_addrlen)
    mov     rcx, rbx
    mov     rdx, [rsi+AI_ADDR_OFF]
    mov     r8d, DWORD PTR [rsi+AI_ADDRLEN_OFF]
    call    connect
    cmp     eax, SOCKET_ERROR_V
    je      @@fail_close

    ; success
    mov     rcx, rsi            ; free addrinfo
    call    freeaddrinfo
    mov     rax, rbx            ; return socket
    jmp     @@done

@@fail_close:
    mov     rcx, rbx
    call    closesocket
@@fail_free:
    mov     rcx, rsi
    call    freeaddrinfo
@@fail_no_free:
    mov     rax, INVALID_SOCKET_V
@@done:
    add     rsp, 70h
    pop     r13
    pop     r12
    pop     rdi
    pop     rsi
    pop     rbx
    ret
RawrInfer_Connect ENDP

; =============================================================================
; RawrInfer_Disconnect
;   RCX = SOCKET handle
; =============================================================================
RawrInfer_Disconnect PROC FRAME
    sub     rsp, 28h
    .allocstack 28h
    .endprolog

    cmp     rcx, INVALID_SOCKET_V
    je      @@done
    call    closesocket
@@done:
    add     rsp, 28h
    ret
RawrInfer_Disconnect ENDP

; =============================================================================
; RawrInfer_PostSync
;   RCX = SOCKET sock
;   RDX = const char* path
;   R8  = const char* body
;   R9  = SIZE_T body_len
;   [rsp+28h] = char* out_buf   (output buffer)
;   [rsp+30h] = SIZE_T out_max  (max bytes to write to out_buf)
;   Returns RAX = bytes written to out_buf, or -1 on failure
; =============================================================================
RawrInfer_PostSync PROC FRAME
    push    rbx
    .pushreg rbx
    push    rsi
    .pushreg rsi
    push    rdi
    .pushreg rdi
    push    r12
    .pushreg r12
    push    r13
    .pushreg r13
    push    r14
    .pushreg r14
    push    r15
    .pushreg r15
    sub     rsp, 58h
    .allocstack 58h
    .endprolog

    mov     r12, rcx            ; sock
    mov     r13, rdx            ; path
    mov     r14, r8             ; body
    mov     r15, r9             ; body_len
    ; arg5 (out_buf) at [rsp+28h] from caller = our_rsp + 7*8 + 58h + 8 + 28h = our_rsp + 0B8h
    ; arg6 (out_max) at [rsp+30h] from caller = our_rsp + 0C0h
    mov     rsi, [rsp+0B8h]     ; out_buf
    mov     rdi, [rsp+0C0h]     ; out_max

    ; Allocate header build buffer on heap
    call    GetProcessHeap
    mov     rbx, rax            ; heap handle
    mov     rcx, rax
    mov     rdx, HEAP_ZERO_MEMORY_V
    mov     r8, HDR_BUF_SIZE_V
    call    HeapAlloc
    test    rax, rax
    jz      @@free_hdr
    mov     r11, rax            ; hdr_buf

    ; Build request headers inline (use localhost as host)
    mov     rdi, r11            ; write cursor = hdr_buf

    ; "POST "
    lea     rcx, s_POST
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; <path>
    mov     rcx, r13
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; " HTTP/1.1\r\n"
    lea     rcx, s_HTTP11
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "Host: localhost\r\n"
    lea     rcx, s_HostHdr
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    lea     rcx, s_Localhost
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    lea     rcx, s_CRLF
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "Content-Type: application/json\r\n"
    lea     rcx, s_ContentType
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "Content-Length: " <body_len> "\r\n"
    lea     rcx, s_ContentLength
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    mov     rcx, r15            ; body_len
    mov     rdx, rdi
    call    rawrinfer_append_u64
    mov     rdi, rax

    lea     rcx, s_CRLF
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "Connection: close\r\n"
    lea     rcx, s_ConnClose
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; "\r\n" (end of headers)
    lea     rcx, s_CRLF
    mov     rdx, rdi
    call    rawrinfer_append_str
    mov     rdi, rax

    ; header_len = rdi - r11
    sub     rdi, r11
    mov     r8, rdi             ; header_len

    ; send(sock, hdr_buf, header_len, 0)
    mov     rcx, r12
    mov     rdx, r11
    xor     r9d, r9d
    call    send
    cmp     eax, SOCKET_ERROR_V
    je      @@cleanup_fail

    ; send(sock, body, body_len, 0)
    mov     rcx, r12
    mov     rdx, r14            ; body
    mov     r8, r15             ; body_len
    xor     r9d, r9d
    call    send
    cmp     eax, SOCKET_ERROR_V
    je      @@cleanup_fail

    ; Allocate recv buffer
    mov     rcx, rbx            ; heap
    mov     rdx, HEAP_ZERO_MEMORY_V
    mov     r8, RECV_BUF_SIZE_V
    call    HeapAlloc
    test    rax, rax
    jz      @@cleanup_fail
    mov     r13, rax            ; recv_buf

    ; Accumulate response
    xor     r14d, r14d          ; total bytes received
    xor     r15d, r15d          ; headers_skipped flag
    mov     r8, rsi             ; out_buf write position (save original out_buf)
    push    rdi                  ; save out_max on stack
    mov     rdi, [rsp+8]        ; out_max (after push)

@@recv_loop:
    mov     rcx, r12            ; sock
    mov     rdx, r13            ; recv_buf
    mov     r8d, RECV_BUF_SIZE_V
    xor     r9d, r9d
    call    recv
    cmp     eax, 0
    jle     @@recv_done

    movsxd   r10, eax            ; bytes_received

    ; If headers not yet skipped, scan for \r\n\r\n
    test    r15d, r15d
    jnz     @@copy_body

    mov     rcx, r13            ; recv_buf
    mov     rdx, r10             ; recv count
    call    rawrinfer_skip_headers
    test    rax, rax
    jz      @@recv_loop         ; headers not complete yet, keep reading
    ; found end of headers at offset rax
    ; body starts at r13[rax]
    mov     r15d, 1             ; headers skipped
    mov     r11, rax            ; body_offset in this chunk
    jmp     @@copy_from_offset

@@copy_body:
    xor     r11d, r11d          ; start from beginning of recv_buf

@@copy_from_offset:
    ; copy bytes from recv_buf[r11..r10-1] to out_buf
    mov     rcx, r10
    sub     rcx, r11            ; bytes available
    jle     @@recv_loop

    ; check out_max limit
    mov     rax, rdi             ; out_max
    sub     rax, r14             ; remaining space
    cmp     rcx, rax
    cmova   rcx, rax            ; limit to remaining space

    ; copy bytes
    lea     rsi, [r13+r11]       ; source = recv_buf + offset
    lea     rdx, [r8+r14]        ; dest = out_buf + total_received
    ; inline memcpy: rdx=dest, rsi=src, rcx=count
@@cp:
    movzx   eax, BYTE PTR [rsi]
    mov     [rdx], al
    inc     rsi
    inc     rdx
    dec     rcx
    jnz     @@cp

    add     r14, rax            ; update total received
    jmp     @@recv_loop

@@recv_done:
    mov     rax, r14            ; return bytes copied

    ; free recv buffer
    push    rax
    call    GetProcessHeap
    mov     rcx, rax
    xor     rdx, rdx
    mov     r8, r13
    call    HeapFree
    pop     rax
    pop     rdi                 ; restore out_max (balance stack)
    jmp     @@free_hdr

@@cleanup_fail:
    mov     rax, -1             ; error
    pop     rdi                 ; balance stack if we pushed

@@free_hdr:
    ; free header buffer
    push    rax
    call    GetProcessHeap
    mov     rcx, rax
    xor     rdx, rdx
    mov     r8, r11
    call    HeapFree
    pop     rax

    add     rsp, 58h
    pop     r15
    pop     r14
    pop     r13
    pop     r12
    pop     rdi
    pop     rsi
    pop     rbx
    ret
RawrInfer_PostSync ENDP

; =============================================================================
; RawrInfer_PostStream
;   RCX = SOCKET sock
;   RDX = const char* path
;   R8  = const char* body
;   R9  = SIZE_T body_len
;   [rsp+28h] = INT64 (__cdecl *cb)(const char*, SIZE_T, void*)
;   [rsp+30h] = void* ctx
;   Returns RAX = 1 on success (all lines processed), 0 on error/cancel
;
;   Streams NDJSON: for each '\n'-terminated line in the HTTP body,
;   calls cb(line_ptr, line_len, ctx). cb returns 1=continue, 0=stop.
; =============================================================================
RawrInfer_PostStream PROC FRAME
    push    rbx
    .pushreg rbx
    push    rsi
    .pushreg rsi
    push    rdi
    .pushreg rdi
    push    r12
    .pushreg r12
    push    r13
    .pushreg r13
    push    r14
    .pushreg r14
    push    r15
    .pushreg r15
    sub     rsp, 50h
    .allocstack 50h
    .endprolog

    mov     r12, rcx            ; sock
    mov     r13, rdx            ; path
    mov     r14, r8             ; body
    mov     r15, r9             ; body_len
    ; arg5 (cb) at [rsp+28h] from caller = our_rsp + 7*8 + 50h + 8 + 28h = our_rsp + 0B8h
    ; arg6 (ctx) at [rsp+30h] from caller = our_rsp + 0C0h
    mov     rbx, [rsp+0B8h]     ; cb function ptr
    mov     rsi, [rsp+0C0h]     ; ctx

    ; Allocate header buffer
    call    GetProcessHeap
    mov     rdi, rax            ; heap handle
    mov     rcx, rax
    mov     rdx, HEAP_ZERO_MEMORY_V
    mov     r8, HDR_BUF_SIZE_V
    call    HeapAlloc
    test    rax, rax
    jz      @@ps_fail
    mov     r11, rax            ; hdr_buf

    ; Build headers inline
    mov     r10, rax            ; hdr_buf write cursor

    lea     rcx, s_POST
    mov     rdx, r10
    call    rawrinfer_append_str
    mov     r10, rax

    mov     rcx, r13            ; path
    mov     rdx, r10
    call    rawrinfer_append_str
    mov     r10, rax

    lea     rcx, s_HTTP11
    mov     rdx, r10
    call    rawrinfer_append_str
    mov     r10, rax

    lea     rcx, s_HostHdr
    mov     rdx, r10
    call    rawrinfer_append_str
    mov     r10, rax

    lea     rcx, s_Localhost
    mov     rdx, r10
    call    rawrinfer_append_str
    mov     r10, rax

    lea     rcx, s_CRLF
    mov     rdx, r10
    call    rawrinfer_append_str
    mov     r10, rax

    lea     rcx, s_ContentType
    mov     rdx, r10
    call    rawrinfer_append_str
    mov     r10, rax

    lea     rcx, s_ContentLength
    mov     rdx, r10
    call    rawrinfer_append_str
    mov     r10, rax

    mov     rcx, r15            ; body_len
    mov     rdx, r10
    call    rawrinfer_append_u64
    mov     r10, rax

    lea     rcx, s_CRLF
    mov     rdx, r10
    call    rawrinfer_append_str
    mov     r10, rax

    lea     rcx, s_ConnClose
    mov     rdx, r10
    call    rawrinfer_append_str
    mov     r10, rax

    lea     rcx, s_CRLF
    mov     rdx, r10
    call    rawrinfer_append_str
    ; rax = end of headers (write cursor)

    ; Compute header length = rax - r11
    sub     rax, r11
    mov     r8, rax             ; header_len

    ; send headers
    mov     rcx, r12
    mov     rdx, r11            ; hdr_buf
    xor     r9d, r9d
    call    send
    cmp     eax, SOCKET_ERROR_V
    je      @@ps_fail

    ; send body
    mov     rcx, r12
    mov     rdx, r14
    mov     r8, r15
    xor     r9d, r9d
    call    send
    cmp     eax, SOCKET_ERROR_V
    je      @@ps_fail

    ; Allocate recv + line buffers
    mov     rcx, rdi            ; heap
    mov     rdx, HEAP_ZERO_MEMORY_V
    mov     r8, RECV_BUF_SIZE_V
    call    HeapAlloc
    test    rax, rax
    jz      @@ps_fail
    push    rax                 ; [rsp+0] = recv_buf (save for cleanup)

    mov     rcx, rdi
    mov     rdx, HEAP_ZERO_MEMORY_V
    mov     r8, LINE_BUF_SIZE_V
    call    HeapAlloc
    test    rax, rax
    jz      @@ps_fail_alloc
    push    rax                 ; [rsp+8] = line_buf (save for cleanup)

    ; Stack layout after 2 pushes:
    ; [rsp+0] = line_buf
    ; [rsp+8] = recv_buf
    ; [rsp+10h] = hdr_buf (from earlier, but we track in r11)

    xor     r13d, r13d          ; line_buf write offset
    xor     r14d, r14d          ; headers_skipped flag

@@ps_recv:
    mov     rcx, r12
    mov     rdx, [rsp+8]        ; recv_buf
    mov     r8d, RECV_BUF_SIZE_V
    xor     r9d, r9d
    call    recv
    cmp     eax, 0
    jle     @@ps_done_ok

    movsxd   r11, eax            ; bytes_received
    xor     r10d, r10d          ; byte offset in recv chunk

    ; Skip HTTP headers if not yet done
    test    r14d, r14d
    jnz     @@ps_line_scan

    mov     rcx, [rsp+8]        ; recv_buf
    mov     rdx, r11            ; recv count
    call    rawrinfer_skip_headers
    test    rax, rax
    jz      @@ps_recv           ; not enough data yet, keep reading
    mov     r10, rax            ; start byte offset for body in this chunk
    mov     r14d, 1             ; headers now skipped

@@ps_line_scan:
    ; scan recv_buf[r10..r11-1] for newlines, accumulate lines
    cmp     r10, r11
    jge     @@ps_recv

    mov     r9, [rsp+8]         ; recv_buf base
    movzx   eax, BYTE PTR [r9+r10]
    cmp     al, 0Ah             ; '\n'
    je      @@ps_emit_line

    ; append char to line_buf
    mov     r8, [rsp]           ; line_buf
    mov     [r8+r13], al
    inc     r13
    cmp     r13, LINE_BUF_SIZE_V - 2
    jl      @@ps_next_byte
    ; line buffer full - emit and reset
    jmp     @@ps_emit_line

@@ps_next_byte:
    inc     r10
    jmp     @@ps_line_scan

@@ps_emit_line:
    ; null-terminate
    mov     r8, [rsp]           ; line_buf
    mov     BYTE PTR [r8+r13], 0

    ; call cb(line_buf, line_len, ctx) only if line is non-empty
    test    r13d, r13d
    jz      @@ps_reset_line

    mov     rcx, r8             ; line ptr
    mov     rdx, r13            ; line len
    mov     r8, rsi             ; ctx
    call    rbx                 ; cb(line, len, ctx)
    test    rax, rax
    jz      @@ps_done_cancel    ; cb returned 0 = stop

@@ps_reset_line:
    xor     r13d, r13d          ; reset line offset
    inc     r10
    jmp     @@ps_line_scan

@@ps_done_cancel:
    xor     eax, eax
    jmp     @@ps_free

@@ps_done_ok:
    mov     eax, 1

@@ps_free:
    push    rax                 ; save result

    ; free line_buf
    mov     rcx, rdi
    xor     rdx, rdx
    mov     r8, [rsp+8]         ; line_buf (offset adjusted for push)
    call    HeapFree

    ; free recv_buf
    mov     rcx, rdi
    xor     rdx, rdx
    mov     r8, [rsp+10h]       ; recv_buf (offset adjusted for push)
    call    HeapFree

    ; free hdr_buf
    mov     rcx, rdi
    xor     rdx, rdx
    mov     r8, r11
    call    HeapFree

    pop     rax                 ; restore result
    jmp     @@done

@@ps_fail_alloc:
    ; free recv_buf if allocated
    mov     rcx, rdi
    xor     rdx, rdx
    mov     r8, [rsp]           ; recv_buf (before line_buf push)
    call    HeapFree

@@ps_fail:
    xor     eax, eax

@@done:
    add     rsp, 50h
    pop     r15
    pop     r14
    pop     r13
    pop     r12
    pop     rdi
    pop     rsi
    pop     rbx
    ret
RawrInfer_PostStream ENDP

END
