var util = require('util');
var fwk = require('fwk');

var pipe = require("../pipe/lib/pipe.js").pipe({});

if(process.argv.length < 3) {
  console.log('node pipe-listen.js regid');
}
var regid = process.argv[2];

pipe.subscribe(regid, 'pipe-simple');

pipe.on('1w', function(msg) {
	  console.log('RECEIVED 1w:' + msg.subject() + " - " + msg.body());	  
	});

pipe.on('2w', function(msg) {
	  console.log('REPLYING 2w:' + msg.body());	  
	  var reply = fwk.message.reply(msg);
	  reply.setBody(msg.body());
	  pipe.send(reply, function(err, hdrs, res) {
		      if(err)
			console.log(err.stack);
		      else {
			console.log('r:' + res.body);
		      }
		    });
	});

pipe.on('error', function(err, id) {
	  console.log(id + ': error');
	  if(err)
	    console.log(id + ":" + err.stack);
	});

pipe.on('connect', function(id) {
	  console.log(id + ': connect');
	});

pipe.on('disconnect', function(id) {
	  console.log(id + ': disconnect');
	});
