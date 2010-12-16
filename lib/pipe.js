var events = require('events');
var http = require('http');
var util = require('util');
var fwk = require('fwk');

var cfg = require("./config.js");
var context = require("./context.js");


/**
 * A subscription representation
 * 
 * @param spec {id, tag, server, port, cookie, config}
 */
var subscription = function(spec, my) {
  my = my || {};
  var _super = {};
  
  my.id = spec.id;
  my.tag = spec.tag;

  my.server = spec.server;
  my.port = spec.port;
  my.cookie = spec.cookie;

  my.status = 'retry';  
  
  my.cfg = spec.config || cfg.config;

  my.retries = 0;
  my.calls = 0;

  var that = new events.EventEmitter();  
  
  var retry, error;  
  
  retry = function() {
    
    var req, handler;
    
    handler = function (res) {
      my.status = 'connected';
      that.emit('connect');
      res.setEncoding('utf8'); 
      
      my.ctx.multi().on('recv', function(type, data) {
			  if(type === 'msg') {
			    var msg = fwk.message.deserialize(data);       
			    that.emit('msg', msg);
			    my.calls++;
			  }
			});    
      my.ctx.multi().on('end', function() {
			  my.ctx.finalize();
			});	           
      res.on('data', function(chunk) { my.ctx.multi().recv(chunk); });
      res.on('end', function() { my.ctx.multi().end(); });    
    };
    
    my.status = 'connecting';
    var client = http.createClient(my.port, my.server);

    my.ctx = context.context({ config: my.cfg, logger: fwk.silent({}),
			       client: client });
    
    my.ctx.on('error', function(err) {
		that.emit('error', err);
		my.ctx.finalize();
	      });
    my.ctx.on('finalize', function() {
		my.status='retry';
		my.retries++;
		that.emit('disconnect');	
		delete my.ctx;
	      });
    
    req = my.ctx.client().request('GET', '/sub?id=' + my.id + '&tag=' + my.tag,
				  {'Cookie': my.cookie});    
    req.end();    
    req.on('response', handler);            
  };
  

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
  my.cfg = cfg.config;

  my.server = spec.server || my.cfg['PIPE_SERVER'];
  my.port = spec.port || my.cfg['PIPE_PORT'];

  my.key = spec.key || my.cfg['PIPE_HMAC_KEY'];
  my.user = spec.user || my.cfg['PIPE_ADMIN_USER'];
  my.expiry = function() { 
    var d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }();
  
  my.cookie = fwk.generateAuthCookie({config: my.cfg,
				      key: my.key,
				      user: my.user,
				      expiry: my.expiry,
				      server: my.server});
  
  my.subs = [];
    
  /**
   * Events emitted:
   * 'error'      : when error while communicating with the server
   * 'connect'    : when connceted
   * 'disconnect' : when disconnected (retried automatically)
   * '1w'         : when a 1w message is received
   * '2w'         : when a 2w message is received 
   * 'r'          : when a r  message is received 
   */
  var that = new events.EventEmitter();  

  var pump, subscribe, register, unregister, send;  
  
  pump = function() {
    for(var i = 0; i < my.subs.length; i ++) {
      var sub = my.subs[i];
      if(sub.status() === 'retry')
	sub.retry();
      if(sub.status() === 'error')
	my.subs.remove(sub);
    }    
  };
      
  subscribe = function(id, tag) {
    var sub = subscription({id: id,
			    tag: tag,
			    server: my.server,
			    port: my.port,
			    cookie: my.cookie, 
			    config: my.cfg});

    sub.on('connect', function() {
	     that.emit('connect', id);
	     pump();
	   });
    sub.on('disconnect', function() {
	     that.emit('disconnect', id);
	     setTimeout(pump, 1000);
	   });
    sub.on('error', function(err) {
	     that.emit('error', err, id);
	     pump();
	   });
    sub.on('msg', function(msg){
	     if(msg.type() === '1w')
	       that.emit('1w', id, msg);
	     if(msg.type() === '2w')
	       that.emit('2w', id, msg);
	     if(msg.type() === 'r')
	       that.emit('r', id, msg);
	     /** no need to pump connection is kept alive */
	   });

    my.subs.push(sub);
    pump();
  };
  
  /** cb_(err, id) */
  register = function(filter, router, cb_) {
    var cb_ = cb_.once();

    var client = http.createClient(my.port, my.server);
    var ctx = context.context({ config: my.cfg, logger: fwk.silent({}),
				client: client });    
    ctx.on('error', function(err) {		
	     cb_(err);
	     my.ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	     delete my.ctx;
	   });
    
    var filterdata = filter.toString();    
    var routerdata = router.toString();
    
    var req = ctx.client().request('POST', '/reg',
				   {'Cookie': my.cookie,
				    'Content-Type': 'text/plain'});
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('filter', filterdata);
    ctx.multi().send('router', routerdata);
    req.end();

    req.on('response', function (res) {
	     res.setEncoding('utf8');
	     var id;
	     
	     res.on('data', ctx.multi().recv);
	     res.on('end', ctx.multi().end);
	     
	     ctx.multi().on('recv', function(type, data) {
			      if(type === 'id')
				id = data;
			    });
	     ctx.multi().on('end', function() {
			      if(id)
				cb_(null, id);
			    });
	   });
  };
  
  /** cb_(err) */
  unregister = function(id, cb_) {
    var cb_ = cb_.once();

    var client = http.createClient(my.port, my.server);
    var ctx = context.context({ config: my.cfg, logger: fwk.silent({}),
				client: client });    
    ctx.on('error', function(err) {		
	     cb_(err);
	     my.ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	     delete my.ctx;
	   });
    
    var req = ctx.client().request('GET', '/unr?id=' + id,
				   {'Cookie': my.cookie,
				    'Content-Type': 'text/plain' });    
    req.end();
    req.on('response', function (res) {
	     res.setEncoding('utf8');
	     var done;	     
	     
	     res.on('data', ctx.multi().recv);
	     res.on('end', ctx.multi().end);
	     
	     ctx.multi().on('recv', function(type, data) {
			      if(type === 'done')
				done = true;
			    });
	     ctx.multi().on('end', function() {
			      if(done)
				cb_(null);
			    });
	   });
  };

  /** cb_(err, hdr, res) */  
  send = function(msg, cb_) {
    var cb_ = cb_.once();

    var client = http.createClient(my.port, my.server);
    var ctx = context.context({ config: my.cfg, logger: fwk.silent({}),
				client: client });    
    ctx.on('error', function(err) {		
	     cb_(err);
	     ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	     delete my.ctx;
	   });
    
    var req = client.request('POST', '/msg',
			     {'Cookie': my.cookie,
			      'Content-Type': 'text/plain' });
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('msg', msg.serialize());
    req.end();    
    req.on('response', function(res) {
	     res.setEncoding('utf8');
	     var result = {};	     
	     var done;

	     res.on('data', ctx.multi().recv);
	     res.on('end', ctx.multi().end);
	     
	     ctx.multi().on('recv', function(type, data) {
			      done = true;
			      result[type] = data;
			    });
	     ctx.multi().on('end', function() {
			      if(done)
				cb_(null, res.headers, result);
			    });
	   });
  };


  that.method('register', register);
  that.method('unregister', unregister);
  that.method('subscribe', subscribe);
  that.method('send', send);

  that.getter('subs', my, 'subs');  

  pump();

  return that;
};

exports.pipe = pipe;
