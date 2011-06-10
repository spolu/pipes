var util = require('util');
var events = require('events');

/**
 * A Lock
 * 
 * @extends events.EventEmitter
 * 
 * @param spec {}
 */
var lock = function(spec, my) {
  my = my || {};
  var _super = {};

  my.wlock = {};
  my.rlock = {};
  
  var that = new events.EventEmitter();

  var rlock, wlock;
  
  /** section_(unlock) */
  rlock = function(tag, section_) {
    if(!my.wlock[tag]) {
      if(!my.rlock[tag]) my.rlock[tag] = 0;
      my.rlock[tag]++;
      
      var unlock = function() {
	//util.debug('READ UNLOCK: ' + tag);
	process.nextTick( 
	  function() {
	    my.rlock[tag]--;
	    if(my.rlock[tag] < 0) {
	      my.rlock[tag] = 0;
	      util.debug('WARNING: lock.js rlock < 0 for ' + tag);	  
	    }	    	    
	    that.emit(tag);
	  });
      };
      /** read critical section */
      //util.debug('READ CRITICAL: ' + tag);
      section_(unlock);
    }
    else {
      that.once(tag, function() { rlock(tag, section_); });      
    }
  };
  
  wlock = function(tag, section_) {
    if(!my.rlock[tag] && !my.wlock[tag]) {
      my.wlock[tag] = 1;
      
      var unlock = function() {
	//util.debug('WRITE UNLOCK: ' + tag);
	process.nextTick( 
	  function() {
	    my.wlock[tag]--;
	    if(my.wlock[tag] !== 0) {
	      my.wlock[tag] = 0;
	      util.debug('WARNING: lock.js wlock !== 0 for ' + tag);	  
	    }	    	    
	    that.emit(tag);
	  });
      };	
      /** write critical section */
      //util.debug('WRITE CRITICAL: ' + tag);
      section_(unlock);
    }
    else {
      that.once(tag, function() { wlock(tag, section_); });
    }
  };

  
  that.method('rlock', rlock);
  that.method('wlock', wlock);  
  
  return that;
};

exports.lock = lock;