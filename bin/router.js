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
    
  my.ctx = spec.ctx;
  if(spec.ctx && spec.ctx.responds('tint'))
    my.id = spec.ctx.tint();
  my.tag = spec.tag;
  my.cb_ = spec.cb_;  
  
  my.count = 0;
  
  var that = {};

  var forward, describe;
  
  forward = function(msg) {
    try{
      my.count++;
      my.cb_(msg);
    } catch (err) {
      my.ctx.error(err, true);
    }    
  };
  
  describe = function() {
    return { id: my.id,
	     tag: my.tag,
	     count: my.count };
  };

  that.getter('ctx', my, 'ctx');
  that.getter('id', my, 'id');  
  that.getter('tag', my, 'tag');  
  
  that.method('forward', forward);
  that.method('describe', describe);

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
  my.count = 0;  

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
    my.filterdata = spec.filter.toString();
  }
  else    
    my.filter = function() { return false; };
  
  /**
   * Router should not take the msg so that go or no go
   * decision is independent of the msg. This forces
   * the user to create cleanly separated registration
   * 
   * As an undocumented interface we passe the msg anyway
   * to support config message routing according to
   * the subscription tag. router function is called multiple
   * time per message!
   */
  if(spec.router && typeof spec.router === 'function') {
    my.router = function(s, m) { 
      try{
	return spec.router(s, m);
      } catch (err) {
	/** silently catch exceptions but log */
	my.ctx.log.error(err, true);
	return [];
      }
    };    
    my.routerdata = spec.router.toString();
  }
  else    
    my.router = function() { return []; };
    
  var that = {};
  
  var filter, router, queue, pump, tag, describe;  

  filter = function(msg) {
    return my.filter(msg);
  };

  router = function(msg) {
    return my.router(my.subs, msg);
  };
  
  queue = function(ctx, msg) {    
    my.count++;
    my.queue.push(msg);
    if(msg.type() === '2w' || msg.type() === '2w-c') {
      ctx.on('finalize', function(ctx) {
	       my.queue.remove(msg);
	     });     
    }
  };
  
  pump = function() {
    var q = [];
    while(my.queue.length > 0) {
      msg = my.queue.shift();
      var r = router(msg);
      if(r.ok) {
	for(var i = 0; i < r.subs.length; i ++)
	  r.subs[i].forward(msg);	  
      }
      else
	q.push(msg);	
    }
    my.queue = q;
  };
  
  describe = function() {
    var data = { id: my.id,
		 tag: my.tag,
		 filter: my.filterdata,
		 router: my.routerdata,
		 size: my.queue.length,
		 count: my.count };
    data.subs = [];
    my.subs.forEach(function(sub) {
		      data.subs.push(sub.describe());
		    });	     
    return data;
  };

  that.method('filter', filter);
  that.method('router', router);
  that.method('queue', queue);
  that.method('pump', pump);
  that.method('describe', describe);

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
    
  my.regs = {};
  my.twoways = {};
  
  my.cfg = spec.config || cfg.config;
  
  /** all default registration */
  my.regs['all'] = registration({ ctx: fwk.context({}, {tint: 'all'}),
				  filter: function(msg) {
				    return true;
				  },
				  router: function(subs) {
				    /** prevents queueing */
				    return {subs: subs, ok: true};
				  } });
  
  /** config default registration */
  my.regs['config'] = registration({ ctx: fwk.context({}, {tint: 'config'}),
				     filter: function(msg) {
				       return (msg.type() === '1w-c' ||
					       msg.type() === '2w-c');
				     },
				     router: function(subs, msg) {
				       var res = [];
				       for(var i = 0; i < subs.length; ++i) {
					 for(var j = 0; j < msg.targets().length; ++j) {
					   if(subs[i].tag() === msg.targets()[j]) {
					     res.push(subs[i]);
					     break;
					   }
					 }
				       }
				       /** prevents queueing */
				       return {subs: res, ok: true };
				     } });
  
  var that = {};

  var callback, forward, ack, route; 
  var register, unregister, subscribe, list;
  var shutdown;

  /** Helper function to execute a callback. */
  callback = function(ctx, cb_, msg) {
    try{
      cb_(msg);
    } catch (err) {
      ctx.error(err, true);
    }
  };

  /** Helper function to forward a 1w,1w-c,r or 2w,2w-c message to the registrations */
  forward = function(ctx, msg) {
    var done = false;
    for(var id in my.regs) {      
      if(my.regs.hasOwnProperty(id)) {
	var reg = my.regs[id];	
	if(reg.filter(msg)) {
	  done = true;
	  var r = reg.router(msg);
	  if(r.ok) {
	    reg.queue(ctx, msg);
	    reg.pump();
	  }
	  else
	    reg.queue(ctx, msg);
	}	
      }      
    }
    return done;
  };

  /** Helper function to ack a '1w', 'r' or 'c' messages */
  ack = function(ctx, msg, cb_) {
    var ackmsg = fwk.message.ack(msg);
    callback(ctx, cb_, ackmsg);
  };
  
  /** 
   * Route a msg to matching subs
   * cb_(msg) is called once the message is accepted (1w, r, c) or replied (2w, 2w-c) 
   */
  route = function(ctx, msg, cb_) {
    /** oneways handling */
    if(msg.type() === '1w') {
      if(!forward(ctx, msg)) {
	ctx.error(new Error('1w: no matching registration'));
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
      if(!forward(ctx, msg)) {
	ctx.error(new Error('2w: no matching registration'));      
	return;      
      }
    }
    
    /** replies handling */
    else if(msg.type() === 'r') {
      var m = my.twoways[msg.tint()];
      if(m) {
	ctx.log.out('r ' + msg.toString());
	/** we reply the original 2w message (registration should be removed) */
	callback(m.ctx, m.cb_, msg);
	ack(ctx, msg, cb_);
      } else {
	ctx.error(new Error('r: message already replied or timeouted'));
	return;            
      }
    }
    
    /** config oneways handling */
    else if(msg.type() === '1w-c') {
      if(!forward(ctx, msg)) {
	ctx.error(new Error('1w-c: no matching registration'));
	return;      
      }
      ctx.log.out('c ' + msg.toString());
      ack(ctx, msg, cb_);
    }   
    
    /** config twoways handling */
    else if(msg.type() === '2w-c') {
      ctx.log.out('2w-c ' + msg.toString());
      my.twoways[msg.tint()] = {'msg': msg, 
				'cb_': cb_,
				'ctx': ctx};
      
      ctx.on('finalize', function(ctx) {
	       delete my.twoways[msg.tint()];
	     });    
      
      /** forwarding must be done after registration */
      if(!forward(ctx, msg)) {
	ctx.error(new Error('2w-c: no matching registration'));      
	return;      
      }
    }

    /** no matching type */
    else {
      ctx.error(new Error('unknown msg type: ' + msg.type()));
      return;            
    }
  };

  /** Unregister a filter. Any sub is returned with a specific error */
  unregister = function(ctx, id) {
    if(my.regs.hasOwnProperty(id)) {
      while(my.regs[id].subs().length > 0) {	
	var s = my.regs[id].subs().pop();
	s.ctx().error(new Error('unregister: ' + id));
      }
      ctx.log.out('unregister: ' + id);    
      delete my.regs[id];
    }
  };
  
  /** Register a filter to the router and return the associated id */
  register = function(ctx, tag, filter, router) {
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
  subscribe = function(ctx, id, tag, cb_) {    
    if(!my.regs[id]) {
      ctx.error(new Error('subscribe: ' + id + ' unknown'));
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

  list = function(id) {
    var data = {};
    for(var i in my.regs) {
      if(my.regs.hasOwnProperty(i) && (!id || id === i))
	data[i] = my.regs[i].describe();
    }
    return data;
  };
  
  shutdown = function(ctx) {
    for(var i in my.regs) {
      if(my.regs.hasOwnProperty(i))
	unregister(ctx, i);
    }    
    for(var j in my.twoways) {
      if(my.twoways.hasOwnProperty(j)) {
	if(!my.twoways[j].ctx.finalized())
	  my.twoways[j].ctx.error(new Error('pipe shutdown'));
      }
    }
  };

  
  that.method('route', route);
  that.method('register', register);  
  that.method('unregister', unregister);  
  that.method('subscribe', subscribe);  
  that.method('list', list);
  that.method('shutdown', shutdown);
  
  return that;
};


exports.router = router;

  

