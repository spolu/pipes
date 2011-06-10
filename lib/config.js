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