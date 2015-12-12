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
      order: ["zspace", "yspace", "xspace"],
      xspace: {},
      yspace: {},
      zspace: {}
    };

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

    if (BrainBrowser.utils.isFunction(callback)) {
      callback(header);
    }
  }

  function createVolume(itkJS, header, callback) {
    var byte_data = createImageData(itkJS, header);

    var intensitymin = Number.MAX_VALUE;
    var intensitymax = -Number.MAX_VALUE;

    for(var i = 0; i < byte_data.length; i++){
      intensitymin = Math.min(byte_data[i], intensitymin);
      intensitymax = Math.max(byte_data[i], intensitymax);
    }

    var volume = {
      position: {},
      position_continuous: {},
      current_time: 0,
      data: byte_data,
      header: header,
      intensity_min: intensitymin,
      intensity_max: intensitymax,
      slice_image: {},
      slice_data: {},
      itk_image_j_s: itkJS,
      slice: function(axis, slice_num, time) {
        slice_num = slice_num === undefined ? volume.position[axis] : slice_num;
        time = time === undefined ? volume.current_time : time;

        var header = volume.header;

        if(header.order === undefined ) {
          return null;
        }

        time = time || 0;

        var time_offset = header.time ? time * header.time.offset : 0;

        var axis_space = header[axis];
        var width_space = axis_space.width_space;
        var height_space = axis_space.height_space;

        var width = axis_space.width;
        var height = axis_space.height;

        var axis_space_offset = axis_space.offset;
        var width_space_offset = width_space.offset;
        var height_space_offset = height_space.offset;

        if(volume.slice_data[axis] === undefined){
          volume.slice_data[axis] = new volume.data.constructor(width * height);
        }
        var slice_data = volume.slice_data[axis];

        var slice;

        // Rows and colums of the result slice.
        var row, col;

        // Indexes into the volume, relative to the slice.
        // NOT xspace, yspace, zspace coordinates!!!
        var x, y, z;

        // Linear offsets into volume considering an
        // increasing number of axes: (t) time, 
        // (z) z-axis, (y) y-axis, (x) x-axis.
        var tz_offset, tzy_offset, tzyx_offset;

        // Whether the dimension steps positively or negatively.
        var x_positive = width_space.step  > 0;
        var y_positive = height_space.step > 0;
        var z_positive = axis_space.step   > 0;

        // iterator for the result slice.
        var i = 0;

        z = z_positive ? slice_num : axis_space.space_length - slice_num - 1;
        tz_offset = time_offset + z * axis_space_offset;

        for (row = height - 1; row >= 0; row--) {
          y = y_positive ? row : height - row - 1;
          tzy_offset = tz_offset + y * height_space_offset;

          for (col = 0; col < width; col++) {
            x = x_positive ? col : width - col - 1;
            tzyx_offset = tzy_offset + x * width_space_offset;

            slice_data[i++] = volume.data[tzyx_offset];
          }
        }

        slice = {
          axis: axis,
          data: slice_data,
          width_space: width_space,
          height_space: height_space,
          width: width,
          height: height
        };

        if(volume.border){
          slice = volume.getSliceBorder(slice);
        }
        
        return slice;
      },

      getVoxelMin: function(){
        return intensitymin;
      },

      getVoxelMax: function(){
        intensity_max: intensitymax;
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
      },

      getIntensityValue: function(x, y, z, time) {
        x = x === undefined ? volume.position.xspace : x;
        y = y === undefined ? volume.position.yspace : y;
        z = z === undefined ? volume.position.zspace : z;
        time = time === undefined ? volume.current_time : time;

        if (x < 0 || x > volume.header.xspace.space_length ||
            y < 0 || y > volume.header.yspace.space_length ||
            z < 0 || z > volume.header.zspace.space_length) {
          return 0;
        }

        var slice = volume.slice("zspace", z, time);

        return slice.data[(slice.height_space.space_length - y - 1) * slice.width + x];
      },

      getVolumeDataIntensityValue: function(x, y, z){

        if (x < 0 || x > header[header.order[0]].space_length ||
            y < 0 || y > header[header.order[1]].space_length ||
            z < 0 || z > header[header.order[2]].space_length) {
          return null;
        }

        var movsize = [ header[header.order[2]].space_length, header[header.order[1]].space_length ];
        var index =  z + (y)*movsize[0] + (x)*movsize[0]*movsize[1];

        return volume.data[index];
        
      },

      setIntensityValue : function(x, y, z, value){

        var movsize = [ header[header.order[2]].space_length, header[header.order[1]].space_length ];
        var index =  z + (y)*movsize[0] + (x)*movsize[0]*movsize[1];
        
        volume.data[index] = value;

      },
      
      getVoxelCoords: function() {
        var header = volume.header;
        var position = {
          xspace: header.xspace.step > 0 ? volume.position.xspace : header.xspace.space_length - volume.position.xspace,
          yspace: header.yspace.step > 0 ? volume.position.yspace : header.yspace.space_length - volume.position.yspace,
          zspace: header.zspace.step > 0 ? volume.position.zspace : header.zspace.space_length - volume.position.zspace
        };

        return {
          i: position[header.order[0]],
          j: position[header.order[1]],
          k: position[header.order[2]],
        };
      },
      
      setVoxelCoords: function(i, j, k) {
        var header = volume.header;
        var ispace = header.order[0];
        var jspace = header.order[1];
        var kspace = header.order[2];
        
        volume.position[ispace] = header[ispace].step > 0 ? i : header[ispace].space_length - i;
        volume.position[jspace] = header[jspace].step > 0 ? j : header[jspace].space_length - j;
        volume.position[kspace] = header[kspace].step > 0 ? k : header[kspace].space_length - k;
      },
      
      getWorldCoords: function() {
        var voxel = volume.getVoxelCoords();

        return volume.voxelToWorld(voxel.i, voxel.j, voxel.k);
      },
      
      setWorldCoords: function(x, y, z) {
        var voxel = volume.worldToVoxel(x, y, z);

        volume.setVoxelCoords(voxel.i, voxel.j, voxel.k);
      },

      // Voxel to world matrix applied here is:
      // cxx * stepx | cyx * stepy | czx * stepz | ox
      // cxy * stepx | cyy * stepy | czy * stepz | oy
      // cxz * stepx | cyz * stepy | czz * stepz | oz
      // 0           | 0           | 0           | 1
      //
      // Taken from (http://www.bic.mni.mcgill.ca/software/minc/minc2_format/node4.html)
      voxelToWorld: function(i, j, k) {
        var ordered = {};
        var x, y, z;
        var header = volume.header;

        ordered[header.order[0]] = i;
        ordered[header.order[1]] = j;
        ordered[header.order[2]] = k;

        x = ordered.xspace;
        y = ordered.yspace;
        z = ordered.zspace;

        var cx = header.xspace.direction_cosines;
        var cy = header.yspace.direction_cosines;
        var cz = header.zspace.direction_cosines;
        var stepx = header.xspace.step;
        var stepy = header.yspace.step;
        var stepz = header.zspace.step;
        var o = header.voxel_origin;

        return {
          x: x * cx[0] * stepx + y * cy[0] * stepy + z * cz[0] * stepz + o.x,
          y: x * cx[1] * stepx + y * cy[1] * stepy + z * cz[1] * stepz + o.y,
          z: x * cx[2] * stepx + y * cy[2] * stepy + z * cz[2] * stepz + o.z
        };
      },

      // World to voxel matrix applied here is:
      // cxx / stepx | cxy / stepx | cxz / stepx | (-o.x * cxx - o.y * cxy - o.z * cxz) / stepx
      // cyx / stepy | cyy / stepy | cyz / stepy | (-o.x * cyx - o.y * cyy - o.z * cyz) / stepy
      // czx / stepz | czy / stepz | czz / stepz | (-o.x * czx - o.y * czy - o.z * czz) / stepz
      // 0           | 0           | 0           | 1
      //
      // Inverse of the voxel to world matrix.
      worldToVoxel: function(x, y, z) {
        var header = volume.header;
        var cx = header.xspace.direction_cosines;
        var cy = header.yspace.direction_cosines;
        var cz = header.zspace.direction_cosines;
        var stepx = header.xspace.step;
        var stepy = header.yspace.step;
        var stepz = header.zspace.step;
        var o = header.voxel_origin;
        var tx = (-o.x * cx[0] - o.y * cx[1] - o.z * cx[2]) / stepx;
        var ty = (-o.x * cy[0] - o.y * cy[1] - o.z * cy[2]) / stepy;
        var tz = (-o.x * cz[0] - o.y * cz[1] - o.z * cz[2]) / stepz;

        var result = {
          x: Math.round(x * cx[0] / stepx + y * cx[1] / stepx + z * cx[2] / stepx + tx),
          y: Math.round(x * cy[0] / stepy + y * cy[1] / stepy + z * cy[2] / stepy + ty),
          z: Math.round(x * cz[0] / stepz + y * cz[1] / stepz + z * cz[2] / stepz + tz)
        };

        var ordered = {};
        ordered[header.order[0]] = result.x;
        ordered[header.order[1]] = result.y;
        ordered[header.order[2]] = result.z;

        return {
          i: ordered.xspace,
          j: ordered.yspace,
          k: ordered.zspace
        };
      }
    };
    
    if (BrainBrowser.utils.isFunction(callback)) {
      callback(volume);
    }
  }

  function createImageData(itkJS, header) {
    
    var native_data = null;

    var buff = itkJS.GetBufferPointer();
    var buffsize = itkJS.GetBufferSize();

    switch (itkJS.GetDataType()) {
    case 2:                     // DT_UNSIGNED_CHAR
      // no translation necessary; could optimize this out.
      native_data = Module.HEAPU8.subarray(buff, buff + buffsize);
      break;
    case 4:                     // DT_SIGNED_SHORT
      native_data = Module.HEAP16.subarray(buff, buff + buffsize);
      break;
    case 8:                     // DT_SIGNED_INT
      native_data = Module.HEAP32.subarray(buff, buff + buffsize);
      break;
    case 16:                    // DT_FLOAT
      native_data = Module.HEAPF32.subarray(buff, buff + buffsize);
      break;
    case 32:                    // DT_DOUBLE
      native_data = Module.HEAPF64.subarray(buff, buff + buffsize);
      break;
    // Values above 256 are NIfTI-specific, and rarely used.
    case 256:                   // DT_INT8
      native_data = Module.HEAP8.subarray(buff, buff + buffsize);
      break;
    case 512:                   // DT_UINT16
      native_data = Module.HEAPU16.subarray(buff, buff + buffsize);
      break;
    case 768:                   // DT_UINT32
      native_data = Module.HEAPU32.subarray(buff, buff + buffsize);
      break;
    default:
      // We don't yet support 64-bit, complex, RGB, and float 128 types.
      var error_message = "Unsupported data type: " + itkJS.GetDataType();
      BrainBrowser.events.triggerEvent("error", { message: error_message });
      throw new Error(error_message);
    }

    if(header.order.length === 4) {
      header.order = header.order.slice(1);
    }

    header.xspace.name = "xspace";
    header.yspace.name = "yspace";
    header.zspace.name = "zspace";

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

    // Incrementation offsets for each dimension of the volume.
    header[header.order[0]].offset = header[header.order[1]].space_length * header[header.order[2]].space_length;
    header[header.order[1]].offset = header[header.order[2]].space_length;
    header[header.order[2]].offset = 1;

    return native_data;
  }
   
}());
