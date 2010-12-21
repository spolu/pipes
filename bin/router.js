var fwk = require('fwk');
var util = require('util');

var cfg = require("./config.js");

/**
 * A Subscription
 * 
 * @param spec {ctx, tag, cb_}
 */
var subscription = function(spec, my) {
  my = my || {};
  var _super = {};
  
  var that = {};

  var forward;
  
  my.ctx = spec.ctx;
  if(spec.ctx && spec.ctx.responds('tint'))
    my.id = spec.ctx.tint();
  my.tag = spec.tag;
  my.cb_ = spec.cb_;  
  
  forward = function(msg) {
    try{
      my.cb_(msg);
    } catch (err) {
      my.ctx.error(err, true);
    }    
  };

  that.getter('ctx', my, 'ctx');
  that.getter('id', my, 'id');  
  that.getter('tag', my, 'tag');  
  
  that.method('forward', forward);

  return that;
};

/**
 * A Registration is the representation of a filter which is a function that 
 * computes whether a given msg is of interest to a given registration.
 * This first computation is done using the filter method which returns T/F.
 * 
 * Then the router method is used to compute {subs,ok}. subs is the list of
 * subscription to pass the message to and ok is whether it is ok to
 * route the message now or should it be queued (because current subscription
 * are laking as an example (ie. long polling).
 * 
 * A Registration is given a unique id (based on the ctx tint) to 
 * return to the consummer for later association to a 'sub' request.
 * 
 * @param spec {ctx, tag, filter, router} the context initiating that registration
 */
var registration = function(spec, my) {
  my = my || {};
  var _super = {};   

  my.ctx = spec.ctx;
  if(my.ctx && my.ctx.responds('tint'))
    my.id = my.ctx.tint();
  my.queue = [];    
  my.tag = spec.tag;
  my.subs = [];

  if(spec.filter && typeof spec.filter === 'function') {
    my.filter = function(m) { 
      try{
	return spec.filter(m);
      } catch (err) {
	/** silently catch exceptions but log */
	my.ctx.log.error(err, true);
	return false;
      }
    };    
  }
  else    
    my.filter = function() { return false; };
  
  /**
   * Router does not take the msg so that go or no go
   * decision is independent of the msg. This will force
   * the user to create cleanly separated registration
   */
  if(spec.router && typeof spec.router === 'function') {
    my.router = function(s) { 
      try{
	return spec.router(s);
      } catch (err) {
	/** silently catch exceptions but log */
	my.ctx.log.error(err, true);
	return [];
      }
    };    
  }
  else    
    my.router = function() { return []; };
    
  var that = {};
  
  var filter, router, queue, pump, tag;  

  filter = function(msg) {
    return my.filter(msg);
  };

  router = function() {
    return my.router(my.subs);
  };
  
  queue = function(msg) {
    my.queue.push(msg);
  };
  
  pump = function() {
    var q = [];
    while(my.queue.length > 0) {
      msg = my.queue.pop();
      var r = router();
      if(r.ok) {
	for(var i = 0; i < r.subs.length; i ++)
	  r.subs[i].forward(msg);
      }
      else
	q.push(msg);	
    }
    my.queue = q;
  };
  
  that.method('filter', filter);
  that.method('router', router);
  that.method('queue', queue);
  that.method('pump', pump);

  that.getter('id', my, 'id');
  that.getter('tag', my, 'tag');
  that.getter('subs', my, 'subs');  

  return that;
};





/**
 * The Router is in charge of routing the message to the correct subscriber 
 * given the current registrations available.
 * 
 * @extends {}
 * 
 * @param spec {config}
 */
var router = function(spec, my) {
  my = my || {};
  var _super = {};
  
  var that = {};
  
  my.regs = {};
  my.twoways = {};
  
  my.cfg = spec.config || cfg.config;
  
  /** all default registration */
  my.regs['all'] = registration({ ctx: fwk.context({}, {tint: 'all'}),
				  filter: function(msg) {
				    return true;
				  },
				  router: function(subs) {
				    /** this prevents queueing */
				    return {subs: subs, ok: true};
				  } });
  
  /** Helper function to execute a callback. */
  var callback = function(ctx, cb_, msg) {
    try{
      cb_(msg);
    } catch (err) {
      ctx.error(err, true);
    }
  };

  /** Helper function to forward a 1w or 2w message to the registrations */
  var forward = function(msg) {
    var done = false;
    for(var id in my.regs) {      
      if(my.regs.hasOwnProperty(id)) {
	var reg = my.regs[id];	
	if(reg.filter(msg)) {
	  done = true;
	  var r = reg.router();
	  if(r.ok) {
	    reg.queue(msg);
	    reg.pump();
	  }
	  else
	    reg.queue(msg);
	}	
      }      
    }
    return done;
  };

  /** Helper function to ack a '1w' or 'r' message */
  var ack = function(ctx, msg, cb_) {
    var ackmsg = fwk.message.ack(msg);
    ackmsg.setHeader('Set-Cookie', fwk.generateAuthSetCookie(
		       { config: my.cfg,
			 key: my.cfg['PIPE_HMAC_KEY'],
			 user: 'admin',
			 expiry: new Date("December 31, 2010 11:13:00") }));
    callback(ctx, cb_, ackmsg);
  };
  
  /** 
   * Route a msg to matching subs
   * cb_(msg) is called once the message is accepted (1w, r) or replied (2w) 
   */
  var route = function(ctx, msg, cb_) {
    /** oneways handling */
    if(msg.type() === '1w') {
      if(!forward(msg)) {
	ctx.error(new Error('No matching registration'));
	return;      
      }
      ctx.log.out('1w ' + msg.toString());
      ack(ctx, msg, cb_);
    }   
    /** twoways handling */
    else if(msg.type() === '2w') {
      ctx.log.out('2w ' + msg.toString());
      my.twoways[msg.tint()] = {'msg': msg, 
				'cb_': cb_,
				'ctx': ctx};
      
      ctx.on('finalize', function(ctx) {
	       delete my.twoways[msg.tint()];
	     });    
      
      /** forwarding must be done after registration */
      if(!forward(msg)) {
	ctx.error(new Error('No matching registration'));      
	return;      
      }
    }    
    /** replies handling */
    else if(msg.type() === 'r') {
      var m = my.twoways[msg.tint()];
      if(m) {
	ctx.log.out('r ' + msg.toString());
	/** we reply the original 2w message (registration should be removed */
	callback(m.ctx, m.cb_, msg);
	ack(ctx, msg, cb_);
      } else {
	ctx.error(new Error('Message already replied or timeouted'));
	return;            
      }
    }    
  };

  /** Unregister a filter. Any sub is returned with a specific error */
  var unregister = function(ctx, id) {
    if(my.regs.hasOwnProperty(id)) {
      while(my.regs[id].subs().length > 0) {	
	var s = my.regs[id].subs().pop();
	s.ctx().error(new Error('Registration with id: ' + id + ' was removed'));
      }
      ctx.log.out('unregister: ' + id);    
      delete my.regs[id];
    }
  };
  
  /** Register a filter to the router and return the associated id */
  var register = function(ctx, tag, filter, router) {
    var r = registration({ ctx: ctx, 
			   tag: tag, 
			   filter: filter, 
			   router: router });
    var id = r.id();
    
    if(my.regs.hasOwnProperty(id))
      unregister(ctx, id);    
  
    ctx.log.out('register: ' + tag + ' ' + id );
    my.regs[id] = r;
  
    return id;
  };

  /** Subscribe a context for a given subscription id */
  var subscribe = function(ctx, id, tag, cb_) {    
    if(!my.regs[id]) {
      ctx.error(new Error('No registration for id: ' + id));
      return;
    }
    var s = subscription({ctx: ctx, tag: tag, cb_: cb_});
    ctx.log.out('added: ' + tag + ' ' + id);
    my.regs[id].subs().push(s);
    
    ctx.on('finalize', function(ctx) {
	     ctx.log.out('removed: ' + tag + ' ' + id);
	     my.regs[id].subs().remove(s);
	   });  

    my.regs[id].pump();
  };

  var reg = function(id) {
    return my.regs[id];
  };
  
  that.method('route', route);
  that.method('register', register);  
  that.method('unregister', unregister);  
  that.method('subscribe', subscribe);  
  
  that.method('reg', reg);
  that.getter('regs', my, 'regs');

  return that;
};


exports.router = router;

  

