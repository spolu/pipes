var util = require('util');
var fwk = require('fwk');

var pipe = require("../pipe/lib/pipe.js").pipe({});

var filter = function(msg) {
  return true;
};

var router = function(subs, msg) {
  if(subs.length > 0)
    return {subs: subs, ok: true};
  return {ok: false};
};

var p = pipe;
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
  pipe.send(msg, handler1w);		    
};

send2w = function(body) {
  var msg = fwk.message({});
  msg.setType('2w')
    .setSubject('TEST-'+body)
    .setBody(body);
  console.log('sending 2w:' + body);
  pipe.send(msg, handler2w);		    
};

handler2w = function(err, hdrs, res) {
  if(err)
    console.log(err.stack);
  else {
    console.log('2w replied:' + res.body);
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
    console.log('1w:' + res.body);
  }
};

pipe.register(filter, router, function(err, id) {
		rid = id;
		if(err)
		  console.log(err.stack);
		else {
		  console.log('id: ' + id);	  
		  pipe.subscribe(id, 'test');
		  send2w(i);
		  i++;
		  send1w(i);
		}
	      });

pipe.on('1w', function(msg) {
	  console.log('RECEIVED 1w:' + msg.body());	  
	  i++;
	  if(i < max) send1w(i);	  
	  else
	    process.exit();
	});

pipe.on('2w', function(msg) {
	  console.log('REPLYING 2w:' + msg.body());	  
	  var reply = fwk.message.reply(msg);
	  reply.setBody(msg.body());
	  pipe.send(reply, handler1w);
	});

pipe.on('fatal', function(err) {
	  console.log('FATAL!');
	});

pipe.on('error', function(err) {
	  if(err)
	    console.log('pipe-error:' + err.stack);
	});
