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

var base = require("./base.js");
var context = require("./context.js");

/**
 * message.js
 * 
 * A message is the basic unit of data that is being transmitted by pipe.
 * 
 * There are 3 types of messages:
 * - '1w': one-way no answer
 * - '2w': two-way, an answer is expected
 * - 'c': special configuration message for bootsrap of pipes modules
 * 
 * A message is characterized by it's type, it's subject and its targets
 * and contains a body object (generally containing the core of the
 * data being transmitted and a meta object providing meta information
 * such as location, verison, etc...)
 * 
 * Additionnaly a message transmits cookies & headers and what we call a tint. 
 * A tint is a unique id given to a message when it enters the
 * cluster. it is propagated throughout through contexts and messages.
 * The goal is that contexts will insert the tint in any given log
 * giving context to any line of log, cluster-wise
 */

/**
 * A Message
 *
 * @extends {}
 * 
 * @param spec {ctx}
 */
var message = function(spec, my) {
  my = my || {};
  var _super = {};
  
  my.msg = {};
  // message version for backward/forward compat
  my.msg.ver = message.version;  
  // message type
  my.msg.type = '';
  // automatic tint propagation
  if(spec.ctx && base.responds(spec.ctx, 'tint'))
    my.msg.tint = spec.ctx.tint();    
  my.msg.headers = {};
  my.msg.targ = [];

  //public
  var serialize;    /* serialize() */
  var deserialize;  /* deserialize(data) */
  var setHeader;    /* setHeaders(header, value) */
  var setHeaders;   /* setHeaders(headers) */
  var addTarget;    /* addTarget(target) */  
  var toString;     /* toString() */
  
  var that = {};

  
  /* msg.serialize();
   * Serialize the current message using JSON.stringify
   */
  serialize = function() {
    return JSON.stringify(my.msg);
  };    
  
  /* msg.deserialize(data)
   * Extracts from data all message related values and
   * populates the current object
   */
  deserialize = function(data) {
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
	case 'auth':
	  my.msg.auth = obj[i];
	default:
	  break;	  
	}
      }
    }
  };
  
  /* msg.setHeader(header,value);
   * sets the message header (propagated as header when replying)
   */
  setHeader = function(header, value) {
    my.msg.headers[header] = value;
    return that;
  };

  /* msg.setHeaders();
   * sets a specific header
   */
  setHeaders = function(headers) {
    if(headers && typeof(headers) !== 'undefined') {
      for(var h in headers) {
	if(headers.hasOwnProperty(h)) {
	  my.msg.headers[h] = headers[h];
	}
      }
    }
    return that;
  };
  
  /* msg.setTarget(target)
   * sets a message target
   */
  addTarget = function(target) {
    my.msg.targ.push(target);
    return that;
  };

  /* msg.toString()
   * returns a compact string representation of the message
   */
  toString = function() {
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
  
  base.setter(that, 'type', my.msg, 'type');  
  base.getter(that, 'type', my.msg, 'type');  
  base.setter(that, 'cookies', my.msg, 'cookies');  
  base.getter(that, 'cookies', my.msg, 'cookies');  
  base.setter(that, 'subject', my.msg, 'subj');
  base.getter(that, 'subject', my.msg, 'subj');
  base.getter(that, 'targets', my.msg, 'targ');
  base.setter(that, 'body', my.msg, 'body');
  base.getter(that, 'body', my.msg, 'body');
  base.setter(that, 'meta', my.msg, 'meta');
  base.getter(that, 'meta', my.msg, 'meta');
  base.setter(that, 'auth', my.msg, 'auth');
  base.getter(that, 'auth', my.msg, 'auth');
  base.getter(that, 'tint', my.msg, 'tint');
  base.setter(that, 'tint', my.msg, 'tint');
  base.getter(that, 'headers', my.msg, 'headers');  

  base.method(that, 'serialize', serialize);
  base.method(that, 'deserialize', deserialize);
  base.method(that, 'setHeader', setHeader);
  base.method(that, 'setHeaders', setHeaders);
  base.method(that, 'addTarget', addTarget);
  base.method(that, 'toString', toString);  

  return that;
};

/** Message system version */
message.version = 1;

exports.message = message;


/* module function for serialization
 */
message.deserialize = function(data) {
  var m = message({});
  m.deserialize(data);
  return m;
};


/* module function to generate a reply message
 */
message.reply = function(msg) {
  var r = message({});
  r.setTint(msg.tint());
  r.setType('r');
  return r;
};

/* module function to generate an ack message (acknoledgement,
 * required in the case of a 1w message)
 */
message.ack = function(msg) {
  var ack = message({});
  ack.setTint(msg.tint());
  ack.setType('ack');
  ack.setBody('ACK');
  return ack;
};

