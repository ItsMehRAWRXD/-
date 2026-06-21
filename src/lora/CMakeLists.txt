# LoRA (Low-Rank Adaptation) Module
# Phase 18C: Personalized Embedding Fine-tuning

set(LORA_SOURCES
    AdapterRegistry.cpp
    AdapterTrainer.cpp
    LoRAAdapterManager.cpp
)

set(LORA_HEADERS
    AdapterRegistry.h
    AdapterTrainer.h
    LoRAAdapterManager.h
)

add_library(rawrxd_lora STATIC ${LORA_SOURCES} ${LORA_HEADERS})

target_include_directories(rawrxd_lora PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/src
)

target_link_libraries(rawrxd_lora PUBLIC
    jsoncpp_lib
    ${CMAKE_THREAD_LIBS_INIT}
)

# Enable optimizations for the matrix math hot path
target_compile_options(rawrxd_lora PRIVATE
    $<$<CONFIG:Release>:-O3 -ffast-math>
    $<$<CONFIG:RelWithDebInfo>:-O2>
)

# Group sources for IDE
target_sources(rawrxd_lora PRIVATE ${LORA_HEADERS})
set_target_properties(rawrxd_lora PROPERTIES 
    FOLDER "Modules/LoRA"
)
