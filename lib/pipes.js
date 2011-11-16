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

var events = require('events');
var http = require('http');
var util = require('util');

/**
 * Top-Level pipes Library
 */

var base = require("./base.js");
var config = require("./config.js");
var ctx = require("./context.js");
var logger = require("./logger.js");
var msg = require("./message.js");
var multi = require("./multi.js");
var cookie = require("./cookie.js");
var lock = require("./lock.js");
var file = require("./file.js");
var mplex = require("./mplex.js");


exports.context = ctx.context;

exports.logger = logger.logger;
exports.silent = logger.silent;

exports.populateConfig = config.populateConfig;
exports.extractArgvs = config.extractArgvs;
exports.baseConfig = config.baseConfig;

exports.message = msg.message;

exports.multi = multi.multi;

exports.generateAuthCookie = cookie.generateAuthCookie;
exports.generateAuthSetCookie = cookie.generateAuthSetCookie;
exports.authenticateCookie = cookie.authenticateCookie;

exports.lock = lock.lock;
exports.mplex = mplex.mplex;

exports.readfile = file.readfile;

exports.method = base.method;
exports.getter = base.getter;
exports.setter = base.setter;
exports.responds = base.responds;
exports.shallow = base.shallow;
exports.clone = base.clone;
exports.makehash = base.makehash;
exports.forEach = base.forEach;

var fwk = exports;

/**
 * Basic Config
 */

var cfg = { config: config.baseConfig() };

cfg.config['PIPES_SERVER'] = '127.0.0.1';
cfg.config['PIPES_PORT'] = 22222;
cfg.config['PIPES_HMAC_KEY'] = 'INSECURE';
cfg.config['PIPES_ADMIN_USER'] = 'admin';
cfg.config['TINT_NAME'] = 'pipes';


/**
 * pipes.js
 * 
 * Additionally to defining all library functions in the top-level
 * pipes module, we define the library function necessary to using
 * pipes as a client.
 * 
 * Clients subscribe to a registration (created on the pipes server)
 * to receive all messages filtered by this registration and routed to 
 * that client according to the subscription router.
 * 
 * The library therefore rely on a subscription object, representing
 * that subscription with a reference to the registration id and
 * acting as a wrapper to the connection created to the pipes server.
 * 
 * The subscription emits messages that are handled by the pipe object
 * (client facing library). These message are either 'msg' when a new
 * message is received, or status related message such as 'connect',
 * 'stop', 'disconnect' (if a disconnect happened, in which case the
 * subscription retries to connect) and 'error' in case of error.
 * 
 * The pipe object exposes interface to the pipe system allowing the
 * current client to send message, subscribe to a registration. It
 * also provides an admistration interface to craete registration, grant 
 * and revoke additional filters
 * 
 * The events emitted are described in the pipes object but are
 * relatively straightforward, 'connect', 'disconnect', 'added', 'stoped',
 * removed for subscriptions. '1w', '2w', 'c', 'r' when receiving
 * messages. and 'error'.
 */

/**
 * A subscription representation
 * 
 * @extends events.EventEmitter;
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

  //public  
  var retry;    /* retry() */
  var stop;     /* stop() */
  var describe; /* describe() */ 

  var that = new events.EventEmitter();  
  
  /* sub.retry()
   * inits or retry a connection to pipes
   */
  retry = function() {
    
    var handler = function (res) {
      my.status = 'connected';

      my.ctx = fwk.context({ config: my.cfg, 
			     logger: fwk.silent({}),
			     request: req });
      req.socket.setTimeout(0);
      
      my.ctx.on('error', function(err) {
		  util.debug('sub: ctx error ' + my.status + ' ' + err);
		  that.emit('error', err);
		  my.ctx.finalize();
		});
      my.ctx.on('finalize', function() {
		  util.debug('sub: ctx finalize ' + my.status);
		  if(my.status !== 'error' && my.status !== 'stop') {
		    my.status='retry';
		    my.retries++;		  
		  }
		  util.debug('sub: ctx finalize ' + my.status);
		  that.emit('disconnect');	
		  delete my.ctx;
		});          

      res.setEncoding('utf8'); 
      
      my.ctx.multi().on('recv', function(type, data) {
			  if(type === 'msg') {
			    var msg = fwk.message.deserialize(data);       
			    that.emit('msg', msg);
			    my.msgs++;
			  }
			});    
      my.ctx.multi().on('end', function() {
			  util.debug('multi: received end ' + my.status);
			  my.ctx.finalize();
			});	           
      res.on('data', function(chunk) { if(my.ctx) my.ctx.multi().recv(chunk); });
      res.on('end', function() { if(my.ctx) { my.ctx.multi().end(); } });    
    };
          
    my.status = 'connecting';
    var options = { host: my.server,
		    port: my.port,
		    method: 'GET',
		    agent: false,
		    path: '/sub?id=' + my.id + '&tag=' + my.tag,
		    headers: { Cookie: my.cookie } };    
    
    var req = http.request(options, handler);    

    util.debug('CONNECTING: ' + my.server + ':' + my.port + '/sub?id=' + my.id + '&tag=' + my.tag);

    req.on('error', function(e) {
	     util.debug('sub: req error: ' + my.status + ' ' + e);
	     if(my.status !== 'error' && my.status !== 'stop') {
	       my.status='retry';
	       my.retries++;		  
	     }
	     that.emit('disconnect');	
	   });

    req.end();    
    that.emit('connect');
  };
  
  /* sub.stop()
   * stops the current subscription
   */
  stop = function() {
    my.status = 'stop';
    if(my.ctx) { my.ctx.finalize(); }
    that.emit('stop');
  };
  
  /* sub.describe()
   * describe the subscription
   */
  describe = function() {
    var data = { server: my.server,
		 port: my.port,
		 id: my.id,
		 tag: my.tag };
    return data;
  };

  fwk.getter(that, 'id', my, 'id');
  fwk.getter(that, 'status', my, 'status');
  fwk.getter(that, 'msgs', my, 'msgs');
  fwk.getter(that, 'retries', my, 'retries');
  
  fwk.method(that, 'retry', retry);
  fwk.method(that, 'stop', stop);

  return that;
};




/**
 * The main Pipe object exposed to clients.
 * 
 * @extends Event.eventEmitter
 * 
 * @param spec {server, port, key, user}
 */
var pipe = function(spec, my) {
  my = my || {};
  var _super = {};
  
  fwk.populateConfig(cfg.config);  
  my.cfg = cfg.config;

  my.server = spec.server || my.cfg['PIPES_SERVER'];
  my.port = spec.port || my.cfg['PIPES_PORT'];

  my.key = spec.key || my.cfg['PIPES_HMAC_KEY'];
  my.user = spec.user || my.cfg['PIPES_ADMIN_USER'];

  my.expiry = function() { 
    var d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.getTime();
  }();
  
  my.cookie = fwk.generateAuthCookie({config: my.cfg,
				      key: my.key,
				      user: my.user,
				      expiry: my.expiry,
				      server: my.server});
  
  my.subs = [];

  http.globalAgent.maxSockets = 499;
    
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
   * 'c'          : when a 1w-c message is received
   */
  
  // private
  var pump; 

  // public
  var subscribe;
  var stop;
  var send;
  var register;
  var unregister;
  var grant;
  var revoke;
  var list;  
  var shutdown;

  var that = new events.EventEmitter();  
  
  /* pump()
   * internal functions to refresh the state of each subscription
   * whenever an event is received. 
   */
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
      

  /* subscribe(id, tag)
   * subscribes to the registration described by id, providing a tag
   * to denote that newly created subscription. Once the subscription
   * process is completed. new messages are emited when needed
   */
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
  
  /* stop(id)
   * stop the subscription to registration id
   * if id undefined stops all */
  stop = function(id) {
    for(var i = 0; i < my.subs.length; i ++) {
      if(typeof id === 'undefined' || my.subs[i].id() === id)
	my.subs[i].stop();
    }
  };
  
  /* send(msg, function(err, hdr, res) {...})
   * send the message msg. When done (ack received or reply received),
   * callback is called with err defined if an error occured, otherwise
   * hdr containing the header passed with the replied message and res
   * containing the result retrieved through the replied message if 
   * appropriate
   */  
  send = function(msg, cb_) {
    var cb_once = cb_.once();
    
    var handler = function(res) {
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
			 try {			   
			   cb_once(null, res.headers, result);
			 } catch (err) {
			   util.debug(err.stack);
			   cb_(err);
			 }
		     });
    };
    
    var options = { host: my.server,
		    port: my.port,
		    method: 'POST',
		    path: '/msg',
		    headers: {'Cookie': my.cookie,
			      'Content-Type': 'text/plain' } };    

    var req = http.request(options, handler);

    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    request: req });    

    ctx.on('error', function(err) {		
	     util.debug(err.stack);
	     cb_once(err);
	     ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     var err = new Error('Connection Error');
	     cb_once(err);
	   });
    
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('msg', msg.serialize());
    req.end();    
  };


  /* register(tag, filter, router, function(err, id) {...})
   * created a new registration on the pipes server with the given
   * tag, filter, and router. And id is returned and the newly created
   * registration can be referred by its id or tag. The registration will
   * use the specified filter to decide which message it's supposed to
   * handle, and will use the router function to route the message to an
   * apprioriate subscription (see filter and router signature in examples)
   */
  register = function(tag, filter, router, cb_) {
    var cb_ = cb_.once();
    
    var handler = function (res) {
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
    };

    var options = { host: my.server,
		    port: my.port,
		    method: 'POST',
		    path: '/reg',
		    headers: {'Cookie': my.cookie,
			      'Content-Type': 'text/plain' } };    

    var req = http.request(options, handler);

    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    request: req });    

    ctx.on('error', function(err) {		
	     cb_(err);
	     ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	   });
    
    var filterdata = filter.toString();    
    var routerdata = router.toString();
    
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('tag', tag);
    ctx.multi().send('filter', filterdata);
    ctx.multi().send('router', routerdata);
    req.end();
  };
  

  /** cb_(err) */
  unregister = function(id, cb_) {
    var cb_ = cb_.once();
    
    var handler = function (res) {
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
    };

    var options = { host: my.server,
		    port: my.port,
		    method: 'POST',
		    path: '/unr',
		    headers: {'Cookie': my.cookie,
			      'Content-Type': 'text/plain' } };    

    var req = http.request(options, handler);

    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    request: req});    

    ctx.on('error', function(err) {		
	     cb_(err);
	     ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	   });
    
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('id', id);
    req.end();
  };


  
  /** cb_(err, id) */
  grant = function(tag, filter, cb_) {
    var cb_ = cb_.once();
    
    var handler = function (res) {
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
    };

    var options = { host: my.server,
		    port: my.port,
		    method: 'POST',
		    path: '/grt',
		    headers: {'Cookie': my.cookie,
			      'Content-Type': 'text/plain' } };    

    var req = http.request(options, handler);

    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    request: req});    
    ctx.on('error', function(err) {		
	     cb_(err);
	     ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	   });
    
    var filterdata = filter.toString();    
    
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('tag', tag);
    ctx.multi().send('filter', filterdata);
    req.end();
  };
  

  /** cb_(err) */
  revoke = function(id, cb_) {
    var cb_ = cb_.once();
    
    var handler = function (res) {
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
    };

    var options = { host: my.server,
		    port: my.port,
		    method: 'POST',
		    path: '/rvk',
		    headers: {'Cookie': my.cookie,
			      'Content-Type': 'text/plain' } };    

    var req = http.request(options, handler);
    
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    request: req });    

    ctx.on('error', function(err) {		
	     cb_(err);
	     ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	   });
    
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('id', id);
    req.end();
  };
  

  /** cb_(err, data) */
  list = function(kind, id, cb_) {
    var cb_ = cb_.once();

    var handler = function(res) {
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
			 } catch (err) { cb_(err, null); }			      
		       }
		     });
    };
    
    var options = { host: my.server,
		    port: my.port,
		    method: 'POST',
		    path: '/lst',
		    headers: {'Cookie': my.cookie,
			      'Content-Type': 'text/plain' } };    

    var req = http.request(options, handler);
    
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    request: req });    

    ctx.on('error', function(err) {		
	     cb_(err);
	     ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	   });
    
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('kind', kind);
    if(id)
      ctx.multi().send('id', id);      
    req.end();    
  };

  
  
  /** cb_(err) */
  shutdown = function(cb_) {
    var cb_ = cb_.once();
    
    var handler = function (res) {
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
    };

    var options = { host: my.server,
		    port: my.port,
		    method: 'POST',
		    path: '/sht',
		    headers: {'Cookie': my.cookie,
			      'Content-Type': 'text/plain' } };    

    var req = http.request(options, handler);
    
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    request: req });    

    ctx.on('error', function(err) {		
	     cb_(err);
	     ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     cb_(new Error('Connection Error'));
	   });
    
    req.end();
  };  
  

  fwk.method(that, 'subscribe', subscribe);
  fwk.method(that, 'stop', stop);
  fwk.method(that, 'send', send);

  fwk.method(that, 'register', register);
  fwk.method(that, 'unregister', unregister);
  
  fwk.method(that, 'grant', grant);
  fwk.method(that, 'revoke', revoke);

  fwk.method(that, 'list', list);

  fwk.method(that, 'shutdown', shutdown);

  fwk.getter(that, 'subs', my, 'subs');  

  pump();

  return that;
};

exports.pipe = pipe;
