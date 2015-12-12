To compile this library please follow the instructions to set up ITK compiled with emscripten [here](http://www.kitware.com/blog/home/post/912).

After you have compiled ITK you can compile the library for brainbrowser. 

```Shell
  $ cd itkImageJS
  $ cmake -DCMAKE_TOOLCHAIN_FILE=$EMSCRIPTEN/cmake/Modules/Platform/Emscripten.cmake -DITK_DIR=<path to compiled ITK> -DCMAKE_BUILD_TYPE=Release ../
  $ make
```