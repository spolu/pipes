var util = require('util');
var fwk = require('fwk');

var pipe = require('pipe').pipe({});

if(process.argv.length < 3) {
  console.log('node pipe-listen.js regid');
}
var regid = process.argv[2];

pipe.on('1w', function(id, msg) {
	  console.log('RECEIVED 1w:' + id + ':' + msg.tint() + ' ' + msg.subject() + " - " + msg.body());	  
	});

pipe.on('2w', function(id, msg) {
	  console.log('REPLYING 2w:' + id + ':' + msg.body());	  
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
	  if(err)
	    console.log(id + ": error " + err.message);	  
	});

pipe.on('stop', function(id) {
	  console.log(id + ': stop');
	});

pipe.on('connect', function(id) {
	  console.log(id + ': connect');
	});

pipe.on('disconnect', function(id) {
	  console.log(id + ': disconnect');
	});

pipe.on('removed', function(id) {
	  console.log(id + ': removed');
	});

pipe.on('added', function(id) {
	  console.log(id + ': added');
	});

pipe.subscribe(regid, 'pipe-simple');
