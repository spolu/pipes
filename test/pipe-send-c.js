var util = require('util');
var fwk = require('fwk');

var pipe = require('pipe').pipe({});

if(process.argv.length < 4) {
  console.log('node pipe-send.js subject target [count]');
  process.exit();
}
var subject = process.argv[2];
var target = process.argv[3];
var count = (process.argv[4]) ? parseInt(process.argv[4]) : 1;

console.log('sending ' + count + ' msg ' + subject);

for(var i = 0; i < count; i ++) {
  var msg = fwk.message({});
  msg.setType('c')
    .setSubject(subject)
    .setBody(i)
    .addTarget(target);  
  pipe.send(msg, function(err, hdr, res) {
	      if(err)
		console.log(err.stack);
	      else {
		console.log(res.body);
	      }
	    });
}


