(function(){
  function getElementXPath(element) {
    if (element && element.id)
      return '//*[@id="' + element.id + '"]';
    else
      return getElementTreeXPath(element);
  }

  function getElementTreeXPath(element) {
    var paths = [];

    // Use nodeName (instead of localName) so namespace prefix is included (if any).
    for (; element && element.nodeType == 1; element = element.parentNode) {
        var index = 0;
        for (var sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
            // Ignore document type declaration.
            if (sibling.nodeType == Node.DOCUMENT_TYPE_NODE)
                continue;

            if (sibling.nodeName == element.nodeName)
                ++index;
        }

        var tagName = element.nodeName.toLowerCase();
        var pathIndex = (index ? "[" + (index+1) + "]" : "");
        paths.splice(0, 0, tagName + pathIndex);
    }

    return paths.length ? "/" + paths.join("/") : null;
  }

  // Override function in given prototype to add a log statement 
  function logMethod(prototype, fname) {
    if (!(fname in prototype)) {
      console.warn("Warning: can't instrument " + prototype.constructor.name + '.' + fname);
      return;
    }
    var original =  prototype[fname];
    
    prototype[fname] = function() {
      // Want single line output but with optional callstack - abuse 'error' for this.
      // console.trace is also good but expands the callstack by default.'
      console.error(prototype.constructor.name + '::' + fname + ' invoked with ' + JSON.stringify(Array.prototype.slice.call(arguments)) + ' on node ' + getElementXPath(this));
      // debugger;
      original.apply(this, arguments);
    };
  }
  
  // Override property setter to add a log statement
  function logSetter(prototype, property) {
    var original = Object.getOwnPropertyDescriptor(prototype, property);
    if (!original) {
      console.warn("Warning: can't instrument " + prototype.constructor.name + '.' + property + 
        '. Chrome 43+ required (http://crbug.com/43394)');
      return;
    }
    
    Object.defineProperty(prototype, property, {
      set: function(v) {
        var changed = v !== this[property];
        console.error(prototype.constructor.name + '::' + property + ' set to:' + v + (changed?' (changed)':' (not changed)'));
        // debugger;
        if ('set' in original)
          original.set.call(this, v);
        else
          original.value = v;
      },
      get: function() {
        return 'get' in original ? original.get.call(this) : original.value;
      }
    });
  }
  
  for (var m of ['scrollBy', 'scrollTo', 'scroll'])
    logMethod(window, m);
 
  // Firefox only
  for (var m of ['scrollByLines', 'scrollByPages'])
    if (m in window)
      logMethod(window, m);
 
  for (var p of ['scrollX', 'scrollY'])
    logSetter(window, p);
  
  for (var m of ['scrollIntoView', 'scrollIntoViewIfNeeded', 'focus'])
    logMethod(Element.prototype, m);
  
  for (var p of ['scrollTop', 'scrollLeft'])
    logSetter(Element.prototype, p);
})();