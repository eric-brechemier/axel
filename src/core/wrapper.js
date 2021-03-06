/* ***** BEGIN LICENSE BLOCK *****
 *
 * @COPYRIGHT@
 *
 * This file is part of the Adaptable XML Editing Library (AXEL), version @VERSION@
 *
 * @LICENSE@
 *
 * Web site : http://media.epfl.ch/Templates/
 *
 * Author(s) : Stephane Sire
 *
 * ***** END LICENSE BLOCK ***** */

/*****************************************************************************\
|                                                                             |
|  AXEL Wrapper                                                               |
|                                                                             |
|  wrapped set function (access to primitive editors a-la jQuery)             |
|  extended with some global management functions                             |
|  exposed as GLOBAL.$axel                                                    |
|                                                                             |
|*****************************************************************************|
|                                                                             |
|  Wrapped set:                                                               |
|    $axel (node(s) | string, seethrough)                                     |
|             returns a wrapped set of primitive editor(s) within             |
|             the DOM node(s) or a string $ (jQuery) selector                 |
|             also includes unselected choice slices if seethrough is true    |
|             the string argument will be interpreted if and only if a $      |
|             function is defined                                             |
|             note that if the DOM nodes passed as argument are already       |
|             inside an unselected slice, they will be included into the      |
|             set whatever the slice is selected or not                       |
|                                                                             |
|  Global functions:                                                          |
|    extend (target, source, proto)                                           |
|             utility method to merge objects                                 |
|                                                                             |
\*****************************************************************************/
(function (GLOBAL) {

  var settings = {}; // cached $axel settings
  var MAX = 10000;
  var TOTAL;

  function _raiseError ( errMsg ) {
    if (settings.error) {
      settings.error(errMsg);
    } else {
      alert(errMsg);
    }
  }

  function _nodeIter (n, accu, seethrough) {
    if (++TOTAL > MAX) {
      xtiger.cross.log('error', 'reached iteration limit (' + MAX + ')');
      return;
    }
    if (n.xttPrimitiveEditor) {
      accu.push(n.xttPrimitiveEditor);
    }
    if (n.firstChild) {
      _sliceIter(n.firstChild, n.lastChild, accu, seethrough);
    }
  }

	// origin is optional, it is the Choice editor from where a recursive call has been initiated
  function _sliceIter (begin, end, accu, seethrough, origin) {
    var cur = begin,
        go = true,
        c;
    if (TOTAL++ > MAX) {
      xtiger.cross.log('error', 'reached iteration limit (' + MAX + ')');
      return;
    }
    while (cur && go) {
      // manage repeats
      if (cur.startRepeatedItem && !seethrough) {
        if (cur.startRepeatedItem.getSize() === 0) { // nothing to serialize in repeater (min=0)
          // jumps to end of the repeater
          cur = cur.startRepeatedItem.getLastNodeForSlice(0);
          // in case cur has children, no need to serialize them as the slice is unselected (found on IE8)
          cur = cur.nextSibling;
          continue;
        }
      }
      if (cur.beginChoiceItem && (cur.beginChoiceItem != origin)) {
        c = cur.beginChoiceItem;
        if (c.items[c.curItem][0] !== c.items[c.curItem][1]) {
          _sliceIter(c.items[c.curItem][0], c.items[c.curItem][1], accu, seethrough, c);
        } else {
          // a choice slice starts and end on the same node
          _nodeIter(c.items[c.curItem][0], accu, seethrough);
        }
        cur = c.items[c.items.length - 1][1]; // sets cur to the last choice
        // xtiger.cross.log('debug', 'jump to end of last slice ' + cur.tagName ? cur.tagName : '#t');
      } else {
        // FIXME: we have an ambiguity <xt:use types="a b"><xt:use label="within_a"...
        // and <xt:use label="within_a"><xt:use types ="a b"....
        /// The current implementation will privilege First interpretation
        _nodeIter(cur, accu, seethrough); // FIXME:  first interpretation
      }
      if (cur === end) {
        go = false;
      }
      cur = cur.nextSibling;
    }
  }

  // Fake DOMLogger used to collect text content only (PCData)
  function _Logger () {
    this.stack = [];
  }

  _Logger.prototype = {

    discardNodeIfEmpty : function () {
    },

    write : function (text) {
      this.stack.push(text);
    },

    dump : function () {
      return this.stack.join(' ');
    },
    
    openTag : function (name) {
    },

    closeTag : function (name) {
    },

    reset : function () {
      this.stack = []
    }
  };

  function _WrappedSet (targets, seethrough) {
    this.seethrough = seethrough; // to show optional repetitions content
    this.targets = targets; // FIXME: should we make a copy ?
    this.first = targets[0];
  }

  _WrappedSet.prototype = {

    // lazy evaluation for wrapped set node list
    _list : function () {
      var i;
      // xtiger.cross.log('debug', 'reset wrapped set iteration counter (' + TOTAL + ')');
      TOTAL = 0;
      if (this.targets) {
        this.list = [];
        for (i = 0; i < this.targets.length; i++) {
          _nodeIter(this.targets[i], this.list, this.seethrough);
        }
        delete this.targets;
      }
      return this.list;
    },
    
    // FIXME: directly accept an XML document template as source input (cf. load)
    transform : function ( optTemplateUrl ) {
      if (settings.bundlesPath) {
        if (this.first) {
          var status = new xtiger.util.Logger(), editor;
          try { // load and transform template
            editor = optTemplateUrl ? (typeof optTemplateUrl === 'string' ? new xtiger.cross.loadDocument(optTemplateUrl, status) : optTemplateUrl) : document;
            if (editor) {
              form = new xtiger.util.Form(settings.bundlesPath);
              if (editor !== document) {
                form.setTemplateSource(editor);
                form.setTarget(this.first, true);
              } else {
                form.srcDoc = document;
                form.curDoc = document;
                form.srcForm = this.first;
              } 
              if (settings.enableTabGroupNavigation) {
                form.enableTabGroupNavigation();
              }
              form.transform(status);
            }
            if (status.inError()) {
              _raiseError(status.printErrors());
            } else {
              this.first.xttHeadLabel = form.getEditor().headLabel;
            }
          } catch (e) {
            _raiseError('exception ' + e.name + ' ' + e.message);
          }
        } else {
          _raiseError('cannot load template into empty wrapped set');
        }
      } else {
        _raiseError('missing "bundlesPath" to transform template');
      }
      return this;
    },
    
    xml : function () {
      var algo, accu, res = '';
      if (this.first) {
        accu = new xtiger.util.DOMLogger();
        algo = settings.serializer || xtiger.editor.Generator.prototype.defaultSerializer;
        if (algo) {
          algo.serializeData(this.first, accu, this.first.xttHeadLabel);
          res = accu.dump();
        } else {
          _raiseError('missing XML serializer algorithm');
        }
      }
      return res;
    },
    
    // Load XML data into the 1st node of the wrapped set
    // The source may be an XML string, a URL string, or an XML document object
    load : function ( source ) {
      var algo, dataSrc, status, input = source;
      if (this.first) {
        algo = settings.loader || xtiger.editor.Generator.prototype.defaultLoader;
        status = new xtiger.util.Logger();
        if (algo) {
          if (typeof source === "string") {
            if (source.replace(/^\s*/,'').charAt(0) === '<') { // assumes XML string
              input = source;
            } else { // assumes URL 
              input = xtiger.cross.loadDocument(source, status);
            }
          } else if (! source) {
            status.logError('undefined or missing XML data source')
          }
          if (input && !status.inError()) {
            dataSrc = new xtiger.util.DOMDataSource(input);
            algo.loadData(this.first, dataSrc);
          } else {
            _raiseError(status.printErrors());
          }
        } else {
          _raiseError('missing XML serializer algorithm');
        }
      } else {
        _raiseError('cannot load XML data source into empty wrapped set');
      }
      return this;
    },

    length : function () {
      return this._list().length;
    },

    get : function (rank) {
      return this._list()[rank];
    },

    clear : function (propagate) {
      var i, list = this._list();
      for (i = 0; i < list.length; i++) {
        list[i].clear(propagate);
      }
      return this;
    },

    update : function (data) {
      var i, list = this._list();
      for (i = 0; i < list.length; i++) {
        list[i].update(data);
      }
      return this;
    },

    text : function () {
      var i, list = this._list(), logger = new _Logger();
      for (i = 0; i < list.length; i++) {
        list[i].save(logger);
      }
      return logger.dump();
    },

    values : function () {
      var i, list = this._list(), logger = new _Logger(), res = [];
      for (i = 0; i < list.length; i++) {
        list[i].save(logger);
        res.push(logger.dump());
        logger.reset();
      }
      return res;
    },

    configure : function (option, value) {
      var i, list = this._list();
      for (i = 0; i < list.length; i++) {
        list[i].configure(option, value);
      }
      return this;
    },

    apply : function (func, toHandle) {
      var i, list = this._list();
      for (i = 0; i < list.length; i++) {
        func(toHandle ? list[i].getHandle() : list[i]);
      }
      return this;
    }
  };

  // Creates AXEL wrapped set function and global object
  var _axel = function axel_ws (nodes, seethrough, doc) {
    var target;
    if (typeof nodes === 'string') { // jQuery selector
      if (GLOBAL.jQuery) {
        target = $(nodes, doc || document).get();
      } else {
        xtiger.cross.log('warning', 'jQuery missing to interpet wrapped set selector "' + nodes  + '"');
        target = [];
      }
    } else if (Object.prototype.toString.call(nodes) === "[object Array]") { // array of DOM nodes
      target = nodes;
    } else if (GLOBAL.jQuery && (nodes instanceof GLOBAL.jQuery)) { // wrapped set
      target = nodes.get();
    } else if (nodes) {
      target = [ nodes ];
    } else {
      xtiger.cross.log('warning', 'empty wrapped set selector');
      target = [];
    }
    return new _WrappedSet(target, seethrough);
  };

  // Extends a target object's with the own properties and methods
  // of a source object whenever they are not already defined
  // if proto is true extends the target's prototype
  // if force is true extends even if already defined
  _axel.extend = function extend (target, source, proto, force) {
    if (proto) {
      for (var x in source){
        if (source.hasOwnProperty(x)) {
          if (force || (typeof target.prototype[x] === "undefined")) {
            target.prototype[x] = source[x];
          }
        }
      }
    } else {
      for (var x in source){
        if (source.hasOwnProperty(x)) {
          if (force || (typeof target[x] === "undefined")) {
            target[x] = source[x];
          }
        }
      }
    }
  };
  
  _axel.setup = function setup ( hash ) {
    _axel.extend(settings, hash);
  };
  
  // Limits max iteration counter
  _axel.setIterationLimit = function (nb) { MAX = nb; };

  GLOBAL.$axel = _axel;
}(window));
