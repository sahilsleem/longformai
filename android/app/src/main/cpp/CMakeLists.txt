cmake_minimum_required(VERSION 3.22.1)
project(whisper_native LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_C_STANDARD 11)

find_library(LOG_LIB log)

set(WHISPER_SOURCES
    ggml.c
    ggml-alloc.c
    ggml-backend.c
    ggml-quants.c
    whisper.cpp
    whisper_jni.cpp
)

add_library(whisper_native SHARED ${WHISPER_SOURCES})

target_include_directories(whisper_native PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

target_compile_options(whisper_native PRIVATE -O3 -fvisibility=hidden -fvisibility-inlines-hidden)

if(NOT CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_link_options(whisper_native PRIVATE -Wl,--gc-sections)
endif()

target_link_libraries(whisper_native ${LOG_LIB} android)
