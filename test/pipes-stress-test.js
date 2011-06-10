var util = require('util');
var fwk = require('pipes');

var pipes = require('pipes').pipes({});

var filter = function(msg) {
  return true;
};

var router = function(subs, msg) {
  if(subs.length > 0)
    return {subs: subs, ok: true};
  return {ok: false};
};

var p = pipes;
var rid;
var i = 0;
var max = 100000;

var send1w, send2w, handler1w, handler2w;		  

send1w = function(body) {
  var msg = fwk.message({});
  msg.setType('1w')
    .setSubject('TEST-' + body)
    .setBody(body);
  console.log('sending 1w:' + body);
  pipes.send(msg, handler1w);		    
};

send2w = function(body) {
  var msg = fwk.message({});
  msg.setType('2w')
    .setSubject('TEST-'+body)
    .setBody(body);
  console.log('sending 2w:' + body);
  pipes.send(msg, handler2w);		    
};

handler2w = function(err, hdrs, res) {
  if(err)
    console.log(err.stack);
  else {
    util.debug('2w replied:' + res.body);
    i++;
    if(i < max) send2w(i);    
    else
      process.exit();
  }
};

handler1w = function(err, hdrs, res) {
  if(err)
    console.log(err.stack);
  else {
    console.log('1w replied:' + res.body);
  }
};

pipes.register('pipes-stress-test', filter, router, function(err, id) {
		rid = id;
		if(err)
		  console.log(err.message);
		else {
		  console.log('id: ' + id);	  
		  pipes.subscribe(id, 'test');
		  send2w(i);
		  i++;
		  send1w(i);
		}
	      });

pipes.on('1w', function(id, msg) {
	  util.debug('RECEIVED 1w:' + id + ':' + msg.body());	  
	  i++;
	  if(i < max) send1w(i);	  
	  else
	    process.exit();
	});

pipes.on('2w', function(id, msg) {
	  util.debug('REPLYING 2w:' + id + ':' + msg.body() + ' - ' + msg.tint());	  
	  var reply = fwk.message.reply(msg);
	  reply.setBody(msg.body());
	  pipes.send(reply, handler1w);
	});

pipes.on('fatal', function(err) {
	  console.log('FATAL!');
	});

pipes.on('error', function(err) {
	  if(err)
	    console.log('pipes-error:' + err.stack);
	});
