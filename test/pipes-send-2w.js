var util = require('util');
var fwk = require('pipes');

var pipes = require('pipes').pipes({});

if(process.argv.length < 3) {
  console.log('node pipes-send.js subject [count]');
  process.exit();
}
var subject = process.argv[2];
var count = (process.argv[3]) ? parseInt(process.argv[3]) : 1;

console.log('sending ' + count + ' msg ' + subject);

for(var i = 0; i < count; i ++) {
  var msg = fwk.message({});
  msg.setType('2w')
    .setSubject(subject)
    .setBody(i)
    .addTarget('tt1')
    .addTarget('tt2');  
  pipes.send(msg, function(err, hdr, res) {
	      if(err)
		console.log(err.stack);
	      else {
		console.log(res.body);
	      }
	    });
}


