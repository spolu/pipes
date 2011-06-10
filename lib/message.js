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

var net = require('net');
var http = require('http');
var util = require('util');

var context = require("./context.js");

/**
 * A Message
 * 
 * @param spec {ctx}
 */
var message = function(spec, my) {
  my = my || {};
  var _super = {};
  
  var that = {};

  my.msg = {};
  my.msg.ver = message.version;
  my.msg.type = '';
  if(spec.ctx && spec.ctx.responds('tint'))
    my.msg.tint = spec.ctx.tint();    
  my.msg.headers = {};
  my.msg.targ = [];
  
  var serialize = function() {
    return JSON.stringify(my.msg);
  };    
  
  var deserialize = function(data) {
    var obj = JSON.parse(data);
    for(var i in obj) {
      if(obj.hasOwnProperty(i)) {
	switch(i) {
	case 'type':
	  my.msg.type = obj[i];
	  break;
	case 'tint':
	  my.msg.tint = obj[i];
	  break;
	case 'cookies':
	  my.msg.cookies = obj[i];
	  break;
	case 'headers':
	  my.msg.headers = obj[i];
	  break;
	case 'subj':
	  my.msg.subj = obj[i];
	  break;
	case 'targ':
	  my.msg.targ = obj[i];
	  break;
	case 'body':
	  my.msg.body = obj[i];
	  break;
	case 'meta':
	  my.msg.meta = obj[i];
	  break;
	default:
	  break;	  
	}
      }
    }
  };
  
  var setHeader = function(header, value) {
    my.msg.headers[header] = value;
    return that;
  };

  var setHeaders = function(headers) {
    if(headers && typeof(headers) !== 'undefined') {
      for(var h in headers) {
	if(headers.hasOwnProperty(h)) {
	  my.msg.headers[h] = headers[h];
	}
      }
    }
    return that;
  };
  
  var addTarget = function(target) {
    my.msg.targ.push(target);
    return that;
  };

  var toString = function() {
    var str = '';
    if(my.msg.subj)
      str += my.msg.subj;
    if(my.msg.targ) {
      for(var i = 0; i < my.msg.targ.length; i ++) {
	str += ((i == 0) ? ' {' : ', ') + my.msg.targ[i] + 
	  ((i == my.msg.targ.length - 1) ? '}' : '');
      }
    }
    return str;
  };
  
  that.setter('type', my.msg, 'type');  
  that.getter('type', my.msg, 'type');  
  that.setter('cookies', my.msg, 'cookies');  
  that.getter('cookies', my.msg, 'cookies');  
  that.setter('subject', my.msg, 'subj');
  that.getter('subject', my.msg, 'subj');
  that.getter('targets', my.msg, 'targ');
  that.setter('body', my.msg, 'body');
  that.getter('body', my.msg, 'body');
  that.getter('meta', my.msg, 'meta');
  that.getter('tint', my.msg, 'tint');
  that.setter('tint', my.msg, 'tint');
  that.getter('headers', my.msg, 'headers');  

  that.method('serialize', serialize);
  that.method('deserialize', deserialize);
  that.method('setHeader', setHeader);
  that.method('setHeaders', setHeaders);
  that.method('addTarget', addTarget);
  that.method('toString', toString);  

  return that;
};

/** Message system version */
message.version = 1;

exports.message = message;



message.deserialize = function(data) {
  var m = message({});
  m.deserialize(data);
  return m;
};


message.reply = function(msg) {
  var r = message({});
  r.setTint(msg.tint());
  r.setType('r');
  return r;
};

message.ack = function(msg) {
  var ack = message({});
  ack.setTint(msg.tint());
  ack.setType('ack');
  ack.setBody('ACK');
  return ack;
};

