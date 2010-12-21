var util = require('util');
var fwk = require('fwk');

var pipe = require('pipe').pipe({});

var filter = function(user, msg) {
  util.debug('user granted: ' + user);
  return true;
};

pipe.grant('pipe-grant-all', filter, function(err, id) {
		if(err) {
		  console.log(err.stack);
		  process.exit();		  
		}
		else {
		  console.log(id);	  
		  process.exit();
		}	     
	   });

