var jade = require('jade');
var fs = require('fs');
var path = require('path');

var tpl   = './jade_inline.jade';
var datas = {
  api : {
    params : [{
      name        : '123asd', 
      description : '123asd', 
      type        : {
        names : ['123','123']
      } 
    },{
      name        : '123asd', 
      description : '123asd', 
      type        : {
        names : ['123','123']
      } 
    }]
  }
};

function wrap_function ( func_a, func_b ){
  return function() {
    func_a.apply(this,arguments);
    return func_b.apply(this,arguments);
  }
}

var compiler_p = jade.Compiler.prototype;
compiler_p.compile =  wrap_function(function() {
                        this.dynamicMixins = true;
                      },compiler_p.compile);

compiler_p.visitBlock = function( block ) {
                          var len = block.nodes.length
                            , escape = this.escape
                            , pp = this.pp

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
                        }

var tmpl  = jade.compile(
              fs.readFileSync( path.join(__dirname,tpl)),{
                client : true,
                compiler : jade.Compiler
              });

fs.writeFileSync( 
  path.join(__dirname,'test_inline_jade.md' ),
  tmpl(datas),
  'utf8');