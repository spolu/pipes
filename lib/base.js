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

var crypto = require('crypto');

exports.method = function(that, name, method, _super) {
    if(_super) {
	var m = that[name];
	_super[name] = function() {
	    return m.apply(that, arguments);
	};    
    }
    that[name] = method;    
};


exports.getter = function(that, name, obj, prop) {
    var getter = function() {
	return obj[prop];
    };
    that[name] = getter;
};

exports.setter = function(that, name, obj, prop) {
    var setter = function (arg) {
	obj[prop] = arg;
	return that;
    };  
    that['set' + name.substring(0, 1).toUpperCase() + name.substring(1)] = setter;
};

exports.responds = function(that, name) {
    return (that[name] && typeof that[name] === 'function');
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

exports.shallow = function(that) {
    if(that == null || typeof(that) != 'object')
	return that;		
    var temp = new that.constructor();
    for(var key in that) {
	if(that.hasOwnProperty(key))
	    temp[key] = that[key];		  
    }
    return temp;  
};

exports.clone = function(that) {
    if(that == null || typeof(that) != 'object')
	return this;  
    var temp = new that.constructor();
    for(var key in that) {
	if(that.hasOwnProperty(key))
	    temp[key] = clone(that[key]);  		  
    }
    return temp;
};

exports.makehash = function(that) {
    var hash = crypto.createHash('sha1');
    for(var i in that) {		  
	if(i.charAt(0) !== '_' && that.hasOwnProperty(i)) {
	    var str = JSON.stringify(that[i]);
	    if(str)
		hash.update(str);	
	}
    }
    /** add args to update */
    for(var j = 1; j < arguments.length; j++)		  
	hash.update(arguments[j]);
    return hash.digest(encoding='hex');
};

exports.forEach = function(that, fun /*, thisp */) {
    "use strict";
    
    if(that === void 0 || that === null)
	throw new TypeError();

    var t = Object(that);
    
    if(typeof fun !== "function")
	throw new TypeError();
  
    var thisp = arguments[2];
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
