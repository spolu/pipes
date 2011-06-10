var crypto = require('crypto');

/** Used for functional inheritance */
Object.prototype.method = function(name, method, _super) {
  var that = this;
  if(_super) {
    var m = that[name];
    _super[name] = function() {
      return m.apply(that, arguments);
    };    
  }
  this[name] = method;
};

Object.prototype.getter = function(name, obj, prop) {
  var that = this;
  var getter = function() {
    return obj[prop];
  };
  that[name] = getter;
};

Object.prototype.setter = function(name, obj, prop) {
  var that = this;
  var setter = function (arg) {
    obj[prop] = arg;
    return that;
  };  
  that['set' + name.substring(0, 1).toUpperCase() + name.substring(1)] = setter;
};

Object.prototype.responds = function(name) {
  return (this[name] && typeof this[name] === 'function');
};

Function.prototype.once = function() {
  var fn = this;
  var done = false;
  return function() {    
    if(!done) {
      args = Array.prototype.slice.call(arguments);
      done = true;
      fn.apply(null, args);
    }
  };
};

/** The .bind method from Prototype.js */
Function.prototype.bind = function() {
  var fn = this, 
  args = Array.prototype.slice.call(arguments), 
  object = args.shift(); 
  return function(){    
    return fn.apply(
      object, 
      args.concat(Array.prototype.slice.call(arguments))
    ); 
  };
};

Array.prototype.remove = function(e) {
  for(var i = 0; i < this.length; i++)
    if(e === this[i]) this.splice(i, 1);
};

Object.prototype.shallow = function() {
  if(this == null || typeof(this) != 'object')
    return this;		
  var temp = new this.constructor();
  for(var key in this) {
    if(this.hasOwnProperty(key))
      temp[key] = this[key];		  
  }
  return temp;  
};

Object.prototype.clone = function() {
  if(this == null || typeof(this) != 'object')
    return this;  
  var temp = new this.constructor();
  for(var key in this) {
    if(this.hasOwnProperty(key))
      temp[key] = clone(this[key]);  		  
  }
  return temp;
};

Object.prototype.makehash = function() {
  var hash = crypto.createHash('sha1');
  for(var i in this) {		  
    if(i.charAt(0) !== '_' && this.hasOwnProperty(i)) {
	var str = JSON.stringify(this[i]);
	if(str)
	    hash.update(str);	
    }
  }
  /** add args to update */
  for(var j = 0; j < arguments.length; j++)		  
    hash.update(arguments[j]);
  return hash.digest(encoding='hex');
};

Object.prototype.forEach = function(fun /*, thisp */) {
  "use strict";
 
  if(this === void 0 || this === null)
    throw new TypeError();

  var t = Object(this);

  if(typeof fun !== "function")
    throw new TypeError();
  
  var thisp = arguments[1];
  for(var i in t) {
    if(t.hasOwnProperty(i)) {
      fun.call(thisp, t[i], i, t);
    }
  }  
};

String.prototype.trim = function() {
  return this.replace(/^\s+|\s+$/g,"");
};
String.prototype.ltrim = function() {
  return this.replace(/^\s+/,"");
};
String.prototype.rtrim = function() {
  return this.replace(/\s+$/,"");
};
