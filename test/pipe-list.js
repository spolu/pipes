var util = require('util');
var fwk = require('fwk');

var pipe = require('pipe').pipe({});

if(process.argv.length < 3) {
  console.log('node pipe-list.js kind id');
}
var kind = process.argv[2];
var id = process.argv[3];

pipe.list(kind, id, function(err, data) {
	    if(err) {
	      console.log(err.stack);
	    } else {
	      console.log(util.inspect(data, false, 3));
	    }	    
	  });