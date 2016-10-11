/*
* BrainBrowser: Web-based Neurological Visualization Tools
* (https://brainbrowser.cbrain.mcgill.ca)
*
* Copyright (C) 2011-2015
* The Royal Institution for the Advancement of Learning
* McGill University
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/*
* Author: Juan Carlos Prieto
*/

(function() {
  "use strict";
     
  var VolumeViewer = BrainBrowser.VolumeViewer;
  var image_creation_context = document.createElement("canvas").getContext("2d");

  VolumeViewer.volume_loaders.itkReaderURLMap = {};

  VolumeViewer.volume_loaders.itkReader = function(description, callback) {
    var error_message;
    if (description.url) {

      // Emscripten namespace

      BrainBrowser.loader.loadFromURL(description.url, function(imagedata) {

        var memory_dir = '/raw';

        try{
          FS.stat(memory_dir);
        }catch(e){
          FS.mkdir(memory_dir);
        }

        if(VolumeViewer.volume_loaders.itkReaderURLMap[description.url] === undefined){
          var filename_url = description.url;
          filename_url = filename_url.substr(filename_url.lastIndexOf('/') + 1);
          if(filename_url.lastIndexOf('?') > 0){
            filename_url = filename_url.substr(0, filename_url.indexOf('?'));
          }
          VolumeViewer.volume_loaders.itkReaderURLMap[description.url] = memory_dir + '/' + Date.now() + '_' + filename_url;
        }

        var input_filepath = VolumeViewer.volume_loaders.itkReaderURLMap[description.url];
        FS.writeFile(input_filepath, new Uint8Array(imagedata), { encoding: 'binary' });
        
        var itkJS = new Module.itkImageJS();
        itkJS.SetFilename(input_filepath);
        itkJS.ReadImage();

        createHeader(itkJS, function(header){
          createVolume(itkJS, header, callback);
        });

      }, { result_type: "arraybuffer" });
                                        
    } else {
      error_message = "invalid volume description.\n" +
        "Description must contain the property 'url'";

      BrainBrowser.events.triggerEvent("error", { message: error_message });
      throw new Error(error_message);
    }
    
  };

  function createHeader(itkJS, callback){
    var header = {
      order: ["xspace", "yspace", "zspace"],
      xspace: {},
      yspace: {},
      zspace: {}
    };

    header.xspace.name = "xspace";
    header.yspace.name = "yspace";
    header.zspace.name = "zspace";

    var dim = Module.HEAP32.subarray(itkJS.GetDimensions(), itkJS.GetDimensions() + 3);

    header.xspace.space_length = dim[0];
    header.yspace.space_length = dim[1];
    header.zspace.space_length = dim[2];

    var spc = Module.HEAPF64.subarray(itkJS.GetSpacing(), itkJS.GetSpacing() + 3);
        
    header.xspace.step = spc[0];
    header.yspace.step = spc[1];
    header.zspace.step = spc[2];

    var ori = Module.HEAPF64.subarray(itkJS.GetOrigin(), itkJS.GetOrigin() + 3);
    
    header.xspace.start = ori[0];
    header.yspace.start = ori[1];
    header.zspace.start = ori[2];

    var dir = Module.HEAPF64.subarray(itkJS.GetDirection(), itkJS.GetDirection() + 9);

    header.xspace.direction_cosines = [dir[0], dir[1], dir[2]];
    header.yspace.direction_cosines = [dir[3], dir[4], dir[5]];
    header.zspace.direction_cosines = [dir[6], dir[7], dir[8]];

    if(header.order.length === 4) {
      header.order = header.order.slice(1);
    }

    header.voxel_origin = {
      x: header.xspace.start,
      y: header.yspace.start,
      z: header.zspace.start
    };

    header.xspace.width_space  = header.yspace;
    header.xspace.width        = header.yspace.space_length;
    header.xspace.height_space = header.zspace;
    header.xspace.height       = header.zspace.space_length;

    header.yspace.width_space  = header.xspace;
    header.yspace.width        = header.xspace.space_length;
    header.yspace.height_space = header.zspace;
    header.yspace.height       = header.zspace.space_length;

    header.zspace.width_space  = header.xspace;
    header.zspace.width        = header.xspace.space_length;
    header.zspace.height_space = header.yspace;
    header.zspace.height       = header.yspace.space_length;

    if (BrainBrowser.utils.isFunction(callback)) {
      callback(header);
    }
  }

  function createVolume(itkJS, header, callback) {
    var byte_data = createImageData(itkJS);

    var intensitymin = Number.MAX_VALUE;
    var intensitymax = -Number.MAX_VALUE;

    for(var i = 0; i < byte_data.length; i++){
      intensitymin = Math.min(byte_data[i], intensitymin);
      intensitymax = Math.max(byte_data[i], intensitymax);
    }

    var position = {};
    var position_continuous = {};
    header.order.forEach(function(axis) {
      var pos = header[axis].space_length/2;
      position[axis] = Math.floor(pos);
      position_continuous[axis] = pos;
    });

    var volume = {
      position: position,
      position_continuous: position_continuous,
      current_time: 0,
      data: byte_data,
      header: header,
      intensity_min: intensitymin,
      intensity_max: intensitymax,
      slice_image: {},
      slice_data: {},
      itk_image_j_s: itkJS,
      slice: function(axis, slice_num) {
        
        var axis_space = header[axis];
        var width_space = axis_space.width_space;
        var height_space = axis_space.height_space;

        if(slice_num === undefined){
          slice_num = volume.position[axis];
        }else if(slice_num < 0){
          slice_num = 0;
        }else if(slice_num >= axis_space.space_length){
          slice_num = axis_space.space_length - 1;
        }

        var width = axis_space.width;
        var height = axis_space.height;

        var slice = {
          axis: axis,
          width_space: width_space,
          height_space: height_space,
          width: width,
          height: height
        };

        var buff = volume.itk_image_j_s.GetSlice(axis, slice_num);
        slice.data = createDataView(volume.itk_image_j_s.GetDataType(), buff, width*height);

        if(volume.border){
          slice = volume.getSliceBorder(slice);
        }
        
        return slice;
      },

      getVoxelMin: function(){
        return intensitymin;
      },

      getVoxelMax: function(){
        return intensitymax;
      },

      getSliceBorder: function(slice){
        var sliceOut = new slice.data.constructor(slice.data);
        var extent = [-slice.width -1, -slice.width, -slice.width + 1, -1, 1, slice.width -1, slice.width, slice.width + 1];
        var isBorder = function(slice, n){
          var ret = false;
          var lab = slice.data[n];
          for(var i = 0; i < extent.length && !ret; i++){
            var next = n + extent[i];
            if(next >= 0 && next < slice.data.length && slice.data[next] !== lab){
              ret = true;
              break;
            }
          }
          return ret;
        };
        for(var i = 0; i < slice.data.length; i++){
          if(!isBorder(slice, i)){
            sliceOut[i] = 0;
          }
        }
        slice.data = sliceOut;
        return slice;
      },
      getSliceImage: function(slice, zoom, contrast, brightness) {

        if(slice){
          var color_map = volume.color_map;

          if(volume.slice_image[slice.axis] === undefined){
            volume.slice_image[slice.axis] = image_creation_context.createImageData(slice.width, slice.height);
          }
          var source_image = volume.slice_image[slice.axis];


          if (color_map) {
            color_map.mapColors(slice.data, {
              min: volume.intensity_min,
              max: volume.intensity_max,
              contrast: contrast,
              brightness: brightness,
              destination: source_image.data
            });
          }

          return source_image;
        }

        return null;
        
      },
      getIntensityValue: function(x, y, z) {
        var position = volume.position;

        if(x === undefined){
          x = position.xspace;
        }
        if(y === undefined){
          y = position.yspace;
        }
        if(z === undefined){
          z = position.zspace;
        }

        if(0 <= x && x <= header.xspace.space_length && 0 <= y && y <= header.yspace.space_length && 0 <= z && z <= header.zspace.space_length){
          return volume.itk_image_j_s.GetPixel(x, y, z);
        }
        return null;
        
      },
      setIntensityValue : function(x, y, z, value){
        volume.itk_image_j_s.SetPixel(x, y, z, value);
      },
      
      getVoxelCoords: function() {
        var position = volume.position;

        return {
          i: position.xspace,
          j: position.yspace,
          k: position.zspace,
        };
      },
      
      setVoxelCoords: function(i, j, k) {
        volume.position.xspace = i;
        volume.position.yspace = j;
        volume.position.zspace = k;
      },
      
      getWorldCoords: function() {

        var x = volume.position.xspace;
        var y = volume.position.yspace;
        var z = volume.position.zspace;

        var buff = volume.itk_image_j_s.TransformIndexToPhysicalPoint(x, y, z);
        var point = Module.HEAP32.subarray(buff, buff + 3);

        return {
          x: point[0],
          y: point[1],
          z: point[2]
        };
      },
      
      setWorldCoords: function(x, y, z) {
        var voxel = volume.worldToVoxel(x, y, z);
        volume.setVoxelCoords(voxel.i, voxel.j, voxel.k);
      },
      
      voxelToWorld: function(i, j, k) {
        
        var buff = volume.itk_image_j_s.TransformIndexToPhysicalPoint(i, j, k);
        var point = Module.HEAPF64.subarray(buff, buff + 3);

        return {
          i: point[0],
          j: point[1],
          k: point[2]
        };
      },
      
      worldToVoxel: function(x, y, z) {
        
        var buff = volume.itk_image_j_s.TransformPhysicalPointToIndex(x, y, z);
        var index = Module.HEAPF64.subarray(buff, buff + 3);

        return {
          i: index[0],
          j: index[1],
          k: index[2]
        };
      }
    };
    
    if (BrainBrowser.utils.isFunction(callback)) {
      callback(volume);
    }
  }

  function createDataView(type, buffer, size){
    var native_data = null;
    switch (type) {
    case 2:                     // DT_UNSIGNED_CHAR
      native_data = Module.HEAPU8.subarray(buffer, buffer + size);
      break;
    case 4:                     // DT_SIGNED_SHORT
      native_data = Module.HEAP16.subarray(buffer, buffer + size);
      break;
    case 8:                     // DT_SIGNED_INT
      native_data = Module.HEAP32.subarray(buffer, buffer + size);
      break;
    case 16:                    // DT_FLOAT
      native_data = Module.HEAPF32.subarray(buffer, buffer + size);
      break;
    case 32:                    // DT_DOUBLE
      native_data = Module.HEAPF64.subarray(buffer, buffer + size);
      break;
    // Values above 256 are NIfTI-specific, and rarely used.
    case 256:                   // DT_INT8
      native_data = Module.HEAP8.subarray(buffer, buffer + size);
      break;
    case 512:                   // DT_UINT16
      native_data = Module.HEAPU16.subarray(buffer, buffer + size);
      break;
    case 768:                   // DT_UINT32
      native_data = Module.HEAPU32.subarray(buffer, buffer + size);
      break;
    default:
      // We don't yet support 64-bit, complex, RGB, and float 128 types.
      var error_message = "Unsupported data type: " + type;
      BrainBrowser.events.triggerEvent("error", { message: error_message });
      throw new Error(error_message);
    }
    return native_data;
  }

  function createImageData(itkJS) {

    var buff = itkJS.GetBufferPointer();
    var buffsize = itkJS.GetBufferSize();
    var native_data = createDataView(itkJS.GetDataType(), buff, buffsize);

    return native_data;
  }
   
}());
