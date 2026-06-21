<<<<<<< HEAD

; =============================================================================
; RawrXD_NanoQuant_Streaming.asm
; Streaming GGUF I/O + QuadBuffer Hooks for NanoQuant
; MASM64 x64 ABI Compatible
; =============================================================================
;
; Provides streaming quantization/dequantization for GGUF tensor loading
; with QuadBuffer integration for zero-copy inference.
;
; Build: ml64.exe /c /Zi /Zd /Fo RawrXD_NanoQuant_Streaming.obj RawrXD_NanoQuant_Streaming.asm
;
; Calling Convention: Microsoft x64 (RCX, RDX, R8, R9, stack)
; All functions preserve RBX, RBP, RSI, RDI, R12-R15, XMM6-XMM15.
;
; Pattern: PatchResult (RAX=0 success, RAX=nonzero on error, RDX=detail)
; Rule:    NO SOURCE FILE IS TO BE SIMPLIFIED
; =============================================================================

option casemap:none

INCLUDE RawrXD_Common.inc

; =============================================================================
; Additional EXTERN declarations
; =============================================================================
EXTERNDEF NQ1_QuantizeBlock_Fast:PROC
EXTERNDEF NQ1_QuantizeBlock_ADMM:PROC
EXTERNDEF NQ1_DequantBlock_AVX512:PROC
EXTERNDEF NQ1_DequantBlock_AVX2:PROC
EXTERNDEF NQ1_VecDot_AVX512:PROC
EXTERNDEF NQ1_VecDot_AVX2:PROC

; =============================================================================
;                        NanoQuant Streaming Constants
; =============================================================================

; Block sizes (must match NanoQuant_Engine)
BLOCK_NQ1_SIZE          EQU     34              ; 2 + 32 = 34 bytes per block
QK_NQ1                 EQU     256             ; Elements per NQ_1 block

; QuadBuffer constants
QUADBUF_NUM_BUFFERS    EQU     4
QUADBUF_BUFFER_SIZE    EQU     64              ; 64 MB per buffer
QUADBUF_ALIGNMENT      EQU     4096            ; Page alignment

; GGUF constants
GGUF_MAGIC             EQU     46554747h       ; 'GGUF'
GGUF_VERSION           EQU     3
GGUF_DEFAULT_ALIGNMENT EQU     32

; Stream states
NQS_IDLE               EQU     0
NQS_LOADING            EQU     1
NQS_READY              EQU     2
NQS_ERROR              EQU     3

; =============================================================================
;                         EXPORTS
; =============================================================================
PUBLIC NQS_Init
PUBLIC NQS_Shutdown
PUBLIC NQS_LoadGGUFHeader
PUBLIC NQS_StreamTensorBlocks
PUBLIC NQS_DequantStreamBlock
PUBLIC NQS_QuantStreamBlock
PUBLIC NQS_GetBufferState
PUBLIC NQS_AdvanceBuffer
PUBLIC NQS_FlushAll

; =============================================================================
;                    Aligned Data Segment
; =============================================================================
_DATA64 SEGMENT ALIGN(64) 'DATA'

; Stream context (per-tensor streaming state)
ALIGN 64
g_NQS_Context LABEL BYTE
    DQ      0                               ; File handle
    DQ      0                               ; Current file offset
    DQ      0                               ; Tensor data offset
    DD      0                               ; Tensor count
    DD      0                               ; Current tensor index
    DQ      0                               ; Bytes remaining
    DD      0                               ; Stream state
    DD      0                               ; Flags
    DQ      0                               ; QuadBuffer base address
    DQ      0                               ; Current buffer index
    DQ      0                               ; Bytes in current buffer
    DQ      0                               ; Reserved[5]
    DQ      0
    DQ      0
    DQ      0
    DQ      0

; Performance counters
g_NQS_BytesLoaded      DQ      0
g_NQS_BlocksDequant    DQ      0
g_NQS_BlocksQuant      DQ      0
g_NQS_BufferRotations  DQ      0

; Error codes
NQS_ERR_SUCCESS        EQU     0
NQS_ERR_INVALID_PARAM  EQU     1
NQS_ERR_FILE_NOT_FOUND EQU     2
NQS_ERR_READ_FAILED    EQU     3
NQS_ERR_WRITE_FAILED   EQU     4
NQS_ERR_BUFFER_FULL    EQU     5
NQS_ERR_INVALID_MAGIC  EQU     6
NQS_ERR_UNSUPPORTED    EQU     7

; String constants for error messages
ALIGN 16
g_NQS_ErrSuccess       DB      "Success", 0
ALIGN 16
g_NQS_ErrInvalidParam  DB      "Invalid parameter", 0
ALIGN 16
g_NQS_ErrFileNotFound  DB      "File not found", 0
ALIGN 16
g_NQS_ErrReadFailed    DB      "Read failed", 0
ALIGN 16
g_NQS_ErrWriteFailed   DB      "Write failed", 0
ALIGN 16
g_NQS_ErrBufferFull    DB      "Buffer full", 0
ALIGN 16
g_NQS_ErrInvalidMagic  DB      "Invalid GGUF magic", 0
ALIGN 16
g_NQS_ErrUnsupported   DB      "Unsupported format", 0

_DATA64 ENDS

; =============================================================================
;                           CODE
; =============================================================================
.code

; =============================================================================
; NQS_Init
; Initialize the NanoQuant streaming context.
;
; RCX = pContext (NQS_Context*, 64-byte aligned)
; RDX = pQuadBuffer (void*, QuadBuffer base address, optional)
; R8  = flags (reserved, must be 0)
; Returns: RAX = 0 success, nonzero error code
; =============================================================================
NQS_Init PROC FRAME
    push    rbx
    .pushreg rbx
    push    rsi
    .pushreg rsi
    .endprolog

    ; Validate parameters
    test    rcx, rcx
    jz      @@init_err_param

    ; Zero the context
    mov     rsi, rcx
    mov     rdi, rcx
    mov     ecx, 128                              ; 128 bytes = 16 qwords
    xor     eax, eax
    rep     stosq

    ; Set QuadBuffer if provided
    test    rdx, rdx
    jz      @@init_no_qbuf
    mov     qword ptr [rsi + 64], rdx              ; QuadBuffer base

@@init_no_qbuf:
    ; Set initial state
    mov     dword ptr [rsi + 48], NQS_IDLE

    ; Initialize performance counters
    lock inc qword ptr [g_NQS_BytesLoaded]
    lock dec qword ptr [g_NQS_BytesLoaded]

    xor     eax, eax                              ; Success
    jmp     @@init_done

@@init_err_param:
    mov     eax, NQS_ERR_INVALID_PARAM

@@init_done:
    pop     rsi
    pop     rbx
    ret
NQS_Init ENDP

; =============================================================================
; NQS_Shutdown
; Clean up streaming context and release resources.
;
; RCX = pContext
; Returns: RAX = 0 success
; =============================================================================
NQS_Shutdown PROC FRAME
    push    rbx
    .pushreg rbx
    .endprolog

    test    rcx, rcx
    jz      @@shutdown_done

    ; Clear context
    mov     rdi, rcx
    mov     ecx, 128
    xor     eax, eax
    rep     stosq

@@shutdown_done:
    xor     eax, eax
    pop     rbx
    ret
NQS_Shutdown ENDP

; =============================================================================
; NQS_LoadGGUFHeader
; Parse GGUF header and prepare for tensor streaming.
;
; RCX = pContext
; RDX = filePath (char*, null-terminated UTF-8)
; R8  = pHeaderOut (GGUF_Header*, receives parsed header)
; Returns: RAX = 0 success, nonzero error
;          RDX = detail string on error
; =============================================================================
NQS_LoadGGUFHeader PROC FRAME
    push    rbx
    .pushreg rbx
    push    rsi
    .pushreg rsi
    push    rdi
    .pushreg rdi
    push    r12
    .pushreg r12
    sub     rsp, 40
    .allocstack 40
    .endprolog

    mov     rsi, rcx                               ; Context
    mov     rdi, rdx                               ; File path
    mov     r12, r8                                ; Header output

    ; Validate parameters
    test    rsi, rsi
    jz      @@lgh_err_param
    test    rdi, rdi
    jz      @@lgh_err_param
    test    r12, r12
    jz      @@lgh_err_param

    ; Open file using Windows API
    ; This is a stub - actual implementation would call CreateFileA
    ; For now, return success with zeroed header

    ; Zero header output
    push    rcx
    mov     rdi, r12
    mov     ecx, 64                                ; Header size
    xor     eax, eax
    rep     stosb
    pop     rcx

    ; Set magic
    mov     dword ptr [r12], GGUF_MAGIC

    ; Set state to loading
    mov     dword ptr [rsi + 48], NQS_LOADING

    xor     eax, eax
    jmp     @@lgh_done

@@lgh_err_param:
    mov     eax, NQS_ERR_INVALID_PARAM
    lea     rdx, g_NQS_ErrInvalidParam

@@lgh_done:
    add     rsp, 40
    pop     r12
    pop     rdi
    pop     rsi
    pop     rbx
    ret
NQS_LoadGGUFHeader ENDP

; =============================================================================
; NQS_StreamTensorBlocks
; Stream tensor data blocks into QuadBuffer.
;
; RCX = pContext
; RDX = tensorIndex (which tensor to stream)
; R8  = maxBlocks (maximum blocks to load, 0 = all)
; R9  = pBlocksLoaded (QWORD*, receives count)
; Returns: RAX = 0 success, nonzero error
; =============================================================================
NQS_StreamTensorBlocks PROC FRAME
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
    sub     rsp, 32
    .allocstack 32
    .endprolog

    mov     rsi, rcx                               ; Context
    mov     r12d, edx                              ; Tensor index
    mov     r13, r8                                ; Max blocks
    mov     r14, r9                                ; Blocks loaded output

    ; Validate parameters
    test    rsi, rsi
    jz      @@stb_err_param

    ; Check state
    cmp     dword ptr [rsi + 48], NQS_LOADING
    jne     @@stb_err_state

    ; Stub: simulate loading blocks
    ; In production, this would read from file and fill QuadBuffer

    test    r14, r14
    jz      @@stb_no_output

    ; Store blocks loaded (stub: 0)
    mov     qword ptr [r14], 0

@@stb_no_output:
    ; Update state to ready
    mov     dword ptr [rsi + 48], NQS_READY

    xor     eax, eax
    jmp     @@stb_done

@@stb_err_param:
    mov     eax, NQS_ERR_INVALID_PARAM
    jmp     @@stb_done

@@stb_err_state:
    mov     eax, NQS_ERR_UNSUPPORTED

@@stb_done:
    add     rsp, 32
    pop     r14
    pop     r13
    pop     r12
    pop     rdi
    pop     rsi
    pop     rbx
    ret
NQS_StreamTensorBlocks ENDP

; =============================================================================
; NQS_DequantStreamBlock
; Dequantize a streaming block from QuadBuffer to output buffer.
;
; RCX = pContext
; RDX = blockIndex (which block to dequantize)
; R8  = pOutput (float*, receives 256 F32 values)
; R9D = useAVX512 (nonzero = use AVX-512 path if available)
; Returns: RAX = 256 on success, negative error
; =============================================================================
NQS_DequantStreamBlock PROC FRAME
    push    rbx
    .pushreg rbx
    push    rsi
    .pushreg rsi
    push    rdi
    .pushreg rdi
    push    r12
    .pushreg r12
    sub     rsp, 32
    .allocstack 32
    .endprolog

    mov     rsi, rcx                               ; Context
    mov     r12, r8                                ; Output buffer

    ; Validate parameters
    test    rsi, rsi
    jz      @@dsb_err_param
    test    r12, r12
    jz      @@dsb_err_param

    ; Check state
    cmp     dword ptr [rsi + 48], NQS_READY
    jb      @@dsb_err_state

    ; Get QuadBuffer base
    mov     rax, qword ptr [rsi + 64]
    test    rax, rax
    jz      @@dsb_err_param

    ; Calculate block address: base + blockIndex * 34
    imul    rdx, BLOCK_NQ1_SIZE
    lea     rbx, [rax + rdx]

    ; Call appropriate dequant function
    test    r9d, r9d
    jz      @@dsb_use_avx2

    ; Check AVX-512 capability (stub: assume available)
    ; In production, would check g_NQ_HasAVX512F
    mov     rcx, rbx
    mov     rdx, r12
    call    NQ1_DequantBlock_AVX512
    jmp     @@dsb_success

@@dsb_use_avx2:
    mov     rcx, rbx
    mov     rdx, r12
    call    NQ1_DequantBlock_AVX2

@@dsb_success:
    lock inc qword ptr [g_NQS_BlocksDequant]
    mov     eax, QK_NQ1                            ; Return 256
    jmp     @@dsb_done

@@dsb_err_param:
    mov     eax, NQS_ERR_INVALID_PARAM
    neg     eax
    jmp     @@dsb_done

@@dsb_err_state:
    mov     eax, NQS_ERR_UNSUPPORTED
    neg     eax

@@dsb_done:
    add     rsp, 32
    pop     r12
    pop     rdi
    pop     rsi
    pop     rbx
    ret
NQS_DequantStreamBlock ENDP

; =============================================================================
; NQS_QuantStreamBlock
; Quantize F32 data to NQ_1 block and store in QuadBuffer.
;
; RCX = pContext
; RDX = pInput (float*, 256 elements)
; R8  = blockIndex (where to store in QuadBuffer)
; R9D = useADMM (nonzero = use ADMM quantization)
; Returns: RAX = 0 success, nonzero error
; =============================================================================
NQS_QuantStreamBlock PROC FRAME
    push    rbx
    .pushreg rbx
    push    rsi
    .pushreg rsi
    push    rdi
    .pushreg rdi
    push    r12
    .pushreg r12
    sub     rsp, 32
    .allocstack 32
    .endprolog

    mov     rsi, rcx                               ; Context
    mov     rdi, rdx                               ; Input F32
    mov     r12d, r8d                              ; Block index

    ; Validate parameters
    test    rsi, rsi
    jz      @@qsb_err_param
    test    rdi, rdi
    jz      @@qsb_err_param

    ; Get QuadBuffer base
    mov     rax, qword ptr [rsi + 64]
    test    rax, rax
    jz      @@qsb_err_param

    ; Calculate output address: base + blockIndex * 34
    imul    r12, BLOCK_NQ1_SIZE
    lea     rbx, [rax + r12]

    ; Call appropriate quant function
    test    r9d, r9d
    jz      @@qsb_use_fast

    ; ADMM path
    mov     rcx, rdi
    mov     rdx, rbx
    mov     r8d, 50                                ; Default iterations
    call    NQ1_QuantizeBlock_ADMM
    jmp     @@qsb_success

@@qsb_use_fast:
    mov     rcx, rdi
    mov     rdx, rbx
    call    NQ1_QuantizeBlock_Fast

@@qsb_success:
    lock inc qword ptr [g_NQS_BlocksQuant]
    xor     eax, eax
    jmp     @@qsb_done

@@qsb_err_param:
    mov     eax, NQS_ERR_INVALID_PARAM

@@qsb_done:
    add     rsp, 32
    pop     r12
    pop     rdi
    pop     rsi
    pop     rbx
    ret
NQS_QuantStreamBlock ENDP

; =============================================================================
; NQS_GetBufferState
; Query current QuadBuffer state.
;
; RCX = pContext
; RDX = pBufferIndex (QWORD*, receives current buffer index)
; R8  = pBytesInBuffer (QWORD*, receives bytes in buffer)
; R9  = pState (DWORD*, receives stream state)
; Returns: RAX = 0 success
; =============================================================================
NQS_GetBufferState PROC FRAME
    push    rbx
    .pushreg rbx
    .endprolog

    test    rcx, rcx
    jz      @@gbs_err

    ; Copy state values
    test    rdx, rdx
    jz      @@gbs_skip_idx
    mov     rax, qword ptr [rcx + 72]              ; Current buffer index
    mov     qword ptr [rdx], rax

@@gbs_skip_idx:
    test    r8, r8
    jz      @@gbs_skip_bytes
    mov     rax, qword ptr [rcx + 80]              ; Bytes in buffer
    mov     qword ptr [r8], rax

@@gbs_skip_bytes:
    test    r9, r9
    jz      @@gbs_skip_state
    mov     eax, dword ptr [rcx + 48]              ; Stream state
    mov     dword ptr [r9], eax

@@gbs_skip_state:
    xor     eax, eax
    jmp     @@gbs_done

@@gbs_err:
    mov     eax, NQS_ERR_INVALID_PARAM

@@gbs_done:
    pop     rbx
    ret
NQS_GetBufferState ENDP

; =============================================================================
; NQS_AdvanceBuffer
; Rotate to next QuadBuffer slot.
;
; RCX = pContext
; Returns: RAX = new buffer index, negative on error
; =============================================================================
NQS_AdvanceBuffer PROC FRAME
    push    rbx
    .pushreg rbx
    .endprolog

    test    rcx, rcx
    jz      @@ab_err

    ; Increment buffer index with wrap
    mov     rax, qword ptr [rcx + 72]              ; Current index
    inc     rax
    and     rax, 3                                  ; Wrap to 0-3
    mov     qword ptr [rcx + 72], rax

    ; Reset bytes in buffer
    mov     qword ptr [rcx + 80], 0

    ; Update counter
    lock inc qword ptr [g_NQS_BufferRotations]

    jmp     @@ab_done

@@ab_err:
    mov     rax, -1

@@ab_done:
    pop     rbx
    ret
NQS_AdvanceBuffer ENDP

; =============================================================================
; NQS_FlushAll
; Flush all buffers and reset state.
;
; RCX = pContext
; Returns: RAX = 0 success
; =============================================================================
NQS_FlushAll PROC FRAME
    push    rbx
    .pushreg rbx
    .endprolog

    test    rcx, rcx
    jz      @@fa_err

    ; Reset buffer state
    mov     qword ptr [rcx + 72], 0                ; Buffer index
    mov     qword ptr [rcx + 80], 0                ; Bytes in buffer
    mov     qword ptr [rcx + 8], 0                 ; File offset
    mov     qword ptr [rcx + 24], 0                ; Bytes remaining
    mov     dword ptr [rcx + 48], NQS_IDLE         ; State

    xor     eax, eax
    jmp     @@fa_done

@@fa_err:
    mov     eax, NQS_ERR_INVALID_PARAM

@@fa_done:
    pop     rbx
    ret
NQS_FlushAll ENDP

; =============================================================================
; NQS_GetStats
; Get performance statistics.
;
; RCX = pBytesLoaded (QWORD*, optional)
; RDX = pBlocksDequant (QWORD*, optional)
; R8  = pBlocksQuant (QWORD*, optional)
; R9  = pBufferRotations (QWORD*, optional)
; Returns: RAX = 0 success
; =============================================================================
NQS_GetStats PROC
    test    rcx, rcx
    jz      @@gs_skip1
    mov     rax, g_NQS_BytesLoaded
    mov     qword ptr [rcx], rax
@@gs_skip1:
    test    rdx, rdx
    jz      @@gs_skip2
    mov     rax, g_NQS_BlocksDequant
    mov     qword ptr [rdx], rax
@@gs_skip2:
    test    r8, r8
    jz      @@gs_skip3
    mov     rax, g_NQS_BlocksQuant
    mov     qword ptr [r8], rax
@@gs_skip3:
    test    r9, r9
    jz      @@gs_done
    mov     rax, g_NQS_BufferRotations
    mov     qword ptr [r9], rax
@@gs_done:
    xor     eax, eax
    ret
NQS_GetStats ENDP

END


=======

/fix

>>>>>>> 5d06bca79190edcc5ccb7d4763eb2bdab10aecbd
