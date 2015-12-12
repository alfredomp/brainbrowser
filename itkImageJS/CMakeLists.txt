

cmake_minimum_required(VERSION 3.3)

SET(FLAGS "--bind -Wno-warn-absolute-paths --memory-init-file 0 -s DISABLE_EXCEPTION_CATCHING=0 -s ALLOW_MEMORY_GROWTH=1" )

SET (CMAKE_CXX_FLAGS ${FLAGS} CACHE STRING "compile flags" FORCE)
SET (CMAKE_C_FLAGS ${FLAGS} CACHE STRING "compile flags" FORCE)

set(ITK_IO_MODULES_USED 
		ITKIONIFTI
		ITKIONRRD
		MGHIO
	)
find_package(ITK COMPONENTS
  ITKCommon
  ITKIOImageBase
  ITKImageFunction
  ${ITK_IO_MODULES_USED}
)
IF(${ITK_FOUND})
	include(${ITK_USE_FILE})
ENDIF(${ITK_FOUND})


INCLUDE_DIRECTORIES(ENV{EMSCRIPTEN}/system/include/emscripten/)

SET(EXE_NAME itkImageJS)
SET(${EXE_NAME}_LIBRARIES  ${ITK_LIBRARIES})
SET(${EXE_NAME}_SOURCE ${EXE_NAME}.cxx)
add_executable(${EXE_NAME}   ${${EXE_NAME}_SOURCE})
target_link_libraries(${EXE_NAME} ${${EXE_NAME}_LIBRARIES})