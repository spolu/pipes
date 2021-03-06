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

var fwk = require('pipes');
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
  if(spec.ctx && fwk.responds(spec.ctx, 'tint'))
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

  fwk.getter(that, 'ctx', my, 'ctx');
  fwk.getter(that, 'id', my, 'id');  
  fwk.getter(that, 'tag', my, 'tag');  
  
  fwk.method(that, 'forward', forward);
  fwk.method(that, 'describe', describe);

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
 * @param spec {ctx, tag, filter, router, maxqueue} the context initiating that registration
 */
var registration = function(spec, my) {
  my = my || {};
  var _super = {};   

  my.maxqueue = spec.maxqueue | 1000;
  my.ctx = spec.ctx;
  if(my.ctx && fwk.responds(my.ctx, 'tint'))
    my.id = my.ctx.tint();
  my.queue = [];    
  my.tag = spec.tag;
  my.subs = [];
  my.count = 0;  
  my.drop = 0;

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
   * As an undocumented interface we pass the msg anyway
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
    if(msg.type() === '2w' || msg.type() === 'c') {
      ctx.on('finalize', function(ctx) {
	       my.queue.remove(msg);
	     });     
    }
    if(my.queue.length > my.maxqueue) {
      my.drop++;
      my.queue.shift();
    }
  };
  
  pump = function() {
    var q = [];
    while(my.queue.length > 0) {
      var msg = my.queue.shift();
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
		 count: my.count,
		 drop: my.drop };
    data.subs = [];
    my.subs.forEach(function(sub) {
		      data.subs.push(sub.describe());
		    });	     
    return data;
  };
  
  fwk.method(that, 'filter', filter);
  fwk.method(that, 'router', router);
  fwk.method(that, 'queue', queue);
  fwk.method(that, 'pump', pump);
  fwk.method(that, 'describe', describe);
  
  fwk.getter(that, 'id', my, 'id');
  fwk.getter(that, 'tag', my, 'tag');
  fwk.getter(that, 'subs', my, 'subs');  
  
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
				  },
				  maxqueue: my.cfg['PIPES_MAX_QUEUE'] });
  
  /** config default registration */
  my.regs['config'] = registration({ ctx: fwk.context({}, {tint: 'config'}),
				     filter: function(msg) {
				       return (msg.type() === 'c');
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
				     },
				     maxqueue: my.cfg['PIPES_MAX_QUEUE'] });
  
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

  /** Helper function to forward a 1w,r or 2w,c message to the registrations */
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
   * cb_(msg) is called once the message is accepted (1w, r) or replied (2w, c) 
   */
  route = function(ctx, msg, cb_) {
    //ctx.log.out(msg.type() + ' ' + msg.toString());

    /** oneways handling */
    if(msg.type() === '1w') {
      if(!forward(ctx, msg)) {
	ctx.error(new Error('1w: no matching registration'));
	return;      
      }
      ack(ctx, msg, cb_);
    }   
    
    /** twoways handling */
    else if(msg.type() === '2w' ||
	    msg.type() === 'c') {
      /** if there is no registration for the message target
       * it will timeout which is ok since volume is low */
      my.twoways[msg.tint()] = {'msg': msg, 
				'cb_': cb_,
				'ctx': ctx};
      
      ctx.on('finalize', function(ctx) {
	       delete my.twoways[msg.tint()];
	     });    
      
      /** forwarding must be done after registration */
      if(!forward(ctx, msg)) {
	ctx.error(new Error(msg.type() + ': no matching registration'));      
	return;      
      }
    }
    
    /** replies handling */
    else if(msg.type() === 'r') {
      var m = my.twoways[msg.tint()];
      if(m) {
	/** we reply the original 2w message (registration should be removed) */
	callback(m.ctx, m.cb_, msg);
	ack(ctx, msg, cb_);
      } else {
	ctx.error(new Error('r: message already replied or timeouted'));
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
			   router: router,
			   maxqueue: my.cfg['PIPES_MAX_QUEUE'] });
    var id = r.id();
    
    if(my.regs.hasOwnProperty(id))
      unregister(ctx, id);    
    
    ctx.log.out('register: ' + tag + ' ' + id );
    my.regs[id] = r;
    
    return id;
  };

  /** Subscribe a context for a given subscription id */
  subscribe = function(ctx, id, tag, cb_) {    
    var reg = null;
    if(my.regs[id]) {
      reg = my.regs[id];
    }
    else {
      for(var i in my.regs) {      
	if(my.regs.hasOwnProperty(i)) {
	  if(my.regs[i].tag() === id) {
	    reg = my.regs[i];
	    break;		      
	  }
	}
      }
    }
    if(!reg) {
      ctx.error(new Error('subscribe: ' + id + ' unknown'));
      return;
    }
    var s = subscription({ctx: ctx, tag: tag, cb_: cb_});
    ctx.log.out('added: ' + tag + ' ' + id);
    reg.subs().push(s);
    
    ctx.on('finalize', function(ctx) {
	     ctx.log.out('removed: ' + tag + ' ' + id);
	     reg.subs().remove(s);
	   });        
    reg.pump();
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
	  my.twoways[j].ctx.error(new Error('pipes shutdown'));
      }
    }
  };

  
  fwk.method(that, 'route', route);
  fwk.method(that, 'register', register);  
  fwk.method(that, 'unregister', unregister);  
  fwk.method(that, 'subscribe', subscribe);  
  fwk.method(that, 'list', list);
  fwk.method(that, 'shutdown', shutdown);
  
  return that;
};


exports.router = router;



