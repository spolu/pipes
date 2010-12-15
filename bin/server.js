var net = require('net');
var http = require('http');
var url = require('url');
var util = require('util');
var fwk = require('fwk');

var cfg = require("./config.js");
var context = require("./context.js");

/** Routing and Handling of requests */
function RouteHandler(access) {
  if(!(this instanceof RouteHandler)) return new RouteHandler();
  this.router = require("./router.js").router();
  this.access = access;
}

/** Route Handling */
RouteHandler.prototype.process = function(ctx) {
  ctx.request().setEncoding('utf8');
  urlRequest = url.parse(ctx.request().url, true);      
  ctx.push('cmd:' + urlRequest.pathname.substring(1));
  
  /**
    for(var i in ctx.cookies) {
      if(ctx.cookies.hasOwnProperty(i))
        ctx.log.out('COOKIE: ' + i + '=' + ctx.cookies[i]);
    }
   */
  
  ctx.authenticate(cfg.config['PIPE_HMAC_KEY']);
  if(ctx.auth().authenticated)
    ctx.push('user:' + ctx.auth().username);
  else
    ctx.push('user:none');

  switch(urlRequest.pathname) {
    
    /** PUBLIC FUNCTIONS */    

    /** message 1-way/2-way */
  case '/msg':    
    this.message(ctx, urlRequest.query);
    break;    
    
    /** ADMIN FUNCTIONS */
    
    /** subscriber registrations */
  case '/reg':
    if(ctx.auth().username === cfg.config['PIPE_ADMIN_USER'] &&
       ctx.auth().authenticated)
      this.register(ctx, urlRequest.query);
    else this.unAuthorized(ctx);
    break;
  case '/unr':
    if(ctx.auth().username === cfg.config['PIPE_ADMIN_USER'] &&
       ctx.auth().authenticated)
      this.unregister(ctx, urlRequest.query);
    else this.unAuthorized(ctx);
    break;

    /** subscription */
  case '/sub':
    if(ctx.auth().username === cfg.config['PIPE_ADMIN_USER'] &&
       ctx.auth().authenticated)
      this.subscribe(ctx, urlRequest.query);
    else this.unAuthorized(ctx);
    break;

  default:
    this.notFound(ctx);
  }
};


/**
 * Error handling
 */

RouteHandler.prototype.replyError = function (ctx, code, reason) {  
  ctx.push('replyError');
  var data = code + ' {' + ctx.tint() + '} [' + reason + ']: '  + unescape(ctx.request().url);
  /** ctx.log.err(data); */
  ctx.response().writeHead(code, {'Content-Length': data.length,
				  'Content-Type': "text/html;"});
  ctx.response().write(data);
  ctx.response().end();  
  ctx.pop();
  ctx.finalize();
};


/** replies 404 for unknown routes */
RouteHandler.prototype.notFound = function(ctx) {
  this.replyError(ctx, 404, 'Not Found');
};

/** replies 403 for forbidden access */
RouteHandler.prototype.unAuthorized = function(ctx) {
  this.replyError(ctx, 403, 'Forbidden');
};

/** general error handling */
RouteHandler.prototype.error = function(err, ctx) {
  this.replyError(ctx, 500, err.message);
};

/**
 * Handlers methods
 */

/** 
 * handle messages
 * /msg?msg={"type":_TYPE, "subject":_SUBJECT, "targets":[_TARGET,...], "body":_BODY} 
 */
RouteHandler.prototype.message = function(ctx, query) {
  var that = this;  
  ctx.on('error', this.error.bind(this));  
  var msg;
  
  ctx.request().on("data", function(chunk) { ctx.multi().recv(chunk); });
  ctx.request().on("end", function() { ctx.multi().end(); });
  
  ctx.multi().on('recv', function(type, body) {
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

  ctx.multi().on('end', function() {
		   if(msg) {
		     try {
		       that.access(ctx, msg, function(auth) {
				     if(auth) {
				       that.router.route(ctx, msg, function(reply) {
							   var body = JSON.stringify(reply.body());
							   var headers = reply.headers();
							   headers['Content-Type'] = "text/plain;";
							   ctx.response().writeHead(200, headers);
							   ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
							   ctx.multi().send('body', body);
							   ctx.response().end();
							   ctx.finalize();	 
							 });
				       /** TODO add timeout */
				     }
				     else
				       that.unAuthorized(ctx);
				   });		       
		     } catch (err) { ctx.error(err, true); }
		   } 
		   else 
		     ctx.error(new Error('No msg specified'));
		 });
};

/** 
 * register a new filter 
 * /reg BODY: code for filter
 */
RouteHandler.prototype.register = function(ctx, query) {  
  var that = this;
  ctx.on('error', this.error.bind(this));
  
  var filter, router;  
  
  ctx.request().on("data", function(chunk) { ctx.multi().recv(chunk); });
  ctx.request().on("end", function() { ctx.multi().end(); });
  
  ctx.multi().on('recv', function(type, body) {
		   if(type === 'filter')
		     filter = body;
		   if(type === 'router')
		     router = body;
		 });

  ctx.multi().on('end', function() {
		   try {
		     if(filter && router) {
		       eval("var filterfun = " + filter);
		       eval("var routerfun = " + router);
		       
		       if(typeof filterfun === 'function' &&
			  typeof routerfun === 'function') {
			 var id = that.router.register(ctx, filterfun, routerfun);
			 			 
			 ctx.response().writeHead(200, {'Content-Type': 'text/plain;'});
			 ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
			 ctx.multi().send('id', id);
			 ctx.response().end();
			 ctx.finalize();	 
			 return;
		       }		     
		     }
		     ctx.error(new Error('Filter or router not a function'));		   		     
		   } catch (err) { ctx.error(err, true); }
		 });
};


RouteHandler.prototype.unregister = function(ctx, query) {
  var that = this;
  ctx.on('error', this.error.bind(this));  
  
  if(query && query.id) {
    try {
      var id = query.id;
      this.router.unregister(ctx, id);

      ctx.response().writeHead(200, {'Content-Type': 'text/plain;'});
      ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
      ctx.multi().send('done');
      ctx.response().end();
      ctx.finalize();	 
      return;
    } catch (err) { ctx.error(err, true); }          
  } 
  else
    ctx.error(new Error('No id specified'));
};


RouteHandler.prototype.subscribe = function(ctx, query) {
  var that = this;
  ctx.on('error', this.error.bind(this));  

  if(query && query.id && query.tag) {
    try {
      var id = query.id;
      var tag = query.tag;      
      var first = true;
      this.router.subscribe(ctx, id, tag, function(msg) {		
			      if(first) {
				ctx.response().writeHead(200, {'Content-Type': 'text/plain;'});
				ctx.multi().on('chunk', function(chunk) { ctx.response().write(chunk); });
				first = false;
			      }
			      ctx.multi().send('msg', msg.serialize());
			    });      
      /** TODO add timeout */
    } catch (err) { ctx.error(err, true); }
  } else
    ctx.error(new Error('No id specified'));    
};





/**
 * Piped object
 */

function Piped(access) {
  if(!(this instanceof Piped)) return new Piped(access);
  http.Server.call(this);    
  
  this.logger = fwk.logger();  
  this.handler = new RouteHandler(access);  
    
  fwk.populateConfig(cfg.config);

  this.addListener("request", function(request, response) { 
		     var ctx = context.context({request: request,
						response: response,
						logger: this.logger,
						config: cfg.config});
		     this.handler.process(ctx);
		   }.bind(this));
}
util.inherits(Piped, http.Server);

exports.Piped = Piped;

exports.createPiped = function(access) {
  return new Piped(access);
};