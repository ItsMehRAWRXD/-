# Semantic Index Module - CMake Configuration
# Phase 17: Advanced Intelligence - Build Infrastructure

cmake_minimum_required(VERSION 3.20)

# Module name
set(SEMANTIC_INDEX_MODULE semantic_index)

# Source files
set(SEMANTIC_INDEX_SOURCES
    SemanticCodeIndex.cpp
)

# Header files
set(SEMANTIC_INDEX_HEADERS
    SemanticCodeIndex.h
)

# Try to find FAISS first (preferred backend)
find_package(faiss CONFIG QUIET)

if(faiss_FOUND)
    message(STATUS "FAISS found - using FAISS backend for semantic search")
    set(USE_FAISS_BACKEND TRUE)
    set(SEMANTIC_INDEX_BACKEND_LIBS faiss)
else()
    message(STATUS "FAISS not found - falling back to HNSW (header-only) backend")
    set(USE_FAISS_BACKEND FALSE)
    
    # HNSW is header-only, we'll include it as a submodule or fetch it
    include(FetchContent)
    FetchContent_Declare(
        hnsw
        GIT_REPOSITORY https://github.com/nmslib/hnswlib.git
        GIT_TAG v0.8.0
        GIT_SHALLOW TRUE
    )
    FetchContent_MakeAvailable(hnsw)
    
    # HNSW is header-only, no linking required
    set(SEMANTIC_INDEX_BACKEND_LIBS "")
endif()

# Create the library
add_library(${SEMANTIC_INDEX_MODULE} STATIC
    ${SEMANTIC_INDEX_SOURCES}
    ${SEMANTIC_INDEX_HEADERS}
)

# Define backend macro
if(USE_FAISS_BACKEND)
    target_compile_definitions(${SEMANTIC_INDEX_MODULE}
        PRIVATE USE_FAISS_BACKEND
    )
else()
    target_compile_definitions(${SEMANTIC_INDEX_MODULE}
        PRIVATE USE_HNSW_BACKEND
    )
endif()

# Include directories
target_include_directories(${SEMANTIC_INDEX_MODULE}
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}
    PRIVATE
        $<$<NOT:$<BOOL:${USE_FAISS_BACKEND}>>:${hnsw_SOURCE_DIR}>
)

# Link libraries
target_link_libraries(${SEMANTIC_INDEX_MODULE}
    PUBLIC
        ${SEMANTIC_INDEX_BACKEND_LIBS}
)

# Compiler options for performance
if(MSVC)
    target_compile_options(${SEMANTIC_INDEX_MODULE}
        PRIVATE
            /O2
            /arch:AVX2
            /fp:fast
    )
else()
    target_compile_options(${SEMANTIC_INDEX_MODULE}
        PRIVATE
            -O3
            -march=native
            -ffast-math
    )
endif()

# Smoke test executable
add_executable(semantic_index_smoke_test
    semantic_index_smoke_test.cpp
)

target_link_libraries(semantic_index_smoke_test
    PRIVATE
        ${SEMANTIC_INDEX_MODULE}
)

# Installation
install(TARGETS ${SEMANTIC_INDEX_MODULE}
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
)

install(FILES ${SEMANTIC_INDEX_HEADERS}
    DESTINATION include/semantic_index
)