var fwk = require('fwk');
var util = require('util');
var events = require('events');


/**
 * A Server Context relative to an http request
 * 
 * @param spec {request, response, logger, config}
 */
var context = function(spec, my) {
  my = my || {};
  var _super = {};
  
  var that = fwk.context(spec, my);

  my.request = spec.request;
  my.response = spec.response;  
  
  my.tint = my.cfg['TINT_NAME'] + '-' + process.pid + ":" + (++context.inc);

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
      my.cookies[name.trim()] = cookies[i].substring(name.length+1).trim();
    }    
  }
  
  if(my.request && 
     my.request.connection)
    that.push(my.request.connection.remoteAddress);    
  
  var finalize = function() {
    if(!my.finalized) {
      if(my.request && my.request.connection) {	
	my.request.connection.removeListener('end', finalize);
	my.request.connection.removeListener('close', finalize);
	my.request.connection.removeListener('error', finalize);
	my.request.connection.end();
      }
      delete my.request;
      delete my.response;      
    }
    _super.finalize();
  };

  if(my.request &&
     my.request.connection) {
    my.request.connection.on('end', finalize);
    my.request.connection.on('close', finalize);
    my.request.connection.on('error', finalize);    
    my.request.connection.on('timeout', function() { that.log.debug('TIMEOUT event'); });
  }
    
  var authenticate = function(key, alg) {    
    if(my.cookies['auth']) {
      my.auth = fwk.authenticateCookie({cookie: my.cookies['auth'],
				        config: my.cfg,
					key: key });
    }    
  };

  that.getter('cookies', my, 'cookies');
  that.getter('auth', my, 'auth');
  
  that.getter('request', my, 'request');
  that.getter('response', my, 'response');

  that.method('finalize', finalize, _super);
  that.method('authenticate', authenticate);
  
  return that;
};

context.inc = 0;

exports.context = context;

