var util = require('util');
var fwk = require('fwk');

var pipe = require('pipe').pipe({});

var filter = function(msg) {
  return true;
};

var router = function(subs) {
  if(subs.length > 0)
    return {subs: subs, ok: true};
  return {ok: false};
};

pipe.register(filter, router, function(err, id) {
		if(err) {
		  console.log(err.stack);
		  process.exit();		  
		}
		else {
		  console.log(id);	  
		  process.exit();
		}
	      });
