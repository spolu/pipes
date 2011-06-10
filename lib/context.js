var util = require('util');
var events = require('events');
var http = require('http');

var base = require("./base.js");
var logger = require("./logger.js");
var config = require("./config.js");
var multi = require("./multi.js");
var cookie = require("./cookie.js");


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
   
  var that = new events.EventEmitter();

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

  var finalize, error, push, pop, authenticate;
  
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
    
  var timeouthandler = function() { log.debug('TIMEOUT EVENT'); };

  /** 
   * Finalize a context. This is done once it has been replied. A finalized context can
   * should not be kept around unless it is needed for error reporting. Holders of context
   * should listen for the 'finalize' event to release the ctx if fired.
   */
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
  
  error = function(err, stack) {
    if(my.cfg['DEBUG'])
      log.error(err, true);
    else
      log.error(err, stack);
    if(!my.finalized)
      that.emit('error', err, that);
  };
  
  push = function(hdr) {
    my.stack.push(hdr);
  };

  pop = function(hdr) {
    my.stack.pop();
  };
  
  authenticate = function(key, alg) {    
    if(my.cookies['auth']) {
      //util.debug('COOKIE: ' + my.cookies['auth']);
      my.auth = cookie.authenticateCookie({cookie: my.cookies['auth'],
				           config: my.cfg,
					   key: key });
    }    
  };
  
  
  if(my.request && 
     my.request.connection)
    push(my.request.connection.remoteAddress);  
  

  my.multi.on('error', function(err) { error(err); });

  that.log = log;

  that.method('finalize', finalize);  
  that.method('error', error);  
  that.method('push', push);  
  that.method('pop', pop);  
  that.method('authenticate', authenticate);
  
  that.getter('tint', my, 'tint');
  that.setter('tint', my, 'tint');
  that.getter('finalized', my, 'finalized');
  that.getter('stack', my, 'stack');
  that.getter('multi', my, 'multi');
  that.getter('config', my, 'config');
  
  that.getter('cookies', my, 'cookies');
  that.getter('auth', my, 'auth');
  
  that.getter('request', my, 'request');
  that.getter('response', my, 'response');

  return that;
};

context.inc = 0;

exports.context = context;



