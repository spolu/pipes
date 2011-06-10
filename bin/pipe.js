#!/usr/local/bin/node

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

var http = require('http');
var url = require('url');
var util = require('util');
var fwk = require('pipe');

var cfg = require("./config.js");

/** 
 * The Pipe Server Object
 * 
 * @extends {}
 * 
 * @param spec {port}
 */ 
var pipe = function(spec, my) {
  my = my || {};
  var _super = {};

  fwk.populateConfig(cfg.config);
  my.cfg = cfg.config;
  my.logger = fwk.logger();
  
  my.port = spec.port || my.cfg['PIPE_PORT'];
  
  my.server = http.createServer();

  my.router = require("./router.js").router({ config: my.cfg });
  my.access = require("./access.js").access({ config: my.cfg });
  
  var that = {};
  
  var handler, error, unauthorized, notfound;
  var message, subscribe, register, unregister, grant, revoke, list;
  var shutdown, check;
  
  handler = function(req, res) {
    //util.debug('PIPE HANDLER');    
    var ctx = fwk.context({ request: req,
			    response: res,
			    logger: my.logger,
			    config: my.cfg });
    ctx.request().setEncoding('utf8');
    urlreq = url.parse(ctx.request().url, true);
    ctx.push('cmd:' + urlreq.pathname.substring(1));

    /** authentication */
    ctx.authenticate(my.cfg['PIPE_HMAC_KEY']);
    if(ctx.auth().authenticated)
      ctx.push('user:' + ctx.auth().user);
    else
      ctx.push('user:none');
    
    var auth = ctx.auth().authenticated;
    var user = ctx.auth().user;
    
    /** error handling */
    ctx.on('error', function(err, ctx) {
	     error(ctx, 500, err.message);
	   });
    
    switch(urlreq.pathname) {
      
      /** PUBLIC FUNCTIONS */    
      
      /** message 1-way/2-way */
    case '/msg':    
      message(ctx, urlreq.query);
      break;    
      
      /** ADMIN FUNCTIONS */
      
    /** subscription */
    case '/sub':
      if(user === my.cfg['PIPE_ADMIN_USER'] && auth)
	subscribe(ctx, urlreq.query);
      else notfound(ctx);
      break;
      
      /** registration */
    case '/reg':
      if(user === my.cfg['PIPE_ADMIN_USER'] && auth)
	register(ctx, urlreq.query);
      else notfound(ctx);
      break;
    case '/unr':
      if(user === my.cfg['PIPE_ADMIN_USER'] && auth)
	unregister(ctx, urlreq.query);
      else notfound(ctx);
      break;
      
      /** grant */
    case '/grt':
      if(user === my.cfg['PIPE_ADMIN_USER'] && auth)
	grant(ctx, urlreq.query);
      else notfound(ctx);
      break;
    case '/rvk':
      if(user === my.cfg['PIPE_ADMIN_USER'] && auth)
	revoke(ctx, urlreq.query);
      else notfound(ctx);
      break;
      
      /** list */
    case '/lst':
      if(user === my.cfg['PIPE_ADMIN_USER'] && auth)
	list(ctx, urlreq.query);
      else notfound(ctx);
      break;
      
      /** shutdown */
    case '/sht':
      if(user === my.cfg['PIPE_ADMIN_USER'] && auth)
	shutdown(ctx);
      else notfound(ctx);
      break;
      
      /** check */
    case '/chk':
      check(ctx);
      break;

    default:
      notfound(ctx);
    }    
  };

  error = function(ctx, code, reason) {
    var data = code + ' {' + ctx.tint() + '} [' + reason + ']: ';
    if(ctx.request())
      data += unescape(ctx.request().url);
    ctx.response().writeHead(code, {'Content-Length': data.length,
				    'Content-Type': "text/html; charset=utf8"});
    ctx.response().write(data);
    ctx.response().end();  
    ctx.finalize();
  };
  
  notfound = function(ctx) {
    error(ctx, 404, 'Not Found');    
  };
  
  unauthorized = function(ctx) {
    error(ctx, 403, 'Forbidden');
  };

  
  message = function(ctx, query) {
    var msg;

    ctx.request().connection.setTimeout(0);

    //ctx.log.debug('query: ' + util.inspect(query));
    
    ctx.request().on("data", function(chunk) { ctx.multi().recv(chunk); });
    ctx.request().on("end", function() { ctx.multi().end(); });
    
    ctx.multi().on(
      'recv', 
      function(type, body) {
	//ctx.log.out('multi ' + type + ': ' + body);
	if(type === 'msg') {
	  try {
	    msg = fwk.message.deserialize(body);
	    /** cookie forwarding */
	    msg.setCookies(ctx.cookies());
	    /** tint forwarding */
	    if(msg.tint())
	      ctx.setTint(msg.tint());
	    else
	      msg.setTint(ctx.tint());		       
	  } catch (err) { ctx.error(err); }		     
	}
      });
    
    ctx.multi().on(
      'end', 
      function() {
	if(msg) {
	  try {
	    ctx.log.out('msg: ' + msg.type() + ' ' + msg);
	    if(my.access.isgranted(ctx, msg)) {
	      /** route 1w, 2w, c, r */
	      if (msg.type() === '1w' || msg.type() === '2w' ||
		  msg.type() === 'c' || msg.type() === 'r') {		
		my.router.route(
		  ctx, msg, 
		  function(reply) {
		    var body = JSON.stringify(reply.body());
		    var headers = reply.headers();
		    headers['Content-Type'] = "text/plain; charset=utf8";
		    ctx.response().writeHead(200, headers);
		    ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
		    ctx.multi().send('body', body);
		    ctx.response().end();
		    ctx.finalize();	 
		  });
		/** timeout 2w, c */
		if(msg.type() === '2w' || msg.type() === 'c') {
		  setTimeout(function() {
			       if(!ctx.finalized())
				 ctx.error(new Error('message timeout'));
			     }, my.cfg['PIPE_TIMEOUT']);		
		}
	      }
	      else {
		if(!ctx.finalized())
		  ctx.error(new Error('unknownd message type to route'));		
	      }
	    }
	    else
	      unauthorized(ctx);
	  } catch (err) { ctx.error(err, true); }
	} 
	else 
	  ctx.error(new Error('No msg specified'));
      });    
  };  

  subscribe = function(ctx, query) {
    try {
      if(query && 
	 query.id && query.tag) {
	var id = query.id;
	var tag = query.tag;      
	var first = true;

	ctx.request().connection.setTimeout(0);

	my.router.subscribe(
	  ctx, id, tag, 
	  function(msg) {		
	    if(first) {
	      ctx.response().writeHead(200, {'Content-Type': 'text/plain; charset=utf8'});
	      ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
	      first = false;
	    }
	    ctx.multi().send('msg', msg.serialize());
	    ctx.request().connection.setTimeout(0);
	  });      
      } else 
	ctx.error(new Error('subscribe: no id specified'));    
    } catch (err) { ctx.error(err, true); }
  };

  
  register = function(ctx, query) {
    var tag, filter, router;  
  
    ctx.request().on("data", function(chunk) { ctx.multi().recv(chunk); });
    ctx.request().on("end", function() { ctx.multi().end(); });
    
    ctx.multi().on(
      'recv', function(type, data) {
	if(type === 'tag')
	  tag = data;
	if(type === 'filter')
	  filter = data;
	if(type === 'router')
	  router = data;
      });
    
    ctx.multi().on(
      'end', 
      function() {
	try {
	  if(filter && router) {
	    eval("var filterfun = " + filter);
	    eval("var routerfun = " + router);	    
	    if(typeof filterfun === 'function' &&
	       typeof routerfun === 'function') {
	      var id = my.router.register(ctx, tag, filterfun, routerfun);
	      
	      ctx.response().writeHead(200, {'Content-Type': 'text/plain; charset=utf8'});
	      ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
	      ctx.multi().send('id', id);
	      ctx.response().end();
	      ctx.finalize();	 
	    }		     
	    else
	      ctx.error(new Error('register: filter or router not a function'));		   		     
	  }
	  else
	    ctx.error(new Error('register: filter or router unspecified'));		   		     
	} catch (err) { ctx.error(err, true); }
      });  
  };
  

  unregister = function(ctx, query) {
    var id;

    ctx.request().on("data", function(chunk) { ctx.multi().recv(chunk); });
    ctx.request().on("end", function() { ctx.multi().end(); });
    
    ctx.multi().on(
      'recv', function(type, data) {
	if(type === 'id')
	  id = data;
      });
    
    ctx.multi().on(
      'end', 
      function() {
	try {
	  if(id) {
	    my.router.unregister(ctx, id);
	    
	    ctx.response().writeHead(200, {'Content-Type': 'text/plain; charset=utf8'});
	    ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
	    ctx.multi().send('done');
	    ctx.response().end();
	    ctx.finalize();	 
	  }
	  else
	    ctx.error(new Error('unregister: no id specified'));		   		     
	} catch (err) { ctx.error(err, true); }
      });  
  };
  

  grant = function(ctx, query) {
    var tag, filter;  
  
    ctx.request().on("data", function(chunk) { ctx.multi().recv(chunk); });
    ctx.request().on("end", function() { ctx.multi().end(); });
    
    ctx.multi().on(
      'recv', function(type, data) {
	if(type === 'tag')
	  tag = data;
	if(type === 'filter')
	  filter = data;
      });
    
    ctx.multi().on(
      'end', 
      function() {
	try {
	  if(filter) {
	    eval("var filterfun = " + filter);	    
	    if(typeof filterfun === 'function') {
	      var id = my.access.grant(ctx, tag, filterfun);
	      
	      ctx.response().writeHead(200, {'Content-Type': 'text/plain; charset=utf8'});
	      ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
	      ctx.multi().send('id', id);
	      ctx.response().end();
	      ctx.finalize();	 
	    }		     
	    else
	      ctx.error(new Error('grant: filter not a function'));		   		     
	  }
	  else
	    ctx.error(new Error('grant: filter or router unspecified'));		   		     
	} catch (err) { ctx.error(err, true); }
      });      
  };

  
  revoke = function(ctx, query) {
    var id;

    ctx.request().on("data", function(chunk) { ctx.multi().recv(chunk); });
    ctx.request().on("end", function() { ctx.multi().end(); });
    
    ctx.multi().on(
      'recv', function(type, data) {
	if(type === 'id')
	  id = data;
      });
    
    ctx.multi().on(
      'end', 
      function() {
	try {
	  if(id) {
	    my.access.revoke(ctx, id);
	    
	    ctx.response().writeHead(200, {'Content-Type': 'text/plain; charset=utf8'});
	    ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
	    ctx.multi().send('done');
	    ctx.response().end();
	    ctx.finalize();	 
	  }
	  else
	    ctx.error(new Error('revoke: no id specified'));		   		     
	} catch (err) { ctx.error(err, true); }
      });    
  };
  

  list = function(ctx, query) {
    var kind, id;

    ctx.request().on("data", function(chunk) { ctx.multi().recv(chunk); });
    ctx.request().on("end", function() { ctx.multi().end(); });
    
    ctx.multi().on(
      'recv', function(type, data) {
	if(type === 'kind')
	  kind = data;
	if(type === 'id')
	  id = data;
      });
    
    ctx.multi().on(
      'end', 
      function() {
	try {
	  if(kind) {
	    var data;	    
	    switch(kind) {
	    case 'reg':
	      data = my.router.list(id);
	      break;
	    case 'auth':
	      data = my.access.list(id);
	      break;
	    }	    

	    var body = JSON.stringify(data);
	    ctx.response().writeHead(200, {'Content-Type': 'text/plain; charset=utf8'});
	    ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
	    ctx.multi().send('data', body);
	    ctx.response().end();
	    ctx.finalize();	 	      
	  }
	  else
	    ctx.error(new Error('list: no kind specified'));		   		     
	} catch (err) { ctx.error(err, true); }
      });      
  };
  
  shutdown = function(ctx) {
    ctx.log.out('shutdown');
    my.server.close();
    my.router.shutdown(ctx);
    
    if(ctx.response()) {
      ctx.response().writeHead(200, {'Content-Type': 'text/plain; charset=utf8'});
      ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
      ctx.multi().send('done');
      ctx.response().end();
      ctx.finalize();
    }
  };  
  
  check = function(ctx) {
    if(ctx.response()) {
      ctx.response().writeHead(200, {'Content-Type': 'text/plain; charset=utf8'});
      ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
      ctx.multi().send('ok');
      ctx.response().end();
      ctx.finalize();
    }
  };  

  process.on('SIGINT', function () {
	       shutdown(fwk.context({ logger: my.logger,
				      config: my.cfg }));
	     });
  
  my.server.on('request', handler);
  
  my.server.listen(my.port);

  return that;  
};

/** main */
var p = pipe({});

