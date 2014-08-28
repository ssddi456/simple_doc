var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var jade = require('jade');


// jscode will output doc ast here
// 
// our document should include :
// public apis
//   params
//     vars
//     callbacks
//   descriptions
//   examples
// global types 
//   objects


var project_root = process.cwd();
var readme_ext = '.md';

var cp = child_process.spawn('jsdoc.cmd',[
  '-c',  path.join( __dirname, 'conf.json'),
  '--verbose'
],{
  cwd : project_root
});

var buffers = [];
cp.stdout.on('data',function( truck ) {
  buffers.push(truck);
});

cp.stderr.pipe( process.stderr );

cp.on('error',function( e ) {
  console.log( e );
});

cp.on('exit',function( code ) {
  buffers = Buffer.concat(buffers);
  if( code ){
    console.log( buffers );
    return;
  }
  buffers = buffers.toString()
              .replace(/^Parsing.*$/gm,'')
              .replace(/^Finished.*$/gm,'');

  var datas = JSON.parse(buffers.trim())
                .filter(function( data ) {
                  return !data.undocumented;
                });
  var view_data = parse_docs( datas );
  var package_info = overview();
  output_page ( view_data, package_info );
});

function overview(){
  try{
    return JSON.parse(fs.readFileSync(path.join(project_root,'package.json'),'utf8'))
  } catch(e){
    readme_ext = '.html';
    return {};
  }
}

function parse_docs ( datas, package_info ){
  console.log( JSON.stringify( datas, null, 2 ) );
  var indexs =  datas.filter(function( node ) {
                  return node.kind == 'package';
                });

  var apis   =  datas.filter(function( node ){
                  return node.kind == 'function' 
                      && node.scope != 'instance'
                      && node.access!= 'private';
                });
  var klass  =  datas.filter(function( node ) {
                  return node.kind == 'class';
                });
  var member =  datas.filter(function( node ) {
                  return node.scope == 'instance';
                });
  var types  =  datas.filter(function( node ){
                  switch(node.kind){
                    case 'typedef':
                    case 'mixin'  :
                      if( node.scope!='inner'){
                        return true; 
                      }
                  }
                });

  function find_node_by_name(name, arr ){
    return arr.filter(function( node ){
      return node.name == name || node.longname == name;
    })[0]
  }

  function resolve_mixins ( node, arr ){
    if(node.mixins_resolved){
      return;
    }

    if( node.mixes && node.mixes.length ){
      var mixins =  arr.filter(function(type){
                      return node.mixes.indexOf( type.name ) != -1;
                    });
      if( mixins.length ){
        mixins
          .forEach(function( node ){
            !node.mixins_resolved && resolve_mixins(node,arr);
          });
        mixins
          .forEach(function( mixin ){
            var props = node.properties = node.properties || [];
            mixin.properties.forEach(function( property ) {
              if( !props.filter(function( prop ) {
                    return prop.name == property.name;
                  }).length
              ){
                props.push( property );
              }
            })
          });
      }
      node.mixins_resolved = true;
    }
  }

  function resolve_callbacks( node, arr ){
    if( !node.params ){
      return;
    }
    
    var callbacks = node.params.map(function( param ){
                      return param.type 
                          ? param.type.names.map(function( name ){
                              return find_node_by_name(name, datas);
                            }).filter(function(type){
                              
                              return type && type.type && type.type.names.indexOf('function') != -1;
                            })
                          : [];
                    });
    if( callbacks.filter(function( param_type ){
          return param_type.length;
        }).length 
    ){
      console.log( 'replace callback');
      callbacks.forEach(function(callback,idx){
        if(callback.length){
          console.log( callback );
          node.params[idx] = callback[0];
        }
      });
      node.has_callback = true;
    }
  }
  function resolve_scope( api ){
    if( api.longname.match('<anonymous>~') ){
      api.longname = api.longname
                      .replace('<anonymous>~','');
                      // function() {
                      //   return path.basename( api.meta.filename ) + '.'
                      // });
    }
  }
  function resolve_methods ( type ) {
    var properties = [];
    var methods    = [];
    (type.properties || []).forEach(function( property ) {
      if( property.type.names.indexOf('function') != -1 ){
        methods.push(property);
      } else {
        properties.push(property);
      }
    });
    type.properties = properties;
    type.methods = methods;
  }
  apis.forEach(function( api, idx, arr ){
    resolve_callbacks( api, arr);

    resolve_scope( api );
  });


  member.forEach(function( member, idx, arr ){
    var _klass = klass.filter(function( klass ) {
                  return klass.longname == member.memberof
                      || klass.name     == member.memberof;
                 })[0];
    if( _klass ){
      var properties = _klass.properties = 
            _klass.properties || [];
      properties.push(member);
      member.type = member.type || {names:['function']}
    } else{
      console.log( member );      
    };
  });

  types = types.concat( klass );
  types.forEach(function( type, idx, arr ){
    resolve_mixins( type, arr );
  });
  types.forEach(function( type ) {
    resolve_scope( type );
    resolve_methods( type );
  });

  return {
    nodes : apis,
    types : types
  };
}

function output_page ( datas, package_info ){
  datas.get_type_id = function( name ){
                        var arr_type = name.match(/Array\.<([^\)]+)>/);
                        if( arr_type ){
                          name = arr_type[1];
                        }
                        if( datas.types.filter(function( type ){
                              return type.name == name;
                            }).length
                        ){
                          return name;
                        }
                      };

  datas.package_info = package_info;

  var tmpl = jade.compile(fs.readFileSync( path.join(__dirname,'doc.jade')));

  fs.writeFileSync( path.join(project_root,'README' + readme_ext ),  tmpl(datas),  'utf8');
}