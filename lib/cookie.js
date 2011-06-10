var util = require('util');
var events = require('events');
var crypto = require('crypto');

var base = require("./base.js");
var config = require("./config.js");

/**
 * Generates a authentication cookie for user and expiry
 * 
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
 * 
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
 * 
 * @param spec {cookie, config, alg, key} 
 * @return auth an object representing the resulting authentication
 */
var authenticateCookie = function(spec) {
  var my = my || {};
    
  my.cfg = spec.config || config.baseConfig();
  my.alg = spec.alg || my.cfg['HMAC_ALGO'];
  my.key = spec.key || 'INSECURE';

  my.auth = {'user': '',
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