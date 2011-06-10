var fwk = require('fwk');
var util = require('util');
var events = require('events');
var crypto = require('crypto');

var cfg = require("./config.js");

/**
 * A Client
 * 
 * @extends events.EventEmitter
 * 
 * @param spec {key}
 */
var client = function(spec, my) {
  my = my || {};
  var _super = {};
  
  my.key = spec.key;
  my.queue = [];
  my.count = 0;
  my.finalized = false;
  my.last = new Date;

  var that = new events.EventEmitter(); 

  var connect, connected, error;
  var pump, queue, finalize, finalized;

  util.debug('new client: ' + my.key);

  connect = function(ctx, cb_) {
    if(my.con && my.con.ctx) {
      my.con.ctx.error(new Error('pool: connection conflict ' + my.key));
      delete my.con;
    }

    my.con = { ctx: ctx,
	       cb_: cb_ };
    ctx.on('finalize', function(ctx) {
	     if(my.con.ctx === ctx) {
	       delete my.con;
	     }
	   });    
    
    pump();
  };
  
  connected = function() {
    if(typeof my.con !== 'undefined' && my.con.ctx &&
       !my.con.ctx.finalized()) {
      my.last = new Date;      
      return true;
    }
    return false;
  };
  
  error = function(e) {
    if(connected()) {
      my.con.ctx.error(e);
    }
    //finalize();
  };

  pump = function() {
    if(connected() && !my.busy) {
      while(my.queue.length > 0) {
	msg = my.queue.shift();
	my.con.cb_(msg);		
      }
    }    
  };

  queue = function(reply) {
    my.count++;
    my.queue.push(reply);    
    pump();
  };

  finalize = function() {
    if(!my.finalized) {
      pump();
      my.queue = [];
      util.debug('client finalize ' + my.key);
      that.emit('finalize', that);
      my.finalized = true;
    }      
  };

  finalized = function() {
    return my.finalized;
  };

  that.method('connect', connect);
  that.method('connected', connected);
  that.method('error', error);
  that.method('queue', queue);
  that.method('finalize', finalize);
  that.method('finalized', finalized);

  that.getter('key', my, 'key');
  that.getter('last', my, 'last');

  return that;
};


/**
 * The Pool is in charge of keeping track of clients as well
 * as allocating new one with crypto key
 * 
 * @extends {}
 * 
 * @param spec {config, key} 
 */
var pool = function(spec, my) {  
  my = my || {};
  var _super = {};
    
  my.clients = {};
  my.nextid = 0;

  my.cfg = spec.config || cfg.config;
  my.key = spec.key || 'INSECURE';

  var that = {};

  var init, check;
  var create, get, kill;


  create = function() {
    var seed = ++my.nextid + '-' + (new Date()).getTime();

    var hmac = crypto.createHmac('sha512', my.key);
    hmac.update(seed);
    var digest = hmac.digest(encoding='hex');

    var c = client({key: digest});
    my.clients[digest] = c;

    c.on('finalize', function(c) {
	   util.debug('DELETE FROM CLIENTS: ' + c.key());
	   delete my.clients[c.key()];
	 });    
    
    return c;
  };

  kill = function(key) {
    if(typeof my.clients[key] !== 'undefined') {
      my.clients[key].finalize();
    }
  };

  get = function(key) {
    return my.clients[key];
  };


  check = function() {
    var expired = [];
    my.clients.forEach(function(c) {
			 if(((new Date).getTime() - c.last()) > my.cfg['PIPE_TIMEOUT'])
			   expired.push(c);
		       });
    for(var i = 0; i < expired.length; i ++) {
      expired[i].finalize();
    }
  };
  
  my.timer = setInterval(check, my.cfg['PIPE_TIMEOUT']);
  
  that.method('create', create);
  that.method('kill', kill);
  that.method('get', get);

  return that;
};

exports.pool = pool;