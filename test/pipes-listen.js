var util = require('util');
var fwk = require('pipes');

var pipes = require('pipes').pipes({});

if(process.argv.length < 3) {
  console.log('node pipes-listen.js regid');
}
var regid = process.argv[2];

pipes.on('1w', function(id, msg) {
	  console.log('RECEIVED 1w:' + id + ':' + msg.tint() + ' ' + msg.subject() + " - " + msg.body());	  
	});

pipes.on('2w', function(id, msg) {
	  console.log('REPLYING 2w:' + id + ':' + msg.body());	  
	  var reply = fwk.message.reply(msg);
	  reply.setBody(msg.body());
	  pipes.send(reply, function(err, hdrs, res) {
		      if(err)
			console.log(err.stack);
		      else {
			console.log('r:' + res.body);
		      }
		    });
	});

pipes.on('error', function(err, id) {
	  if(err)
	    console.log(id + ": error " + err.message);	  
	});

pipes.on('stop', function(id) {
	  console.log(id + ': stop');
	});

pipes.on('connect', function(id) {
	  console.log(id + ': connect');
	});

pipes.on('disconnect', function(id) {
	  console.log(id + ': disconnect');
	});

pipes.on('removed', function(id) {
	  console.log(id + ': removed');
	});

pipes.on('added', function(id) {
	  console.log(id + ': added');
	});

pipes.subscribe(regid, 'pipes-simple');
