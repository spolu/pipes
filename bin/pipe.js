#!/usr/local/bin/node

var http = require('http');
var url = require('url');
var util = require('util');
var fwk = require('fwk');

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
  my.pool = require("./pool.js").pool({ config: my.cfg, 
					key: my.cfg['PIPE_HMAC_KEY'] });
  
  var that = {};
  
  var handler, error, unauthorized, notfound;
  var message, stream, subscribe, register, unregister, grant, revoke, list;
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
      
      /** message 1w,2w,c,r */
    case '/msg':    
      message(ctx, urlreq.query);
      break;    
      
      /** connect 1w,2w,cw,c,r */
    case '/str':
      stream(ctx, urlreq.query);
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
    var c, msg, stream = false;

    ctx.request().connection.setTimeout(0);
    //ctx.log.debug('query: ' + util.inspect(query));
    
    if(!query || !query.key) {
      c = my.pool.create();
      c.connect(ctx, function(reply) {
		  var body = JSON.stringify(reply.body());
		  var headers = reply.headers();
		  headers['Content-Type'] = "text/plain; charset=utf8";
		  ctx.response().writeHead(200, headers);
		  ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
		  ctx.multi().send('body', body);
		  
		  ctx.response().end();
		  ctx.finalize();	 	
		  c.finalize();
		});

      // 2w, c timeouts are handled by pool clients timeouts
      // (ctx kept in memory the whole duration but that's ok)
      c.on('finalize', function() {
	     if(!ctx.finalized())
	       ctx.error(new Error('pool: client timeout ' + c.key()));
	   });    
    }
    else {      
      stream = true;
      c = my.pool.get(query.key);
      if(!c) {
	if(!ctx.finalized())
	  ctx.error(new Error('pool: unknown client ' + query.key));
	return;
      }
    }

    ctx.request().on("data", function(chunk) { ctx.multi().recv(chunk); });
    ctx.request().on("end", function() { ctx.multi().end(); });

    ctx.multi().on(
      'recv', 
      function(type, body) {
	//util.debug('multi ' + type + ': ' + body + ' ' + ctx.tint());
	if(type === 'msg') {
	  try {
	    msg = fwk.message.deserialize(body);
	    /** cookie & tint forwarding */
	    msg.setCookies(ctx.cookies());
            if(msg.tint())
              ctx.setTint(msg.tint());
            else
              msg.setTint(ctx.tint());
	  } catch (err) { ctx.error(err); }		     
	}
	else {
	  if(!ctx.finalized())
	    ctx.error(new Error('unknown or repetitive message to route'));			  
	}
      });
    
    ctx.multi().on(
      'end', 
      function() {
	if(msg) {
	  try {
	    ctx.log.out('msg: ' + msg.type() + ' ' + msg + ' ' + msg.tint());	    
	    if(my.access.isgranted(ctx, msg)) {
	      /** route 1w, 2w, c, r */
	      if (msg.type() === '1w' || msg.type() === '2w' ||
		  msg.type() === 'c' || msg.type() === 'r') {		
		my.router.route(c, msg);

		/* in case this is a streamed msg
		 * we simply ack */
		if(stream) {
		  var ackmsg = fwk.message.ack(msg);
		  var body = JSON.stringify(ackmsg.body());
		  var headers = ackmsg.headers();
		  headers['Content-Type'] = "text/plain; charset=utf8";
		  ctx.response().writeHead(200, headers);
		  ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
		  ctx.multi().send('body', body);
		  
		  ctx.response().end();
		  ctx.finalize();	 	
		}
	      }
	      else {
		if(!ctx.finalized())
		  ctx.error(new Error('invalid message type to route: ' + msg.type()));		
	      }
	    }
	    else
	      unauthorized(ctx);
	  } catch (err) { ctx.error(err); }		     
	}
	else {
	  ctx.error(new Error('No valid msg received'));
	}
      });
  };
  
  stream = function(ctx, query) {
    var c, first = true;
    ctx.request().connection.setTimeout(0);

    if(!query || !query.key) {
      //create and reply
      c = my.pool.create();
      ctx.response().writeHead(200, {'Content-Type': 'text/plain; charset=utf8'});
      ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
      ctx.multi().send('key', key);
      first = false;
    }
    else {      
      c = my.pool.get(query.key);
      if(!c) {
	if(!ctx.finalized())
	  ctx.error(new Error('pool: unknown client ' + query.key));
	return;
      }
    }
        
    //ctx.log.debug('query: ' + util.inspect(query));
    
    c.connect(ctx, function(reply) {
		if(fisrt) {
		  // first reply only set headers
		  var headers = reply.headers();
		  headers['Content-Type'] = "text/plain; charset=utf8";
		  ctx.response().writeHead(200, headers);
		  ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
		  first = false;
		}
		var body = JSON.stringify(reply.body());
		ctx.multi().send('body', body);
		ctx.request().connection.setTimeout(0);
	      });
    // 2w, c timeouts are handled by pool clients timeouts
    // (ctx kept in memory the whole duration but that's ok)
    c.on('finalize', function() {
	   if(!ctx.finalized())
	     ctx.error(new Error('pool: client finalize ' + c.key()));
	 });
   
    ctx.request().on("data", function(chunk) { /* ingored */ });
    ctx.request().on("end", function() { /* nothing to do */ });
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

