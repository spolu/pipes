// Copyright Stanislas Polu
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util');
var fs = require('fs');

var base = require("./base.js");
var context = require("./context.js");

/**
 * logger.js
 * 
 * The logger object is a fairly simple wrapper that adds the current date
 * as well as context (context.js) related data such as the current stack
 * state.
 * 
 * silent is a silent logger.
 */

/**
 * A silent logger object
 * 
 * @param spec {}
 */
function silent(spec, my) {
  my = my || {};
  var _super = {};
  
  var that = {};

  base.method(that, 'error', function() {});
  base.method(that, 'out', function() {});
  base.method(that, 'err', function() {});
  base.method(that, 'debug', function() {});

  return that;    
}
exports.silent = silent;

/**
 * A logger simply writes to out/err stream structured log messages
 *
 * @param spec {}
 */
function logger(spec, my) {
  my = my || {};
  var _super = {};
  
  var that = {};
  
  var currentDate = function() {
    var d = new Date();
    return (d.getDate() + "/" +
	    d.getMonth() + "/" +
	    d.getYear() + " " +
	    d.getHours() + ":" +
	    d.getMinutes() + ":" +
	    d.getSeconds() + "." +
	    d.getMilliseconds());	      
  };
  
  var header = function(ctx) {
    var str = "[";
    if(ctx && base.responds(ctx, 'tint'))
      str += "{" + ctx.tint() + "} ";
    str += currentDate() + "] ";
    if(ctx && base.responds(ctx, 'stack')) {
      for(var i = 0; i < ctx.stack().length; i++)
	str += "/" + ctx.stack()[i];
      str += ": ";    
    }
    return str;    
  };
  
  /** Local stream out */
  var outfun = function(ctx, msg) {
    var str = header(ctx) + msg;   
    console.log(str);      
  };
  
  /** Local stream err */
  var errfun = function(ctx, msg) {
    var str = 'ERROR: ' + header(ctx) + msg;   
    process.stderr.write(str + '\n');
  };
  
  /** Local debug */
  var debugfun = function(ctx, msg) {
    var str = header(ctx) + msg;   
    util.debug(str);
  };

  /** error reporting */
  var error = function(ctx, err, stack) {
    if(stack)
      errfun(ctx, err.stack ? err.stack : err);
    else
      errfun(ctx, err.message ? err.message : err);    
  };
  
  
  base.method(that, 'error', error);
  base.method(that, 'out', outfun);
  base.method(that, 'err', errfun);
  base.method(that, 'debug', debugfun);

  return that;  
}
exports.logger = logger;


