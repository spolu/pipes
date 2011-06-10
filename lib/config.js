var util = require('util');
var base = require("./base.js");

var parse_arg = /^--([0-9A-Z_]+)=(.+)$/;

/** populate a default config object using arguments and env variables */
exports.populateConfig = function(config) {  
  process.argv.forEach(function(val, index, array) {
			 var result = parse_arg.exec(val);
			 if(result) {
			   /** we use != here since we might have numerical / string conversion */
			   if(config.hasOwnProperty(result[1]) && 
			      config[result[1]] != result[2]) {
			     util.debug('config(arg): ' + result[1] + '=' + config[result[1]] + ' -> ' + result[1] + '=' + result[2]);
			     config[result[1]] = result[2];
			   }			   
			 }			   
		       });
  var env = process.env;
  for(var i in env) {
    if(config.hasOwnProperty(i) && 
       config[i] != process.env[i]) {
      util.debug('config(env): ' + i + '=' + config[i] + ' -> ' + i + '=' + process.env[i]);
      config[i] = process.env[i];
    }	       
  }
};

exports.extractArgvs = function() {
  var remaining = [];
  process.argv.forEach(function(val, index, array) {
			 var result = parse_arg.exec(val);
			 if(!result) {
			   remaining.push(val);
			 }			   
		       });
  return remaining;  
};

/** pipe lib base config */

var config = {
  'DEBUG': false,
  'TINT_NAME': '',
  'LOGGER_HDR_LEN': 40,
  'HMAC_ALGO': 'sha512',
  'MULTI_CHUNK_MAX_SIZE': 1024,
  'AUTH_COOKIE_DOMAIN': '127.0.0.1'  
};

exports.baseConfig = function() {
  return config.shallow();
};