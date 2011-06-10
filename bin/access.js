var fwk = require('pipe');
var util = require('util');

var config = require("./config.js");

/**
 * An authorization is an object encapsulating a filter function that 
 * grant authorization to a given msg given its assoicated context.
 * 
 * @extends {}
 * 
 * @param spec {ctx, tag, filter}
 */
var authorization = function(spec, my) {
  my = my || {};
  var _super = {};   

  my.ctx = spec.ctx;
  if(my.ctx && my.ctx.responds('tint'))
    my.id = my.ctx.tint();
  my.tag = spec.tag;
  
  if(spec.filter && typeof spec.filter === 'function') {
    my.filter = function(u, m) { 
      try{
	return spec.filter(u, m);
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
  
  var that = {};
  
  var filter, describe;  
  
  filter = function(user, msg) {
    return my.filter(user, msg);
  };
  
  describe = function() {
    return { id: my.id,
	     tag: my.tag,
	     filter: my.filterdata };
  };
  
  that.method('filter', filter);
  that.method('describe', describe);

  that.getter('id', my, 'id');
  that.getter('tag', my, 'tag');
  
  return that;
};

/**
 * The access object calculate wether a message is granted given
 * the grant functions it has been given.
 * 
 * @extends {}
 * 
 * @param spec {}
 */
var access = function(spec, my) {
  my = my || {};
  var _super = {};
  
  my.cfg = spec.config || cfg.config; 
  
  my.auths = {};

  var that = {};
  
  var grant, revoke, isgranted, list;
  
  grant = function(ctx, tag, filter) {
    var a = authorization({ ctx: ctx,
			    tag: tag,
			    filter: filter });
    var id = a.id();
    
    if(my.auths.hasOwnProperty(id))
      revoke(ctx, id);
    
    ctx.log.out('grant: ' + tag + ' ' + id);
    my.auths[id] = a;
    
    return id;
  };
  
  revoke = function(ctx, id) {
    if(my.auths.hasOwnProperty(id)) {
      ctx.log.out('revoke: ' + id);
      delete my.auths[id];
    }
  };

  isgranted = function(ctx, msg) {
    var auth = ctx.auth().authenticated;
    var user = ctx.auth().user;
    
    for(var i in my.auths) {
      if(my.auths.hasOwnProperty(i)) {
	if(auth && user) {
	  if(my.auths[i].filter(user, msg))
	    return true;	  	  
	}
	else {
	  if(my.auths[i].filter(undefined, msg))
	    return true;	  
	}
      }
    }
    /** finaly if not grant is granting, we refuse */
    return false;
  };
  
  
  list = function(id) {
    var data = {};
    for(var i in my.auths) {
      if(my.auths.hasOwnProperty(i) && (!id || id === i))
	data[i] = my.auths[i].describe();
    }
    return data;
  };


  that.method('grant', grant);
  that.method('revoke', revoke);
  that.method('list', list);

  that.method('isgranted', isgranted);

  that.getter('auths', my, 'auths');
  
  return that;
};

exports.access = access;