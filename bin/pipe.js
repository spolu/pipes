var util = require('util');
var fwk = require('fwk');

var server = require("./server.js");
var config = require("./config.js");

fwk.populateConfig(config.config);
server.createPipe(function access(ctx, msg, cont_) {
		    return cont_(true); 
		   }).listen(config.config['PIPE_PORT']);
