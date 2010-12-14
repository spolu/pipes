var events = require('events');
var http = require('http');
var util = require('util');
var fwk = require('fwk');

var cfg = require("./config.js");



/**
 * A subscription representation
 * 
 * @param spec {id, client, cookie, pipe}
 */
var subscription = function(spec, my) {
  my = my || {};
  var _super = {};
  
  my.id = spec.id;
  my.client = spec.client;  
  my.cookie = spec.cookie;
  my.pipe = spec.pipe;
  my.status = 'retry';  

  my.retries = 0;
  my.calls = 0;

  var that = new events.EventEmitter();  
  
  var handler, retry, error;  

  handler = function (res) {
    res.setEncoding('utf8');
    var data = '';
    res.on('data', function(chunk) {
	     data += chunk;
	   });
    res.on('end', function() {
	     if(data.substring(0,3) === 'OK:') {	       
	       var msg = fwk.message.deserialize(data.substring(3));       
	       that.emit('msg', msg);
	       my.calls++;
	       my.status = 'retry';
	     }
	     else {
	       var err = new Error(data);
	       that.emit('fatal', err);
	       my.status = 'fatal';	       
	     }
	   });
  };
  
  retry = function() {
    my.status = 'pending';
    my.req = my.client.request('GET', '/sub?id=' + my.id,
			       {'Cookie': my.cookie});    
    my.req.end();    
    my.req.on('response', handler);    
  };
  
  error = function(err) {
    if(my.req)
      delete my.req;
    my.status = 'retry';
    my.retries++;
    that.emit('error', err);
  };
  
  my.client.on('error', error);
  
  that.getter('status', my, 'status');
  that.getter('calls', my, 'calls');
  that.getter('retries', my, 'retries');
  
  that.method('retry', retry);

  return that;
};


/**
 * The main Pipe object.
 * 
 * @param spec {server, port, key, user}
 */
var pipe = function(spec, my) {
  my = my || {};
  var _super = {};
  
  fwk.populateConfig(cfg.config);  

  my.server = spec.server || cfg.config['PIPE_SERVER'];
  my.port = spec.port || cfg.config['PIPE_PORT'];

  my.key = spec.key || cfg.config['PIPE_HMAC_KEY'];
  my.user = spec.user || cfg.config['PIPE_ADMIN_USER'];
  my.expiry = function() { 
    var d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }();
  
  my.cookie = fwk.authCookie(cfg.config['HMAC_ALGO'],
			     my.key,
			     my.user,
			     my.expiry,
			     "/",
			     my.server) + ";";
  my.subs = [];
  
  my.commands = http.createClient(my.port, my.server);
  
  /**
   * Events emitted:
   * '1w'         : when a 1w message is received
   * '2w'         : when a 2w message is received 
   */
  var that = new events.EventEmitter();  

  var pump, subscribe, register, unregister;  
  
  pump = function() {
    for(var i = 0; i < my.subs.length; i ++) {
      var sub = my.subs[i];
      if(sub.status() === 'retry')
	sub.retry();
      if(sub.status() === 'fatal')
	my.subs.remove(sub);
    }    
  };
      
  subscribe = function(id) {
    var sub = subscription({id: id, 
			    client: http.createClient(my.port, my.server), 
			    cookie: my.cookie, 
			    pipe: that});

    sub.on('error', function(err) {
	     that.emit('error', err, id);
	     pump();
	   });
    sub.on('fatal', function(err) {
	     that.emit('fatal', err, id);
	     pump();
	   });
    sub.on('msg', function(msg){
	     if(msg.type() === '1w')
	       that.emit('1w', msg);
	     if(msg.type() === '2w')
	       that.emit('2w', msg);
	     pump();
	   });

    my.subs.push(sub);
    pump();
  };

  register = function(filter, cont_) {    
    var data = filter.toString();    

    my.commands.on('error', function h(err) {
		     my.commands.removeListener('error', h);
		     cont_(err, null);
		   });    

    var req = my.commands.request('GET', '/reg',
				  {'Cookie': my.cookie,
				   'Content-Type': 'text/plain',
				   'Content-Length': data.length });    
    req.write(data);
    req.end();
    req.on('response', function (res) {
	     res.setEncoding('utf8');
	     var data = '';
	     res.on('data', function(chunk) {
		      data += chunk;
		    });
	     res.on('end', function() {	       
		      if(data.substring(0,3) === 'OK:') {
			cont_(null, data.substring(3));			
		      }
		      else {
			cont_(new Error(data), null);
		      }
		    });
	   });
  };
  
  unregister = function(id) {
    var data = filter.toString();    

    my.commands.on('error', function h(err) {
		     my.commands.removeListener('error', h);
		     cont_(err, null);
		   });    

    var req = my.commands.request('GET', '/unr?id=' + id,
				  {'Cookie': my.cookie,
				   'Content-Type': 'text/plain' });    
    req.end();
    req.on('response', function (res) {
	     res.setEncoding('utf8');
	     var data = '';
	     res.on('data', function(chunk) {
		      data += chunk;
		    });
	     res.on('end', function() {	       
		      if(data.substring(0,3) === 'OK:') {
			cont_(null);			
		      }
		      else {
			cont_(new Error(data));
		      }
		    });
	   });
  };
  

  that.method('register', register);
  that.method('unregister', unregister);
  that.method('subscribe', subscribe);

  that.getter('subs', my, 'subs');  

  pump(); setInterval(pump, 100);    

  return that;
};

exports.pipe = pipe;
