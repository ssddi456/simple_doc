var swig = require('swig');
var fs = require('fs');
var path = require('path');


var tpl = './swig.md.html';
var tmpl  = swig.compileFile(path.join(__dirname,tpl));

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
fs.writeFileSync(path.join(__dirname,'test_inline_jade.md' ), tmpl(datas), 'utf8' );