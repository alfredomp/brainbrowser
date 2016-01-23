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
* Author: Juan Carlos Prieto
*/

/**
 * Represents a list of volumes
 */

(function() {
  "use strict";
  
  var VolumeViewer = BrainBrowser.VolumeViewer;

  VolumeViewer.volume_loaders.overlayVolumes = function(options, callback) {
    options = options || {};
    var volumes = options.volumes || [];

    var overlay_volume = {
      type: "overlayVolumes",
      position: {},
      position_continuous: {},
      header: {},
      intensity_min: 0,
      intensity_max: 255,
      volumes: [],
      blend_ratios: [],
      mask_overlay : false,

      slice: function(axis) {

        var slice = {
          axis: axis,
          width_space: header[axis].width_space,
          height_space: header[axis].height_space,
          width: header[axis].width_space.width,
          height: header[axis].width_space.height,
          slice: function(volume_id, axis, slice_num){
            slice_num = slice_num === undefined ? overlay_volume.position[axis] : slice_num;
            volume_id = volume_id === undefined? 0 : volume_id;

            var volume = overlay_volume.volumes[volume_id];
            var slice_num_current = overlay_volume.header[axis].start + slice_num*overlay_volume.header[axis].step;
            slice_num_current = Math.round(slice_num_current/volume.header[axis].step - volume.header[axis].start);
            return volume.slice(axis, slice_num_current);
          },
          getSliceImage: function(volume_id, slice, zoom, contrast, brightness) {
            var volume = overlay_volume.volumes[volume_id];
            return volume.getSliceImage(slice, zoom, contrast, brightness);
          }
        };

        return slice;
        
      },
      getIntensityValue: function() {
        return 0;
      }
    };


    //Generate a common header among all the volumes
    var header = {
      xspace: {
        space_length: Number.MIN_VALUE,
        step: Number.MAX_VALUE,
        start: Number.MAX_VALUE,
        name: "xspace"
      },
      yspace: {
        space_length: Number.MIN_VALUE,
        step: Number.MAX_VALUE,
        start: Number.MAX_VALUE,
        name: "yspace"
      },
      zspace: {
        space_length: Number.MIN_VALUE,
        step: Number.MAX_VALUE,
        start: Number.MAX_VALUE,
        name: "zspace"
      },
      order: ["xspace", "yspace", "zspace"]
    };

    volumes.forEach(function(volume) {
      header.order.forEach(function(space){
        header[space].space_length = Math.max(header[space].space_length, volume.header[space].space_length*volume.header[space].step + volume.header[space].start);
        header[space].step = Math.min(header[space].step, volume.header[space].step);
        header[space].start = Math.min(header[space].start, volume.header[space].start);
      });
    });

    header.order.forEach(function(space){
      header[space].space_length = header[space].space_length/header[space].step - header[space].start;
    });

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

    overlay_volume.header = header;
    header.order.forEach(function(axis) {
      overlay_volume.position[axis] = header[axis].start + header[axis].space_length*header[axis].step/2;
    });

    volumes.forEach(function(volume) {
      overlay_volume.volumes.push(volume);
      overlay_volume.blend_ratios.push(1 / volumes.length);
    });
    
    
    if (BrainBrowser.utils.isFunction(callback)) {
      callback(overlay_volume);
    }
  };

}());

