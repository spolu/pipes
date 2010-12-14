var events = require('events');
var http = require('http');
var util = require('util');
var fwk = require('fwk');

var cfg = require("./config.js");



/**
 * A subscription representation
 * 
 * @param spec {id, client, cookie, pipe, config}
 */
var subscription = function(spec, my) {
  my = my || {};
  var _super = {};
  
  my.id = spec.id;
  my.type = spec.type;
  my.client = spec.client;  
  my.cookie = spec.cookie;
  my.pipe = spec.pipe;
  my.status = 'retry';  
  
  my.cfg = spec.config || cfg.config;

  my.retries = 0;
  my.calls = 0;
  my.ctx = fwk.context({config: my.cfg, logger: fwk.silent({})});

  var that = new events.EventEmitter();  
  
  var handler, retry, error;  
  
  my.ctx.multi().on('recv', function(type, body) {
		      if(type === 'msg') {
			var msg = fwk.message.deserialize(body);       
			that.emit('msg', msg);
			my.calls++;
		      }
		    });    
  my.ctx.multi().on('end', function() {
		      my.status = 'retry';
		      that.emit('end');
		    });
  my.ctx.multi().on('error', function(err) {
		      that.emit('fatal', err);
		      my.status = 'fatal';
		    });  

  handler = function (res) {
    res.setEncoding('utf8');    
    res.on('data', function(chunk) { my.ctx.multi().recv(chunk); });
    res.on('end', function() { my.ctx.multi().end(); });    
  };
  
  retry = function() {
    my.status = 'connected';
    my.req = my.client.request('GET', '/sub?id=' + my.id + '&type=' + my.type,
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
  
  my.commands = http.createClient(my.port, my.server);
  
  /**
   * Events emitted:
   * 'fatal'      : when error while communicating with the server
   * 'error'      : when error on connection (retried automatically)
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
      
  subscribe = function(id, type) {
    var sub = subscription({id: id,
			    type: type,
			    client: http.createClient(my.port, my.server), 
			    cookie: my.cookie, 
			    pipe: that,
			    config: my.cfg});

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
	     /** no need to pump connection is kept alive */
	   });
    sub.on('end', function() {
	     pump();
	   });

    my.subs.push(sub);
    pump();
  };

  register = function(filter, router, cont_) {
    var ctx = fwk.context({config: my.cfg});

    var filterdata = filter.toString();    
    var routerdata = router.toString();
    
    var req = my.commands.request('POST', '/reg',
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
	     
	     ctx.multi().on('recv', function(type, body) {
			      if(type === 'id')
				id = body;
			    });
	     ctx.multi().on('end', function() {
			      if(id)
				cont_(null, id);			      
			    });
	     ctx.multi().on('error', function(err) {
			      cont_(err, null);
			    });
	   });
  };
  
  unregister = function(id, cont_) {
    var ctx = fwk.context({config: my.cfg});

    var req = my.commands.request('GET', '/unr?id=' + id,
				  {'Cookie': my.cookie,
				   'Content-Type': 'text/plain' });    
    req.end();
    req.on('response', function (res) {
	     res.setEncoding('utf8');
	     var done;	     
	     
	     res.on('data', ctx.multi().recv);
	     res.on('end', ctx.multi().end);
	     
	     ctx.multi().on('recv', function(type, body) {
			      if(type === 'done')
				done = true;
			    });
	     ctx.multi().on('end', function() {
			      if(done)
				cont_(null);
			    });
	     ctx.multi().on('error', function(err) {
			      cont_(err);
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
