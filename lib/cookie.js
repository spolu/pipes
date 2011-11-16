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

var util = require('util');
var events = require('events');
var crypto = require('crypto');

var base = require("./base.js");
var config = require("./config.js");

/**
 * cookie.js
 * 
 * A set of functions used to handle cluster-wide cookie based authentication
 * All fonctions expect a key that should be the same cluster-wide and kept
 * secret on the server side. See context.js and pipes.js to see how messages
 * are authenticated.
 * 
 * Example Generation of a Auth Cookie:
 * =========================================================================
 *     var cookie = fwk.generateAuthSetCookie({ user: uid ,
 *                                              expiry: '0',
 *                                              domain: '.teleportd.com',
 *                                              key: clusterkey() });
 *
 *      cont_({ object: my.object,
 *              result: { status: 'OK',
 *               user: uid,
 *               target: my.target },
 *               headers: { 'Set-Cookie': cookie } 
 *            });        
 * ==========================================================================
 */

 /**
 * Generates a authentication cookie for user and expiry
 * @param spec {config, alg, key, user, expiry, path, domain, name} 
 */
var generateAuthCookie = function(spec, my) {
  var my = my || {};

  my.cfg = spec.config || config.baseConfig();
  my.alg = spec.alg || my.cfg['HMAC_ALGO'];
  my.key = spec.key || 'INSECURE';
  my.user = spec.user || 'NO_USER';
  my.expiry = (typeof(spec.expiry) === 'undefined') ? new Date() : spec.expiry;
  my.path = spec.path || '/';
  my.domain = spec.domain || my.cfg['AUTH_COOKIE_DOMAIN'];  
  my.name = spec.name || 'auth';

  var hmac = crypto.createHmac(my.alg, my.key); 
  var str = my.user + "-" + my.expiry;
  hmac.update(str);
  
  var cookie = my.name + "=" + str + "-" + hmac.digest(encoding='hex');
  return cookie;  
};

exports.generateAuthCookie = generateAuthCookie;

/**
 * Generates an authentified Set-Cookie header
 * @param spec {config, alg, key, user, expiry, path, domain, name} 
 */
var generateAuthSetCookie = function(spec) {
  var my = my || {};
  
  var cookie = generateAuthCookie(spec, my);
    
  var d = new Date(); d.setTime(my.expiry);
  var dstr = (my.expiry === '0' || my.expiry === 0) ? '0' : d.toString(); 

  return cookie +
    ((my.expiry && my.expiry !== '0' && my.expiry !== 0)? ("; Expires= " + dstr) : "") +
    "; path= " + my.path +
    "; domain= " + my.domain;
};

exports.generateAuthSetCookie = generateAuthSetCookie;

/**
 * Authenticate a Cookie as received and returs a auth object
 * @param spec {cookie, config, alg, key} 
 * @return auth an object representing the resulting authentication
 */
var authenticateCookie = function(spec) {
  var my = my || {};
    
  my.cfg = spec.config || config.baseConfig();
  my.alg = spec.alg || my.cfg['HMAC_ALGO'];
  my.key = spec.key || 'INSECURE';

  my.auth = {'user': 'none',
	     'expiry': new Date().getTime(),
	     'expired': true,
	     'authenticated': false};

  if(!spec.cookie)
    return auth;
  
  my.cookie = spec.cookie;
  
  var comp = my.cookie.split("-");
  
  if(comp.length == 3) {
    my.auth['user'] = comp[0];
    my.auth['expiry'] = comp[1];
    
    var expired = (comp[1] === '0') ? false : parseInt(comp[1], 10) < (new Date()).getTime();
    var hmac = crypto.createHmac(my.alg, my.key); 
    hmac.update(comp[0] + "-" + comp[1]);
    var digest = hmac.digest(encoding='hex');

    var authenticated =  digest === comp[2];
	
/*    
    console.log('expired: ' + expired);
    console.log('authenticated: ' + authenticated);
    console.log('comp[0]: ' + comp[0]);
    console.log('comp[1]: ' + comp[1]);
    console.log('comp[2]: ' + comp[2]);
    console.log('digest: ' + digest);
*/
	
    if(!expired && authenticated) {
      my.auth['expired'] = expired;
      my.auth['authenticated'] = authenticated;
    }        
  }
  
  return my.auth;
};

exports.authenticateCookie = authenticateCookie;