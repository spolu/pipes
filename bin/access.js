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
  if(my.ctx && fwk.responds(my.ctx, 'tint'))
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
  
  fwk.method(that, 'filter', filter);
  fwk.method(that, 'describe', describe);

  fwk.getter(that, 'id', my, 'id');
  fwk.getter(that, 'tag', my, 'tag');
  
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


  fwk.method(that, 'grant', grant);
  fwk.method(that, 'revoke', revoke);
  fwk.method(that, 'list', list);

  fwk.method(that, 'isgranted', isgranted);

  fwk.getter(that, 'auths', my, 'auths');
  
  return that;
};

exports.access = access;