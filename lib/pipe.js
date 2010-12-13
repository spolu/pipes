var fwk = require('fwk');

/**
 * The main Brick object.
 * 
 * @param spec {
 */
var brick = function(spec, my) {
  my = my || {};
  var _super = {};

  my.subs = [];
  
  /**
   * Events emitted:
   * 'subscribe'  : when the connection for a given subscription is opened
   * 'disconnect' : when the conneciton relative to a subscription is closed
   * '1w'         : when a 1w message is received
   * '2w'         : when a 2w message is received 
   */
  var that = new events.EventEmitter();  

  var register = function() {
    
  };
  
  var unregister = function(id) {
    
  };
  
  var subscribe = function(id) {
    
  };

  that.method('register', register);
  that.method('unregister', unregister);
  that.method('subscribe', subscribe);

  that.getter('subs', my, 'subs');  

  return that;
};