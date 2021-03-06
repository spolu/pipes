#!/usr/local/bin/node

// Copyright Stanislas Polu
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util');
var fs = require('fs');
var fwk = require('pipes');

var cfg = require("./config.js");

/** 
 * The Pipes Control Object
 * 
 * @extends {}
 * 
 * @param spec {server, port, key, user}
 */ 
var pipesctl = function(spec, my) {
  my = my || {};
  var _super = {};

  fwk.populateConfig(cfg.config);
  my.cfg = cfg.config;
  my.logger = fwk.logger();
  
  
  my.server = spec.server || my.cfg['PIPES_SERVER'];
  my.port = spec.port || my.cfg['PIPES_PORT'];

  my.key = spec.key || my.cfg['PIPES_HMAC_KEY'];
  my.user = spec.user || my.cfg['PIPES_ADMIN_USER'];
  
  my.pipe = require('pipes').pipe({ server: my.server,
				    port: my.port,
				    key: my.key,
				    user: my.user });
  
  var that = {};
  
  var usage, help, main;
  var register, unregister, grant, revoke;
  var list, shutdown;
  
  help = function (cmd) {

    switch(cmd) {

    case 'register':
      console.log('Usage: pipesctl register <filter.js> <router.js> [tag]');
      console.log('');
      break;
      
    case 'unregister':
      console.log('Usage: pipesctl unregister <id>');
      console.log('');
      break;
      
    case 'grant':
      console.log('Usage: pipesctl grant <filter.js> [tag]');
      console.log('');
      break;
      
    case 'revoke':
      console.log('Usage: pipesctl revoke <id>');
      console.log('');
      break;
      
    case 'list':
      console.log('Usage: pipesctl list <reg|auth> [id]');
      console.log('');
      break;

    case 'shutdown':
      console.log('Usage: pipesctl shutdown');
      console.log('');
      break;
      
    default:
      usage();
    }
  };
  
  usage = function() {
    console.log('Usage: pipesctl <command>');
    console.log('');
    console.log('<comand> is one of:');
    console.log('   register, unregister, grant, revoke');
    console.log('   list, shutdown');
    console.log('');
    console.log('Config values can be specified in the ENV or');
    console.log('on the command line using:');
    console.log('  pipesctl <command> --KEY=VALUE');
    console.log('');
  };

  main = function() {
    var args = fwk.extractArgvs();
    args = args.slice(2);
    
    if(args.length == 0) { usage(); return; }
    
    var cmd = args[0];
    
    switch(cmd) {

    case 'register':
      if(args.length < 3 || args.length > 4) { 
	help('register'); 
	return; 
      }
      register(args[1], args[2], args[3]);     	
      break;

    case 'unregister':
      if(args.length != 2) { 
	help('unregister'); 
	return; 
      }
      unregister(args[1]);     	
      break;

    case 'grant':
      if(args.length < 2 || args.length > 3) {
	help('grant'); 
	return; 
      }
      grant(args[1], args[2]);
      break;

    case 'revoke':
      if(args.length != 2) { 
	help('revoke'); 
	return; 
      }
      revoke(args[1]);     	
      break;

    case 'list':
      if(args.length < 2 || args.length > 3) { 
	help('list'); 
	return; 
      }
      if(args[1] !== 'reg' && args[1] !== 'auth') {
	help('list'); 
	return; 	
      }
      list(args[1], args[2]);
      break;
      
    case 'shutdown':
      if(args.length != 1) { 
	help('shutdown'); 
	return; 
      }
      shutdown();     	
      break;

    default:
      usage(); return;
    }
    
  }; 
  

  register = function(fpath, rpath, tag) {
    var filter, router;
    var done;
    
    fwk.readfile(fpath, function(err, data) {
		   if(err) {
		     console.log(err.stack);
		     process.exit();
		   }
		   filter = data;
		   done();
		 });
    
    fwk.readfile(rpath, function(err, data) {
		   if(err) {
		     console.log(err.stack);
		     process.exit();
		   }
		   router = data;
		   done();
		 });
    

    done = function() {
      if(filter && router) {
	my.pipe.register(
	  tag, filter, router, 
	  function(err, id) {
	    if(err) {
	      console.log(err.stack);
	      process.exit();
	    }
	    console.log(id);
	  });
      }
    };    
  };
  

  unregister = function(id) {
    my.pipe.unregister(
      id, 
      function(err) {
	if(err) {
	  console.log(err.stack);
	  process.exit();
	}
	console.log('DONE');
      });
  };
  

  grant = function(fpath, tag) {
    fwk.readfile(fpath, function(err, data) {
		   if(err) {
		     console.log(err.stack);
		     process.exit();
		   }
		   var filter = data;
		   my.pipe.grant(
		     tag, filter, 
		     function(err, id) {
		       if(err) {
			 console.log(err.stack);
			 process.exit();
		       }
		       console.log(id);
		     });
		 });    
  };
  

  revoke = function(id) {
    my.pipe.revoke(
      id, 
      function(err) {
	if(err) {
	  console.log(err.stack);
	  process.exit();
	}
	console.log('DONE');
      });
  };
  

  list = function(kind, id) {
    
    var showreg = function(reg) {
      var blank = '                        ';
      var line = '';		
      var add = function(str) {
	line += str + blank.slice(str.length);		  
      };
      add('' + reg.id);
      add('[' + reg.tag + ']');
      add('subs:' + reg.subs.length);
      add('size:' + reg.size);
      add('count:' + reg.count);
      
      return line;
    };
    
    var showsub = function(sub) {
      var blank = '                        ';
      var line = '';		
      var add = function(str) {
	line += str + blank.slice(str.length);		  
      };
      add('  ' + sub.id);
      add('[' + sub.tag + ']');
      add('count:' + sub.count);
      
      return line;
    };

    var showauth = function(auth) {
      var blank = '                        ';
      var line = '';		
      var add = function(str) {
	line += str + blank.slice(str.length);		  
      };
      add('' + auth.id);
      add('[' + auth.tag + ']');
      
      return line;
    };

    my.pipe.list(
      kind, id, 
      function(err, data) {
	if(err) {
	  console.log(err.stack);
	  process.exit();
	}
	
	switch(kind) {
	  
	case 'reg':
	  if(id) {
	    console.log(showreg(data[id]));
	    console.log('[');
	    for(var i = 0; i < data[id].subs.length; i ++) {
	      console.log(showsub(data[id].subs[i]));
	    }
	    console.log(']');
	    console.log('\nFILTER:\n' + data[id].filter);
	    console.log('\nROUTER\n' + data[id].router);
	  } 
	  else {
	    for(var i in data) {
	      if(data.hasOwnProperty(i)) {
		console.log(showreg(data[i]));
	      }
	    }
	  }	
	  break;
	  
	case 'auth':
	  if(id) {
	    console.log(showauth(data[id]));
	    console.log('\nFILTER:\n' + data[id].filter);	    
	  } else {
	    for(var i in data) {
	      if(data.hasOwnProperty(i)) {
		console.log(showauth(data[i]));
	      }
	    }
	  }	    
	  break;
	  
	default:
	  break;	  
	}
      });
    
  };    
  
  shutdown = function(id) {
    my.pipe.shutdown(
      function(err) {
	if(err) {
	  console.log(err.stack);
	  process.exit();
	}
	console.log('DONE');
      });
  };

  fwk.method(that, 'main', main);
  
  return that;
};

/** main */
pipesctl({}).main();
