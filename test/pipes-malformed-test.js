var events = require('events');
var http = require('http');
var util = require('util');
var fwk = require('pipes');

var cfg = require("./config.js");


var malformed = function(spec, my) {
  my = my || {};
  var _super = {};

  fwk.populateConfig(cfg.config);  
  my.cfg = cfg.config;
  
  my.server = spec.server || my.cfg['PIPES_SERVER'];
  my.port = spec.port || my.cfg['PIPES_PORT'];

  my.key = spec.key || my.cfg['PIPES_HMAC_KEY'];
  my.user = spec.user || my.cfg['PIPES_ADMIN_USER'];
  my.expiry = function() { 
    var d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.getTime();
  }();
  
  my.cookie = fwk.generateAuthCookie({config: my.cfg,
				      key: my.key,
				      user: my.user,
				      expiry: my.expiry,
				      server: my.server});
  
  
  var that = {};

  var go;
  
  go1 = function() {
    
    var msg = fwk.message({});
    msg.setType('1w')
      .setSubject('TEST')
      .setBody({test:'malformed'})
      .addTarget('tt1');  
        
    var client = http.createClient(my.port, my.server);
    var ctx = fwk.context({ config: my.cfg, 
			    logger: fwk.silent({}),
			    client: client });    
    ctx.on('error', function(err) {		
	     ctx.log.out('error');
	     ctx.finalize();
	   });
    ctx.on('finalize', function() {
	     ctx.log.out('finalize');
	     delete my.ctx;
	   });
    
    var req = client.request('POST', '/msg',
			     {'Cookie': my.cookie,
			      'Content-Type': 'text/plain' });
    ctx.multi().on('chunk', function(chunk) { req.write(chunk); });
    ctx.multi().send('msg', msg.serialize().substring(5));
    req.end();    

  };
  
  
  that.method('go1', go1);  

  return that;
};

malformed({}).go1();