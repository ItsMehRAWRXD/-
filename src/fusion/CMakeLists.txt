# Phase 18B: Adaptive Fusion Engine
# Dynamic weight adjustment for Trie vs Semantic fusion

cmake_minimum_required(VERSION 3.16)

set(FUSION_SOURCES
    AdaptiveFusionEngine.cpp
)

set(FUSION_HEADERS
    AdaptiveFusionEngine.h
)

# Create fusion library
add_library(fusion STATIC ${FUSION_SOURCES} ${FUSION_HEADERS})

target_include_directories(fusion
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}
        ${CMAKE_CURRENT_SOURCE_DIR}/../telemetry
)

# C++17 required
target_compile_features(fusion PUBLIC cxx_std_17)

# Dependencies
target_link_libraries(fusion PRIVATE telemetry)

# Platform libraries
if(WIN32)
    target_link_libraries(fusion PRIVATE shlwapi)
endif()

# Threading
find_package(Threads REQUIRED)
target_link_libraries(fusion PRIVATE Threads::Threads)

# Install
install(TARGETS fusion
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
)

install(FILES ${FUSION_HEADERS}
    DESTINATION include/fusion
)
