; RawrXD_StubDetector.asm - Stub
OPTION CASEMAP:NONE
.code
PUBLIC RawrXD_StubDetector_Init
RawrXD_StubDetector_Init PROC
    xor eax, eax
    ret
RawrXD_StubDetector_Init ENDP
END
