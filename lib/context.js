var fwk = require('fwk');
var util = require('util');
var events = require('events');


/**
 * A Client Context relative to an http request
 * 
 * @param spec {client, logger, config}
 */
var context = function(spec, my) {
  my = my || {};
  var _super = {};
  
  var that = fwk.context(spec, my);
  
  my.client = spec.client;
  
  my.tint = 'client-' + process.pid + ":" + (++context.inc);
  
  var finalize = function() {
    if(!my.finalized) {
      if(my.client) {	
	my.client.removeListener('end', finalize);
	my.client.removeListener('close', finalize);
	my.client.removeListener('error', finalize);
	my.client.end();
      }
      delete my.client;
    }
    _super.finalize();
  };

  if(my.client) {
    my.client.on('end', finalize);
    my.client.on('close', finalize);
    my.client.on('error', finalize);    
    my.client.on('timeout', function() { that.log.debug('TIMEOUT event'); });
  }
  
  that.getter('client', my, 'client');

  that.method('finalize', finalize, _super);
  
  return that;
};

context.inc = 0;

exports.context = context;

