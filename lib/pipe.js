var events = require('events');
var http = require('http');
var util = require('util');
var fwk = require('fwk');

var cfg = require("./config.js");


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
  my.msgs = 0;

  var that = new events.EventEmitter();  
  
  var retry, stop, describe;  
  
  retry = function() {
    
    var req, handler;
    
    handler = function (res) {
      my.status = 'connected';
      res.setEncoding('utf8'); 
      
      my.ctx.multi().on('recv', function(type, data) {
			  if(type === 'msg') {
			    var msg = fwk.message.deserialize(data);       
			    that.emit('msg', msg);
			    my.msgs++;
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

    my.ctx = fwk.context({ config: my.cfg, 
			   logger: fwk.silent({}),
			   client: client });
    
    my.ctx.on('error', function(err) {
		that.emit('error', err);
		my.ctx.finalize();
	      });
    my.ctx.on('finalize', function() {
		if(my.status !== 'error' && my.status !== 'stop') {
		  my.status='retry';
		  my.retries++;		  
		}
		that.emit('disconnect');	
		delete my.ctx;
	      });
    
    req = my.ctx.client().request('GET', '/sub?id=' + my.id + '&tag=' + my.tag,
				  {'Cookie': my.cookie});    
    req.end();    
    that.emit('connect');
    req.on('response', handler);            
  };
  
  stop = function() {
    my.status = 'stop';
    if(my.ctx)
      my.ctx.finalize();
    that.emit('stop');
  };
  
  describe = function() {
    var data = { server: my.server,
		 port: my.port,
		 id: my.id,
		 tag: my.tag };
    return data;
  };

  that.getter('id', my, 'id');
  that.getter('status', my, 'status');
  that.getter('msgs', my, 'msgs');
  that.getter('retries', my, 'retries');
  
  that.method('retry', retry);
  that.method('stop', stop);

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
   * 'stop'       : when a subscription has been stopped
   * 'removed'    : when a subscription has been removed
   * 'added'      : when a subscription has been added
   * '1w'         : when a 1w   message is received
   * '2w'         : when a 2w   message is received 
   * 'r'          : when a r    message is received 
   * 'c'       : when a 1w-c message is received 
   */
  var that = new events.EventEmitter();  

  var pump, subscribe, stop, send, register, unregister;
  var grant, revoke, list;  
  var shutdown;
  
  pump = function() {
    for(var i = 0; i < my.subs.length; i ++) {
      var sub = my.subs[i];
      if(sub.status() === 'retry')
	sub.retry();
      if(sub.status() === 'error' || sub.status() === 'terminate') {
	my.subs.remove(sub);
	that.emit('removed', sub.id());
      }
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
    sub.on('stop', function() {
	     that.emit('stop', id);
	     pump();
	   });
    sub.on('msg', function(msg){
	     if(msg.type() === '1w')
	       that.emit('1w', id, msg);
	     if(msg.type() === '2w')
	       that.emit('2w', id, msg);
	     if(msg.type() === 'r')
	       that.emit('r', id, msg);
	     if(msg.type() === 'c')
	       that.emit('c', id, msg);
	     /** no need to pump connection is kept alive */
	   });

    my.subs.push(sub);
    that.emit('added', sub.id());

    pump();
  };
  
  /** if id undefined stops all */
  stop = function(id) {
    for(var i = 0; i < my.subs.length; i ++) {
      if(typeof id === 'undefined' || my.subs[i].id() === id)
	my.subs[i].stop();
    }
  };
  

  /** cb_(err, hdr, res) */  
  send = function(msg, cb_) {
    var cb_ = cb_.once();

    var client = http.createClient(my.port, my.server);
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
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


  /** cb_(err, id) */
  register = function(tag, filter, router, cb_) {
    var cb_ = cb_.once();

    var client = http.createClient(my.port, my.server);
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
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
    ctx.multi().send('tag', tag);
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
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    client: client });    
    ctx.on('error', function(err) {		
	     cb_(err);
	     my.ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	     delete my.ctx;
	   });
    
    var req = ctx.client().request('POST', '/unr',
				   {'Cookie': my.cookie,
				    'Content-Type': 'text/plain' });    
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('id', id);
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


  
  /** cb_(err, id) */
  grant = function(tag, filter, cb_) {
    var cb_ = cb_.once();

    var client = http.createClient(my.port, my.server);
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
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
    
    var req = ctx.client().request('POST', '/grt',
				   {'Cookie': my.cookie,
				    'Content-Type': 'text/plain'});
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('tag', tag);
    ctx.multi().send('filter', filterdata);
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
  revoke = function(id, cb_) {
    var cb_ = cb_.once();

    var client = http.createClient(my.port, my.server);
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    client: client });    
    ctx.on('error', function(err) {		
	     cb_(err);
	     my.ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	     delete my.ctx;
	   });
    
    var req = ctx.client().request('POST', '/rvk',
				   {'Cookie': my.cookie,
				    'Content-Type': 'text/plain' });    
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('id', id);
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
  

  /** cb_(err, data) */
  list = function(kind, id, cb_) {
    var cb_ = cb_.once();

    var client = http.createClient(my.port, my.server);
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    client: client });    
    ctx.on('error', function(err) {		
	     cb_(err);
	     ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	     delete my.ctx;
	   });
    
    var req = client.request('POST', '/lst',
			     {'Cookie': my.cookie,
			      'Content-Type': 'text/plain' });
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('kind', kind);
    if(id)
      ctx.multi().send('id', id);      
    req.end();    
    req.on('response', function(res) {
	     res.setEncoding('utf8');
	     var dat;

	     res.on('data', ctx.multi().recv);
	     res.on('end', ctx.multi().end);
	     
	     ctx.multi().on('recv', function(type, data) {
			      if(type === 'data') {
				dat = data;
			      }
			    });
	     ctx.multi().on('end', function() {
			      if(dat) {
				try {
				  var data = JSON.parse(dat);
				  cb_(null, data);			
				} catch (err) { cb_(err, null); }			      }
			    });
	   });    
  };

  
  
  /** cb_(err) */
  shutdown = function(cb_) {
    var cb_ = cb_.once();

    var client = http.createClient(my.port, my.server);
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    client: client });    
    ctx.on('error', function(err) {		
	     cb_(err);
	     my.ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	     delete my.ctx;
	   });
    
    var req = ctx.client().request('POST', '/sht',
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
  

  that.method('subscribe', subscribe);
  that.method('stop', stop);
  that.method('send', send);

  that.method('register', register);
  that.method('unregister', unregister);
  
  that.method('grant', grant);
  that.method('revoke', revoke);

  that.method('list', list);

  that.method('shutdown', shutdown);

  that.getter('subs', my, 'subs');  

  pump();

  return that;
};

exports.pipe = pipe;
