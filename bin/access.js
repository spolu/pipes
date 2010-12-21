var fwk = require('fwk');
var util = require('util');

var config = require("./config.js");

/**
 * The access object calculate wether a message is granted given
 * the grant functions it has been given.
 * 
 * @extends {}
 * 
 * @param spec {}
 */
var access = function(spec, my) {
  my = my || {};
  var _super = {};
  
  my.cfg = spec.config || cfg.config; 

  var that = {};
  
  var isgranted;
  
  isgranted = function(ctx, msg) {
    return true;
  };
  
  that.method('isgranted', isgranted);
  
  return that;
};

exports.access = access;