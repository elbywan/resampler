(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var resampler = require('./lib/resampler.js');
var dragDrop = require('drag-drop');

window.addEventListener('load', function(){
	// dom elements
	var fSelectOption = document.getElementById('freqSelect');
	var messageBox = document.getElementById('message');
	var input = document.getElementById('input');
	var note = document.getElementById('note');
	var spinner = document.getElementById('spinner');

	//monkeypatch
	var ddEventListeners = {};
	var dropzone = document.querySelector('#dropzone');
	var dEL = dropzone.addEventListener.bind(dropzone);

	dropzone.addEventListener = function(event, callback, flag){
		ddEventListeners[event] = callback;
		dEL(event,callback,flag);
	};

	var disableDragDrop = function(elem) {
		elem.removeEventListener ('dragenter', ddEventListeners.dragenter);
		elem.removeEventListener('dragover', ddEventListeners.dragover);
		elem.removeEventListener('drop', ddEventListeners.drop);
	};

	dragDrop('#dropzone', resampleDraggedFiles);

	messageBox.addEventListener('click', function (){
		input.click();
	});

	input.addEventListener('change', function(evt){
		var chosenFile = evt.target.files[0];
		if (chosenFile){
			var chosenSampleRate = parseInt(fSelectOption.selectedOptions[0].value);
			console.log(chosenFile,chosenSampleRate);
			resampleFile(chosenFile,chosenSampleRate);
		}
	});

	function resampleDraggedFiles(files){
		var chosenFile = files[0] || files;
		var chosenSampleRate = parseInt(fSelectOption.selectedOptions[0].value);
		console.log(chosenFile,chosenSampleRate);
		resampleFile(chosenFile,chosenSampleRate);
	}

	function resampleFile (file, targetSampleRate){
		// note.messageBox.
		note.style.display = "none";
		spinner.style.display = "inherit";
		input.disabled = true;
		disableDragDrop(dropzone);
		resampler(file, targetSampleRate, function(event){
			event.getFile(function(fileEvent){
				console.log(fileEvent);
				spinner.style.display = "none";
				note.style.display = "inherit";
				input.disabled = false;
				dragDrop('#dropzone');
				var a = document.createElement("a");
				document.body.appendChild(a);
				a.style.display = "none";
				a.href = fileEvent;
				var fileExt = file.name.split('.').pop();
				var fileName = file.name.substr(0, file.name.length-fileExt.length-1);
				a.download = fileName + "_resampled."+ fileExt;
				a.click();
				window.URL.revokeObjectURL(fileEvent);
				document.body.removeChild(a);
			});
		});
	}
});

},{"./lib/resampler.js":2,"drag-drop":3}],2:[function(require,module,exports){
"use strict";

var WebAudioLoader = require('webaudioloader');
var WavEncoder = require("wav-encoder");

// WebAudio Shim.
window.OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = new AudioContext();

var wal = new WebAudioLoader({
    context: audioContext,
    cache: false
});

function resampler(input, targetSampleRate, oncomplete) {

    if (!input && !targetSampleRate) {
        return returnError('Error: First argument should be either a File, URL or AudioBuffer');
    }

    var inputType = Object.prototype.toString.call(input);
    if (inputType !== '[object String]' &&
        inputType !== '[object File]' &&
        inputType !== '[object AudioBuffer]' &&
        inputType !== '[object Object]') {
        return returnError('Error: First argument should be either a File, URL or AudioBuffer');
    }

    if (typeof targetSampleRate !== 'number' ||
        targetSampleRate > 192000 || targetSampleRate < 3000) {
        return returnError('Error: Second argument should be a numeric sample rate between 3000 and 192000');
    }

    if (inputType === '[object String]' || inputType === '[object File]') {
        console.log('Loading/decoding input', input);
        wal.load(input, {
            onload: function(err, audioBuffer) {
                if (err) {
                    return returnError(err);
                }
                resampleAudioBuffer(audioBuffer);
            }
        });
    } else if (inputType === '[object AudioBuffer]') {
        resampleAudioBuffer(input);
    } else if (inputType === '[object Object]' && input.leftBuffer && input.sampleRate) {
        var numCh_ = input.rightBuffer ? 2 : 1;
        var audioBuffer_ = audioContext.createBuffer(numCh_, input.leftBuffer.length, input.sampleRate);
        resampleAudioBuffer(audioBuffer_);
    } else {
        return returnError('Error: Unknown input type');
    }

    function returnError(errMsg) {
        console.error(errMsg);
        if (typeof oncomplete === 'function') {
            oncomplete(new Error(errMsg));
        }
        return;
    }

    function resampleAudioBuffer(audioBuffer) {


        var numCh_ = audioBuffer.numberOfChannels;
        var numFrames_ = audioBuffer.length * targetSampleRate / audioBuffer.sampleRate;

        var offlineContext_ = new OfflineAudioContext(numCh_, numFrames_, targetSampleRate);
        var bufferSource_ = offlineContext_.createBufferSource();
        bufferSource_.buffer = audioBuffer;

        offlineContext_.oncomplete = function(event) {
            var resampeledBuffer = event.renderedBuffer;
            console.log('Done Rendering');
            if (typeof oncomplete === 'function') {
                oncomplete({
                    getAudioBuffer: function() {
                        return resampeledBuffer;
                    },
                    getFile: function(fileCallback) {
                        var audioData = {
                            sampleRate: resampeledBuffer.sampleRate,
                            channelData: []
                        };
                        for (var i = 0; i < resampeledBuffer.numberOfChannels; i++) {
                            audioData.channelData[i] = resampeledBuffer.getChannelData(i);
                        }
                        WavEncoder.encode(audioData).then(function(buffer) {
                            var blob = new Blob([buffer], {
                                type: "audio/wav"
                            });
                            fileCallback(URL.createObjectURL(blob));
                        });
                    }
                });
            }
        };

        console.log('Starting Offline Rendering');
        bufferSource_.connect(offlineContext_.destination);
        bufferSource_.start(0);
        offlineContext_.startRendering();
    }
}


module.exports = resampler;

},{"wav-encoder":8,"webaudioloader":9}],3:[function(require,module,exports){
module.exports = dragDrop

var flatten = require('flatten')
var parallel = require('run-parallel')

function dragDrop (elem, listeners) {
  if (typeof elem === 'string') {
    var selector = elem
    elem = window.document.querySelector(elem)
    if (!elem) {
      throw new Error('"' + selector + '" does not match any HTML elements')
    }
  }

  if (!elem) {
    throw new Error('"' + elem + '" is not a valid HTML element')
  }

  if (typeof listeners === 'function') {
    listeners = { onDrop: listeners }
  }

  var timeout

  elem.addEventListener('dragenter', onDragEnter, false)
  elem.addEventListener('dragover', onDragOver, false)
  elem.addEventListener('dragleave', onDragLeave, false)
  elem.addEventListener('drop', onDrop, false)

  // Function to remove drag-drop listeners
  return function remove () {
    removeDragClass()
    elem.removeEventListener('dragenter', onDragEnter, false)
    elem.removeEventListener('dragover', onDragOver, false)
    elem.removeEventListener('dragleave', onDragLeave, false)
    elem.removeEventListener('drop', onDrop, false)
  }

  function onDragEnter (e) {
    if (listeners.onDragEnter) {
      listeners.onDragEnter(e)
    }

    // Prevent event
    e.stopPropagation()
    e.preventDefault()
    return false
  }

  function onDragOver (e) {
    e.stopPropagation()
    e.preventDefault()
    if (e.dataTransfer.items) {
      // Only add "drag" class when `items` contains items that are able to be
      // handled by the registered listeners (files vs. text)
      var items = toArray(e.dataTransfer.items)
      var fileItems = items.filter(function (item) { return item.kind === 'file' })
      var textItems = items.filter(function (item) { return item.kind === 'string' })

      if (fileItems.length === 0 && !listeners.onDropText) return
      if (textItems.length === 0 && !listeners.onDrop) return
      if (fileItems.length === 0 && textItems.length === 0) return
    }

    elem.classList.add('drag')
    clearTimeout(timeout)

    if (listeners.onDragOver) {
      listeners.onDragOver(e)
    }

    e.dataTransfer.dropEffect = 'copy'
    return false
  }

  function onDragLeave (e) {
    e.stopPropagation()
    e.preventDefault()

    if (listeners.onDragLeave) {
      listeners.onDragLeave(e)
    }

    clearTimeout(timeout)
    timeout = setTimeout(removeDragClass, 50)

    return false
  }

  function onDrop (e) {
    e.stopPropagation()
    e.preventDefault()

    if (listeners.onDragLeave) {
      listeners.onDragLeave(e)
    }

    clearTimeout(timeout)
    removeDragClass()

    var pos = {
      x: e.clientX,
      y: e.clientY
    }

    // text drop support
    var text = e.dataTransfer.getData('text')
    if (text && listeners.onDropText) {
      listeners.onDropText(text, pos)
    }

    // file drop support
    if (e.dataTransfer.items) {
      // Handle directories in Chrome using the proprietary FileSystem API
      var items = toArray(e.dataTransfer.items).filter(function (item) {
        return item.kind === 'file'
      })

      if (items.length === 0) return

      parallel(items.map(function (item) {
        return function (cb) {
          processEntry(item.webkitGetAsEntry(), cb)
        }
      }), function (err, results) {
        // This catches permission errors with file:// in Chrome. This should never
        // throw in production code, so the user does not need to use try-catch.
        if (err) throw err
        if (listeners.onDrop) {
          listeners.onDrop(flatten(results), pos)
        }
      })
    } else {
      var files = toArray(e.dataTransfer.files)

      if (files.length === 0) return

      files.forEach(function (file) {
        file.fullPath = '/' + file.name
      })

      if (listeners.onDrop) {
        listeners.onDrop(files, pos)
      }
    }

    return false
  }

  function removeDragClass () {
    elem.classList.remove('drag')
  }
}

function processEntry (entry, cb) {
  var entries = []

  if (entry.isFile) {
    entry.file(function (file) {
      file.fullPath = entry.fullPath  // preserve pathing for consumer
      cb(null, file)
    }, function (err) {
      cb(err)
    })
  } else if (entry.isDirectory) {
    var reader = entry.createReader()
    readEntries()
  }

  function readEntries () {
    reader.readEntries(function (entries_) {
      if (entries_.length > 0) {
        entries = entries.concat(toArray(entries_))
        readEntries() // continue reading entries until `readEntries` returns no more
      } else {
        doneEntries()
      }
    })
  }

  function doneEntries () {
    parallel(entries.map(function (entry) {
      return function (cb) {
        processEntry(entry, cb)
      }
    }), cb)
  }
}

function toArray (list) {
  return Array.prototype.slice.call(list || [], 0)
}

},{"flatten":4,"run-parallel":7}],4:[function(require,module,exports){
module.exports = function flatten(list, depth) {
  depth = (typeof depth == 'number') ? depth : Infinity;

  if (!depth) {
    if (Array.isArray(list)) {
      return list.map(function(i) { return i; });
    }
    return list;
  }

  return _flatten(list, 1);

  function _flatten(list, d) {
    return list.reduce(function (acc, item) {
      if (Array.isArray(item) && d < depth) {
        return acc.concat(_flatten(item, d + 1));
      }
      else {
        return acc.concat(item);
      }
    }, []);
  }
};

},{}],5:[function(require,module,exports){
;(function () { // closure for web browsers

if (typeof module === 'object' && module.exports) {
  module.exports = LRUCache
} else {
  // just set the global for non-node platforms.
  this.LRUCache = LRUCache
}

function hOP (obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function naiveLength () { return 1 }

var didTypeWarning = false
function typeCheckKey(key) {
  if (!didTypeWarning && typeof key !== 'string' && typeof key !== 'number') {
    didTypeWarning = true
    console.error(new TypeError("LRU: key must be a string or number. Almost certainly a bug! " + typeof key).stack)
  }
}

function LRUCache (options) {
  if (!(this instanceof LRUCache))
    return new LRUCache(options)

  if (typeof options === 'number')
    options = { max: options }

  if (!options)
    options = {}

  this._max = options.max
  // Kind of weird to have a default max of Infinity, but oh well.
  if (!this._max || !(typeof this._max === "number") || this._max <= 0 )
    this._max = Infinity

  this._lengthCalculator = options.length || naiveLength
  if (typeof this._lengthCalculator !== "function")
    this._lengthCalculator = naiveLength

  this._allowStale = options.stale || false
  this._maxAge = options.maxAge || null
  this._dispose = options.dispose
  this.reset()
}

// resize the cache when the max changes.
Object.defineProperty(LRUCache.prototype, "max",
  { set : function (mL) {
      if (!mL || !(typeof mL === "number") || mL <= 0 ) mL = Infinity
      this._max = mL
      if (this._length > this._max) trim(this)
    }
  , get : function () { return this._max }
  , enumerable : true
  })

// resize the cache when the lengthCalculator changes.
Object.defineProperty(LRUCache.prototype, "lengthCalculator",
  { set : function (lC) {
      if (typeof lC !== "function") {
        this._lengthCalculator = naiveLength
        this._length = this._itemCount
        for (var key in this._cache) {
          this._cache[key].length = 1
        }
      } else {
        this._lengthCalculator = lC
        this._length = 0
        for (var key in this._cache) {
          this._cache[key].length = this._lengthCalculator(this._cache[key].value)
          this._length += this._cache[key].length
        }
      }

      if (this._length > this._max) trim(this)
    }
  , get : function () { return this._lengthCalculator }
  , enumerable : true
  })

Object.defineProperty(LRUCache.prototype, "length",
  { get : function () { return this._length }
  , enumerable : true
  })


Object.defineProperty(LRUCache.prototype, "itemCount",
  { get : function () { return this._itemCount }
  , enumerable : true
  })

LRUCache.prototype.forEach = function (fn, thisp) {
  thisp = thisp || this
  var i = 0
  var itemCount = this._itemCount

  for (var k = this._mru - 1; k >= 0 && i < itemCount; k--) if (this._lruList[k]) {
    i++
    var hit = this._lruList[k]
    if (isStale(this, hit)) {
      del(this, hit)
      if (!this._allowStale) hit = undefined
    }
    if (hit) {
      fn.call(thisp, hit.value, hit.key, this)
    }
  }
}

LRUCache.prototype.keys = function () {
  var keys = new Array(this._itemCount)
  var i = 0
  for (var k = this._mru - 1; k >= 0 && i < this._itemCount; k--) if (this._lruList[k]) {
    var hit = this._lruList[k]
    keys[i++] = hit.key
  }
  return keys
}

LRUCache.prototype.values = function () {
  var values = new Array(this._itemCount)
  var i = 0
  for (var k = this._mru - 1; k >= 0 && i < this._itemCount; k--) if (this._lruList[k]) {
    var hit = this._lruList[k]
    values[i++] = hit.value
  }
  return values
}

LRUCache.prototype.reset = function () {
  if (this._dispose && this._cache) {
    for (var k in this._cache) {
      this._dispose(k, this._cache[k].value)
    }
  }

  this._cache = Object.create(null) // hash of items by key
  this._lruList = Object.create(null) // list of items in order of use recency
  this._mru = 0 // most recently used
  this._lru = 0 // least recently used
  this._length = 0 // number of items in the list
  this._itemCount = 0
}

LRUCache.prototype.dump = function () {
  var arr = []
  var i = 0

  for (var k = this._mru - 1; k >= 0 && i < this._itemCount; k--) if (this._lruList[k]) {
    var hit = this._lruList[k]
    if (!isStale(this, hit)) {
      //Do not store staled hits
      ++i
      arr.push({
        k: hit.key,
        v: hit.value,
        e: hit.now + (hit.maxAge || 0)
      });
    }
  }
  //arr has the most read first
  return arr
}

LRUCache.prototype.dumpLru = function () {
  return this._lruList
}

LRUCache.prototype.set = function (key, value, maxAge) {
  maxAge = maxAge || this._maxAge
  typeCheckKey(key)

  var now = maxAge ? Date.now() : 0
  var len = this._lengthCalculator(value)

  if (hOP(this._cache, key)) {
    if (len > this._max) {
      del(this, this._cache[key])
      return false
    }
    // dispose of the old one before overwriting
    if (this._dispose)
      this._dispose(key, this._cache[key].value)

    this._cache[key].now = now
    this._cache[key].maxAge = maxAge
    this._cache[key].value = value
    this._length += (len - this._cache[key].length)
    this._cache[key].length = len
    this.get(key)

    if (this._length > this._max)
      trim(this)

    return true
  }

  var hit = new Entry(key, value, this._mru++, len, now, maxAge)

  // oversized objects fall out of cache automatically.
  if (hit.length > this._max) {
    if (this._dispose) this._dispose(key, value)
    return false
  }

  this._length += hit.length
  this._lruList[hit.lu] = this._cache[key] = hit
  this._itemCount ++

  if (this._length > this._max)
    trim(this)

  return true
}

LRUCache.prototype.has = function (key) {
  typeCheckKey(key)
  if (!hOP(this._cache, key)) return false
  var hit = this._cache[key]
  if (isStale(this, hit)) {
    return false
  }
  return true
}

LRUCache.prototype.get = function (key) {
  typeCheckKey(key)
  return get(this, key, true)
}

LRUCache.prototype.peek = function (key) {
  typeCheckKey(key)
  return get(this, key, false)
}

LRUCache.prototype.pop = function () {
  var hit = this._lruList[this._lru]
  del(this, hit)
  return hit || null
}

LRUCache.prototype.del = function (key) {
  typeCheckKey(key)
  del(this, this._cache[key])
}

LRUCache.prototype.load = function (arr) {
  //reset the cache
  this.reset();

  var now = Date.now()
  //A previous serialized cache has the most recent items first
  for (var l = arr.length - 1; l >= 0; l-- ) {
    var hit = arr[l]
    typeCheckKey(hit.k)
    var expiresAt = hit.e || 0
    if (expiresAt === 0) {
      //the item was created without expiration in a non aged cache
      this.set(hit.k, hit.v)
    } else {
      var maxAge = expiresAt - now
      //dont add already expired items
      if (maxAge > 0) this.set(hit.k, hit.v, maxAge)
    }
  }
}

function get (self, key, doUse) {
  typeCheckKey(key)
  var hit = self._cache[key]
  if (hit) {
    if (isStale(self, hit)) {
      del(self, hit)
      if (!self._allowStale) hit = undefined
    } else {
      if (doUse) use(self, hit)
    }
    if (hit) hit = hit.value
  }
  return hit
}

function isStale(self, hit) {
  if (!hit || (!hit.maxAge && !self._maxAge)) return false
  var stale = false;
  var diff = Date.now() - hit.now
  if (hit.maxAge) {
    stale = diff > hit.maxAge
  } else {
    stale = self._maxAge && (diff > self._maxAge)
  }
  return stale;
}

function use (self, hit) {
  shiftLU(self, hit)
  hit.lu = self._mru ++
  self._lruList[hit.lu] = hit
}

function trim (self) {
  while (self._lru < self._mru && self._length > self._max)
    del(self, self._lruList[self._lru])
}

function shiftLU (self, hit) {
  delete self._lruList[ hit.lu ]
  while (self._lru < self._mru && !self._lruList[self._lru]) self._lru ++
}

function del (self, hit) {
  if (hit) {
    if (self._dispose) self._dispose(hit.key, hit.value)
    self._length -= hit.length
    self._itemCount --
    delete self._cache[ hit.key ]
    shiftLU(self, hit)
  }
}

// classy, since V8 prefers predictable objects.
function Entry (key, value, lu, length, now, maxAge) {
  this.key = key
  this.value = value
  this.lu = lu
  this.length = length
  this.now = now
  if (maxAge) this.maxAge = maxAge
}

})()

},{}],6:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],7:[function(require,module,exports){
(function (process){
module.exports = function (tasks, cb) {
  var results, pending, keys
  var isSync = true

  if (Array.isArray(tasks)) {
    results = []
    pending = tasks.length
  } else {
    keys = Object.keys(tasks)
    results = {}
    pending = keys.length
  }

  function done (err) {
    function end () {
      if (cb) cb(err, results)
      cb = null
    }
    if (isSync) process.nextTick(end)
    else end()
  }

  function each (i, err, result) {
    results[i] = result
    if (--pending === 0 || err) {
      done(err)
    }
  }

  if (!pending) {
    // empty
    done(null)
  } else if (keys) {
    // object
    keys.forEach(function (key) {
      tasks[key](function (err, result) { each(key, err, result) })
    })
  } else {
    // array
    tasks.forEach(function (task, i) {
      task(function (err, result) { each(i, err, result) })
    })
  }

  isSync = false
}

}).call(this,require('_process'))
},{"_process":6}],8:[function(require,module,exports){
"use strict";

function encodeSync(audioData, opts) {
  opts = opts || {};

  audioData = toAudioData(audioData);

  if (audioData === null) {
    throw new TypeError("Invalid AudioData");
  }

  var floatingPoint = !!(opts.floatingPoint || opts.float);
  var bitDepth = floatingPoint ? 32 : ((opts.bitDepth|0) || 16);
  var bytes = bitDepth >> 3;
  var length = audioData.length * audioData.numberOfChannels * bytes;
  var dataView = new DataView(new Uint8Array(44 + length).buffer);
  var writer = createWriter(dataView);

  var format = {
    formatId: floatingPoint ? 0x0003 : 0x0001,
    floatingPoint: floatingPoint,
    numberOfChannels: audioData.numberOfChannels,
    sampleRate: audioData.sampleRate,
    bitDepth: bitDepth
  };

  writeHeader(writer, format, dataView.buffer.byteLength - 8);

  var err = writeData(writer, format, length, audioData, opts);

  if (err instanceof Error) {
    throw err;
  }

  return dataView.buffer;
}

function encode(audioData, opts) {
  return new Promise(function(resolve) {
    resolve(encodeSync(audioData, opts));
  });
}

function toAudioData(data) {
  var audioData = {};

  if (typeof data.sampleRate !== "number") {
    return null;
  }
  if (!Array.isArray(data.channelData)) {
    return null;
  }
  if (!(data.channelData[0] instanceof Float32Array)) {
    return null;
  }

  audioData.numberOfChannels = data.channelData.length;
  audioData.length = data.channelData[0].length|0;
  audioData.sampleRate = data.sampleRate|0;
  audioData.channelData = data.channelData;

  return audioData;
}

function writeHeader(writer, format, length) {
  var bytes = format.bitDepth >> 3;

  writer.string("RIFF");
  writer.uint32(length);
  writer.string("WAVE");

  writer.string("fmt ");
  writer.uint32(16);
  writer.uint16(format.floatingPoint ? 0x0003 : 0x0001);
  writer.uint16(format.numberOfChannels);
  writer.uint32(format.sampleRate);
  writer.uint32(format.sampleRate * format.numberOfChannels * bytes);
  writer.uint16(format.numberOfChannels * bytes);
  writer.uint16(format.bitDepth);
}

function writeData(writer, format, length, audioData, opts) {
  var bitDepth = format.bitDepth;
  var encoderOption = format.floatingPoint ? "f" : opts.symmetric ? "s" : "";
  var methodName = "pcm" + bitDepth + encoderOption;

  if (!writer[methodName]) {
    return new TypeError("Not supported bit depth: " + bitDepth);
  }

  var write = writer[methodName].bind(writer);
  var numberOfChannels = format.numberOfChannels;
  var channelData = audioData.channelData;

  writer.string("data");
  writer.uint32(length);

  for (var i = 0, imax = audioData.length; i < imax; i++) {
    for (var ch = 0; ch < numberOfChannels; ch++) {
      write(channelData[ch][i]);
    }
  }
}

function createWriter(dataView) {
  var pos = 0;

  return {
    int16: function(value) {
      dataView.setInt16(pos, value, true);
      pos += 2;
    },
    uint16: function(value) {
      dataView.setUint16(pos, value, true);
      pos += 2;
    },
    uint32: function(value) {
      dataView.setUint32(pos, value, true);
      pos += 4;
    },
    string: function(value) {
      for (var i = 0, imax = value.length; i < imax; i++) {
        dataView.setUint8(pos++, value.charCodeAt(i));
      }
    },
    pcm8: function(value) {
      value = Math.max(-1, Math.min(value, +1));
      value = (value * 0.5 + 0.5) * 255;
      value = Math.round(value)|0;
      dataView.setUint8(pos, value, true);
      pos += 1;
    },
    pcm8s: function(value) {
      value = Math.round(value * 128) + 128;
      value = Math.max(0, Math.min(value, 255));
      dataView.setUint8(pos, value, true);
      pos += 1;
    },
    pcm16: function(value) {
      value = Math.max(-1, Math.min(value, +1));
      value = value < 0 ? value * 32768 : value * 32767;
      value = Math.round(value)|0;
      dataView.setInt16(pos, value, true);
      pos += 2;
    },
    pcm16s: function(value) {
      value = Math.round(value * 32768);
      value = Math.max(-32768, Math.min(value, 32767));
      dataView.setInt16(pos, value, true);
      pos += 2;
    },
    pcm24: function(value) {
      value = Math.max(-1, Math.min(value, +1));
      value = value < 0 ? 0x1000000 + value * 8388608 : value * 8388607;
      value = Math.round(value)|0;

      var x0 = (value >>  0) & 0xFF;
      var x1 = (value >>  8) & 0xFF;
      var x2 = (value >> 16) & 0xFF;

      dataView.setUint8(pos + 0, x0);
      dataView.setUint8(pos + 1, x1);
      dataView.setUint8(pos + 2, x2);
      pos += 3;
    },
    pcm24s: function(value) {
      value = Math.round(value * 8388608);
      value = Math.max(-8388608, Math.min(value, 8388607));

      var x0 = (value >>  0) & 0xFF;
      var x1 = (value >>  8) & 0xFF;
      var x2 = (value >> 16) & 0xFF;

      dataView.setUint8(pos + 0, x0);
      dataView.setUint8(pos + 1, x1);
      dataView.setUint8(pos + 2, x2);
      pos += 3;
    },
    pcm32: function(value) {
      value = Math.max(-1, Math.min(value, +1));
      value = value < 0 ? value * 2147483648 : value * 2147483647;
      value = Math.round(value)|0;
      dataView.setInt32(pos, value, true);
      pos += 4;
    },
    pcm32s: function(value) {
      value = Math.round(value * 2147483648);
      value = Math.max(-2147483648, Math.min(value, +2147483647));
      dataView.setInt32(pos, value, true);
      pos += 4;
    },
    pcm32f: function(value) {
      dataView.setFloat32(pos, value, true);
      pos += 4;
    }
  };
}

module.exports.encode = encode;
module.exports.encode.sync = encodeSync;

},{}],9:[function(require,module,exports){
"use strict";

/*
	constructor
	var wal = new WebAudioLoader({cache : false, maxCacheSize : 1000, onload: function(){}, onprogress: function(){}, context : audioContext })
 */
function WebAudioLoader (options){

	if ( !( this instanceof WebAudioLoader ) ) {
		throw new TypeError( "WebAudioLoader constructor cannot be called as a function." );
	}

	window.AudioContext = window.AudioContext || window.webkitAudioContext;

	// Singleton using a global reference.
	if (window.webAudioLoader){
		return window.webAudioLoader;
	}

		// setup cache object
	this._cachedAudio = null;

	// Define default local properties
	this.cache = true;
	this.onload = null;
	this.onprogress = null;
	Object.defineProperty(this,'maxCacheSize', {
		enumerable: true,
		configurable: false,
		set : function (maxSize){
			if (this._cachedAudio){
				this._cachedAudio.max = maxSize;
			}
		},
		get : function (){
			return this._cachedAudio.max;
		}
	});

	// Options parsing.
	options = options || {};
	for (var opt in options){
		if (this.hasOwnProperty(opt) && options[opt] !== undefined){
			this[opt] = options[opt];
		}
	}
	this.context = options.audioContext || new AudioContext();

	// Setup Cache
	var cacheOptions = {
		max: options.maxCacheSize || 1000,
		length: function(audioBuffer){
			return (audioBuffer.length*audioBuffer.numberOfChannels*4)/1000;
		}
	};
	this._cachedAudio = require('lru-cache')(cacheOptions);


	// Resgiter as global
	window.webAudioLoader = this;

	// Helper functions
	this._loadURLOrFile = function (URL, onprogress, onload){
		var urlType = Object.prototype.toString.call( URL );
		var request = null;
		if (urlType === '[object String]'){
			request = new XMLHttpRequest();
			request.open('GET', URL, true);
			request.responseType = 'arraybuffer';
		}
		else if (urlType === '[object File]' || urlType === '[object Blob]' ){
			request = new FileReader();
		}else{
			return;
		}

		request.onload = function () {
			if (urlType === '[object String]' && request.status === 200){
				if (typeof onload === 'function'){
					onload(null, request.response);
				}
			}else if (urlType === '[object File]' || urlType === '[object Blob]'){
				if (typeof onload === 'function'){
						onload(null, request.result);
				}
			}else{
				if (typeof onload === 'function'){
					onload(new Error("Loading Error"), null);
				}
			}
		};
		request.onerror = function(){
			if (typeof onload === 'function'){
				onload(new Error("Loading Error"), null);
			}
		};
		request.onprogress = function(event){
			if (typeof onprogress === 'function'){
				onprogress(event);
			}

			if (typeof this.onprogress === 'function'){
				this.onprogress(event);
			}
		}.bind(this);

		if (urlType === '[object String]'){
			request.send();
		}else if (urlType === '[object File]' || urlType === '[object Blob]' ){
			request.readAsArrayBuffer( URL );
		}

	};
}
/*
	load method.
	wal.load('http://www.example.com/audio.mp3');
	wal.load([object File]);
	wal.load('http://www.example.com/audio.mp3', {decode: false,cache : false , onload: function(){}, onprogress: function(){}});
 */
WebAudioLoader.prototype.load = function (source, options){

	var decode =  true;
	var thisLoadCache = true;

	if (!options) {
		options = {};
	}
	var thisLoadOnload = options.onload || null;
	var thisLoadOnprogress = options.onprogress || null;
	// var startPoint = options.startPoint || 0;
	// var endPoint = options.endPoint || 0;


	if (options.cache !== null && options.cache !== undefined){
		thisLoadCache = options.cache;
	}else{
		thisLoadCache = this.cache;
	}

	if (options.decode !== null && options.decode !== undefined){
		decode = options.decode;
	}

	var onLoadProxy = function (err,audioBuffer){
		if(typeof thisLoadOnload === 'function'){
			thisLoadOnload(err,audioBuffer);
		}
		if (typeof this.onload === 'function'){
			this.onload(err,audioBuffer);
		}
	}.bind(this);

	if (this.cache && thisLoadCache){
		var testCache = this._cachedAudio.get(source);
		if (testCache){
			onLoadProxy(null, testCache);
			return;
		}
	}

	this._loadURLOrFile(source, thisLoadOnprogress, function (err, arrayBuffer){
		if(err || !decode){
			onLoadProxy(err,arrayBuffer);
		}else{
			this.context.decodeAudioData(arrayBuffer, function(audioBuffer){
				if (thisLoadCache){
					this._cachedAudio.set(source,audioBuffer);
				}
				onLoadProxy(err,audioBuffer);
			}.bind(this), function(){
				onLoadProxy(new Error("Decoding Error"),null);
			}.bind(this));
		}
	}.bind(this));
};

/*
	flushCache method
	Resets and empties the cache.
 */
WebAudioLoader.prototype.flushCache = function (){
	this._cachedAudio.reset();
};

module.exports = WebAudioLoader;

},{"lru-cache":5}]},{},[1]);
