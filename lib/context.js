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
var http = require('http');

var base = require("./base.js");
var logger = require("./logger.js");
var config = require("./config.js");
var multi = require("./multi.js");
var cookie = require("./cookie.js");

/**
 * context.js
 * 
 * A context is an helper object with 4 main roles:
 * - reference and keep track of a client connection
 * - emit a 'finalize' event whenever the connection is closed by either end
 * - assign a tint to that connection that will be propagated
 *   cluster-wise 
 * - offer log methods integrated automatically adding the current tint
 *   (useful for cluster-wise debugging)
 * 
 * It is passed a logger, the config and the nodeJS request & response
 * objects:
 * ==============================================
 *     var ctx = fwk.context({ request: req,
 *                             response: res,
 *                             logger: my.logger,
 *                             config: my.cfg });
 * ==============================================
 * 
 * It can be kept around for later use if the connection need to wait
 * for something, and the finalize event is especially useful to
 * reclaim it when the connection closed.
 * 
 * The context also maintains a stack on which string can be pushed or
 * popped. These stack is printed each time something is log through that
 * context. This mechanism is very helpful for debugging.
 */


/**
 * A Context relative to an http request or client
 *
 * @extends events.EventEmitter
 * 
 * @param spec {logger, config, request, response}
 */
var context = function(spec, my) {
  my = my || {};
  var _super = {};
   
  my.logger = spec.logger || logger.logger();
  my.cfg = spec.config || config.baseConfig();
  
  my.finalized = false;  
  my.stack = [];    
  my.multi =  multi.multi(my.cfg);
  
  my.request = spec.request;
  my.response = spec.response;    
  
  if(!my.tint) {
    my.tint = my.cfg['TINT_NAME'] + '-' + process.pid + ":" + (++context.inc);     
  }

  my.cookies = {};
  my.auth = {'username': '',
	     'expiry': new Date(),
	     'expired': true,
	     'authenticated': false};

  if(my.request && 
     my.request.headers && 
     my.request.headers.cookie) {
    var cookies = my.request.headers.cookie.split(";");
    for(var i = 0; i < cookies.length; i++) {
      var name = cookies[i].split("=", 1)[0];
      if(name.trim().length > 0)
	my.cookies[name.trim()] = cookies[i].substring(name.length+1).trim();
    }    
  }

  // public
  var finalize;     /* ctx.finalize(): finalize the context and closes the connection */
  var error;        /* ctx.error(e): logs an error and emit an error event 
		       (causes the finalization of the context) */
  var push;         /* ctx.push(hr): add an element on the context stack */
  var pop;          /* ctx.pop():  removes the last in element from the contxt stack */
  var authenticate; /* ctx.authenticate(): attempts authentication based on the cookie
                       automatically extracted from the connection heafder */

  var that = new events.EventEmitter();
  
  /* object that encapsulates the diffrent log functions */
  var log = {
    error: function(err, stack) {
      my.logger.error(that, err, stack);
    },
    out: function(msg) {
      my.logger.out(that, msg);
    },
    err: function(msg) {
      my.logger.err(that, msg);
    },
    debug: function(msg) {
      if(my.cfg['DEBUG'])
	my.logger.debug(that, msg);
    }
  };
    
  /* on timeout, simply display something */
  var timeouthandler = function() { log.debug('TIMEOUT EVENT'); };

  /* ctx.finalize()
   * Finalize a context. This is done once it has been replied. A finalized context can
   * should not be kept around unless it is needed for error reporting. Holders of context
   * should listen for the 'finalize' event to release the ctx if fired. */
  finalize = function(e) {
    if(!my.finalized) {
      if(my.request) {	
	//util.debug('REMOVING LISTENERS: ' + my.request);
	if(my.request.connection) {
	  my.request.connection.removeListener('error', finalize);
	  my.request.connection.removeListener('end', finalize);
	  my.request.connection.removeListener('close', finalize);
	  my.request.connection.removeListener('timeout', timeouthandler);
	}
	my.request.removeListener('error', finalize);
      }
      delete my.request;
      delete my.response;      
  
      log.debug('ctx finalize ' + my.tint /*+ ' - ' + util.inspect(e)*/);
      my.finalized = true;
      that.emit('finalize', that);
    }
  };  
  
  if(my.request) {
    if(my.request.connection) {      
      my.request.connection.on('error', finalize);
      my.request.connection.on('end', finalize);
      my.request.connection.on('close', finalize);
      my.request.connection.on('timeout', timeouthandler);
    }
    //util.debug('ADDING LISTENERS: ' + my.request);
    my.request.on('error', finalize);
  }
  
  /* ctx.error(e): logs an error and emit an error event 
     (causes the finalization of the context) */
  error = function(err, stack) {
    if(my.cfg['DEBUG'])
      log.error(err, true);
    else
      log.error(err, stack);
    if(!my.finalized)
      that.emit('error', err, that);
  };
  
  /* ctx.push(hr): add an element on the context stack */
  push = function(hdr) {
    my.stack.push(hdr);
  };

  /* ctx.pop():  removes the last in element from the contxt stack */
  pop = function(hdr) {
    my.stack.pop();
  };
  
  /* ctx.authenticate(): attempts authentication based on the cookie
     automatically extracted from the connection heafder */
  authenticate = function(key, alg) {    
    if(my.cookies['auth']) {
      //util.debug('COOKIE: ' + my.cookies['auth']);
      my.auth = cookie.authenticateCookie({cookie: my.cookies['auth'],
				           config: my.cfg,
					   key: key });
    }    
  };
  
 
  /* the remote address is pushed first */
  if(my.request && 
     my.request.connection)
    push(my.request.connection.remoteAddress); 
  
  /* handler registration */
  my.multi.on('error', function(err) { error(err); });

  /* expose the log object */
  that.log = log;

  base.method(that, 'finalize', finalize);  
  base.method(that, 'error', error);  
  base.method(that, 'push', push);  
  base.method(that, 'pop', pop);  
  base.method(that, 'authenticate', authenticate);
  
  base.getter(that, 'tint', my, 'tint');
  base.setter(that, 'tint', my, 'tint');
  base.getter(that, 'finalized', my, 'finalized');
  base.getter(that, 'stack', my, 'stack');
  base.getter(that, 'multi', my, 'multi');
  base.getter(that, 'config', my, 'config');
  
  base.getter(that, 'cookies', my, 'cookies');
  base.getter(that, 'auth', my, 'auth');
  
  base.getter(that, 'request', my, 'request');
  base.getter(that, 'response', my, 'response');

  return that;
};

context.inc = 0;

exports.context = context;




