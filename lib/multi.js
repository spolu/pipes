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
var events = require('events');

var base = require("./base.js");
var config = require("./config.js");

/**
 * A Multi object. The Multi object is in charge of transforming chunk into event
 * with type and body and conversely transforming call with type and body in event 
 * of chunk of data of maximum size specified by the config
 *
 * @param spec {config}
 */
var multi = function(spec, my) {
  my = my || {};
  var _super = {};
  
  my.cfg = spec.config || config.baseConfig();  
  my.buffer = '';
  my.received = false;

  my.protocol = {
    match: /^OK:([0-9A-Za-z]+):(\d+):/,
    check: /^OK:/,
    build: function(type, body) {
      if(body)
	return 'OK:' + type + ':' + body.length + ':' + body;
      return 'OK:' + type + ':0:';
    }
  };

  /**
   * Events emmited:
   * 'recv' : type body
   * 'chunk': chunk
   * 'error': error
   * 'end'  :  
   */
  var that = new events.EventEmitter();
  
  var send, recv, reset, end;
  
  send = function(type, body) {
    var data = my.protocol.build(type, body);
    while(data.length > my.cfg['MULTI_CHUNK_MAX_SIZE']) {
      var chunk = data.substring(0, my.cfg['MULTI_CHUNK_MAX_SIZE']);
      data = data.substring(my.cfg['MULTI_CHUNK_MAX_SIZE']);
      that.emit('chunk', chunk);
    }
    that.emit('chunk', data);    
  };
  
  recv = function(chunk) {
    /** util.debug('RECV:' + chunk); */
    my.buffer += chunk;
    var retry = true;
    while(retry) {
      retry = false;
      var result = my.protocol.match.exec(my.buffer);
      if(result) {
	var len = result[0].length + parseInt(result[2]);
	if(my.buffer.length >= len) {
	  that.emit('recv', result[1], my.buffer.substring(result[0].length, len));
	  my.buffer = my.buffer.substring(len);
	  my.received = true;
	  retry = true;
	}
      }
    }  
  };
  
  reset = function() {
      my.received = false;
      my.buffer = '';    
  };
  
  end = function() {
    /** util.debug('END'); */
    if(my.buffer.length > 0) {      
      var err = new Error('non recognized buffer: ' + my.buffer);
      reset();
      that.emit('error', err);      
    }
    else if(!my.received) {
      reset();
      that.emit('error', new Error("Nothing received"));          
    } 
    else {
      reset();
      that.emit('end');            
    }
  };
  
  base.method(that, 'send', send);
  base.method(that, 'recv', recv);
  base.method(that, 'end', end);

  return that;  
};

exports.multi = multi;