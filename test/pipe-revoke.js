var util = require('util');
var fwk = require('fwk');

var pipe = require('pipe').pipe({});

if(process.argv.length < 3) {
  console.log('node pipe-revoke.js gid');
}
var gid = process.argv[2];

pipe.revoke(gid, function(err) {
	      if(err) {
		console.log(err.stack);
		process.exit();		  
	      }
	      else
		console.log('done');
	    });

