var util = require('util');
var fs = require('fs');

var base = require("./base.js");
var context = require("./context.js");

/** cb_(err, data) */
var readfile = function(path, cb_) {
  var cb_ = cb_.once();
  var stream = fs.createReadStream(path);
  var data = '';
  stream.on('data', function(chunk) {
	      data += chunk;
	    });
  stream.on('error', function(err) {
	      stream.destroy();
	      cb_(err);
	    });
  stream.on('end', function() {
	      cb_(null, data);
	    });
};


exports.readfile = readfile;
