var jade = require('jade');
var pcompiler = jade.Compiler;
var compiler = function() {
  pcompiler.apply( this, arguments );
}

var compiler_p = compiler.prototype = Object.create(pcompiler.prototype);

compiler_p.visitBlock = function( block ) {
                          var len = block.nodes.length;
                          var escape = this.escape;
                          var pp = this.pp;

                          // Pretty print multi-line text
                          if (pp && len > 1 
                            && !escape 
                            && block.nodes[0].isText 
                            && block.nodes[1].isText
                          ){
                            this.prettyIndent(1, true);
                          }

                          for (var i = 0; i < len; ++i) {
                            // Pretty print text
                            if (pp && i > 0 
                              && !escape 
                              && block.nodes[i].isText 
                              && block.nodes[i-1].isText
                            ){
                              this.prettyIndent(1, false);
                            }

                            this.visit(block.nodes[i]);
                            // Multiple text nodes are separated by newlines
                            if ( block.nodes[i].isText ){
                              this.buffer('\n');
                            }
                          }
                        };
compiler_p.visitText = function(text){
  var val = text.val;
  var md_title = val.match(/^\s*#+\s/);
  if( md_title ){
    this.buffer('\n');
  }
  this.buffer(val, true);
  if( md_title ){
    this.buffer('\n');
  }
};
module.exports = compiler;