/*
* BrainBrowser: Web-based Neurological Visualization Tools
* (https://brainbrowser.cbrain.mcgill.ca)
*
* Copyright (C) 2011
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
* Author: Nicolas Kassis
* Author: Tarek Sherif <tsherif@gmail.com> (http://tareksherif.ca/)
*/

/**
 * Represents a blended volume
 */

(function() {
  "use strict";
  
  var VolumeViewer = BrainBrowser.VolumeViewer;

  VolumeViewer.volume_loaders.overlayVolumes = function(options, callback) {
    options = options || {};
    var volumes = options.volumes || [];

    var overlay_volume = {
      type: "overlay",
      position: {},
      position_continuous: {},
      header: {},
      intensity_min: 0,
      intensity_max: 255,
      volumes: [],
      blend_ratios: [],
      mask_overlay : false,

      slice: function(axis, slice_num, time) {
        slice_num = slice_num === undefined ? this.position[axis] : slice_num;
        time = time === undefined ? this.current_time : time;

        var overlay_volume = this;

        var slice = function(volume_id, axis){
          var slice_num = this.slice_num;
          return overlay_volume.volumes[volume_id].slice(axis, slice_num, time);
        }.bind({
          slice_num: slice_num
        });
        
        return {
          height_space: this.header[axis].height_space,
          width_space: this.header[axis].width_space,
          slice: slice
        };
      },

      getSliceImage: function(volume_id, slice, contrast, brightness) {
        return this.volumes[volume_id].getSliceImage(slice, 1, contrast, brightness);
      },

      getIntensityValue: function(x, y, z) {
        x = x === undefined ? this.position.xspace : x;
        y = y === undefined ? this.position.yspace : y;
        z = z === undefined ? this.position.zspace : z;

        var overlay_volume = this;
        var values = [];

        overlay_volume.volumes.forEach(function(volume) {
          values.push(volume.getIntensityValue(x, y, z));
        });

        return values.reduce(function(intensity, current_value, i) {
          return intensity + current_value * overlay_volume.blend_ratios[i];
        }, 0);
      },

      setMaskOverlay : function(mask){
        overlay_volume.mask_overlay = mask;
      },
    };

    volumes.forEach(function(volume) {
      overlay_volume.volumes.push(volume);
      overlay_volume.blend_ratios.push(1 / volumes.length);
    });


    var header = {
      position: {},
      position_continuous: {},
      xspace: {
        name: "xspace",
        space_length: Number.MIN_VALUE,
        step: Number.MAX_VALUE,
        start: Number.MAX_VALUE
      },
      yspace: {
        name: "yspace",
        space_length: Number.MIN_VALUE,
        step: Number.MAX_VALUE,
        start: Number.MAX_VALUE
      },
      zspace:{
        name: "zspace",
        space_length: Number.MIN_VALUE,
        step: Number.MAX_VALUE,
        start: Number.MAX_VALUE
      },
      order: ["xspace", "yspace", "zspace"]
    };
    volumes.forEach(function(volume) {
      header.order.forEach(function(order){
        header[order].space_length = Math.max(header[order].space_length, volume.header[order].space_length);
        header[order].step = Math.min(header[order].step, volume.header[order].step);
        header[order].start = Math.min(header[order].start, volume.header[order].start);
      });
    });

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

    
    header.order.forEach(function(axis) {
      var pos = header[axis].space_length/2;
      overlay_volume.position[axis] = Math.floor(pos);
      overlay_volume.position_continuous[axis] = pos;
    });

    overlay_volume.header = header;
    
    if (BrainBrowser.utils.isFunction(callback)) {
      callback(overlay_volume);
    }
  };

}());

