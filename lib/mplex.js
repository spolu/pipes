var util = require('util');
var base = require("./base.js");

/**
 * A MPlex is an object that allows to trigger n callback functions and
 * get one callback only when all these functions have returned
 * 
 * @extends {}
 * 
 * @param spec {}
 */
var mplex = function(spec, my) {
  
  my = my || {};
  var _super = {};

  var that = {};

  my.cb = function() {};

  my.done = 0;
  my.wait = 0;
  my.go = false;
  my.cbargs = [];
  
  var callback, go;

  callback = function() {
    my.wait ++;
    return function() {
      my.cbargs.push(arguments);
      my.wait --;
      my.done ++;
      if(my.wait === 0 && my.go)
	my.cb();
    };
  };

  go = function(cb) {
    if(cb === null || typeof cb === "undefined")
      throw new TypeError();
    my.cb = cb;
    my.go = true;
    if(my.wait === 0) {
      my.cb();
    }
  };

  that.method('callback', callback);
  that.method('go', go);
  that.getter('cbargs', my, 'cbargs');

  return that;
};

exports.mplex = mplex;