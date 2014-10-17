var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var jade = require('jade');
var commander = require('commander');

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

function get_docs_form_files ( project_root, done ){
  var cp = child_process.spawn('jsdoc.cmd',[
    '-c',  path.join( __dirname, 'conf.json'),
    '--verbose'
  ],{
    cwd : project_root
  });

  var buffers = [];
  var errors = [];
  cp.stdout.on('data',function( truck ) {
    buffers.push(truck);
  });

  cp.stderr.pipe( process.stderr );

  cp.on('error',function( e ) {
    errors.push ( e ); 
  });

  cp.on('exit',function( code ) {
    buffers = Buffer.concat(buffers);
    if( code ){
      done(errors);
      return;
    }
    buffers = buffers.toString()
                .replace(/^Parsing.*$/gm,'')
                .replace(/^Finished.*$/gm,'');

    var datas = JSON.parse(buffers.trim())
                  .filter(function( data ) {
                    return !data.undocumented;
                  });
    done(null, datas);
  });
}

function overview(){
  try{
    return JSON.parse(fs.readFileSync(path.join(project_root,'package.json'),'utf8'))
  } catch(e){
    return {};
  }
}

function parse_docs ( datas, package_info ){
  // console.log( JSON.stringify( datas, null, 2 ) );
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
      // console.log( 'replace callback');
      callbacks.forEach(function(callback,idx){
        if(callback.length){
          // console.log( callback );
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
      // console.log( member );   
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
/**
 * output doc page
 * @param  {parsed_jsdoc_data} datas
 * @param  {string} package_info 
 * @param  {object} options      ext : set readme ext, default is html
 *                               md  : if output gfm style md, if no ext has been given,
 *                                     will readme file's ext will be md
 */
function output_page ( datas, package_info, options ){
  var readme_ext = '.html';
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
  var tmpl;
  if( options.md ){
    tmpl = jade.compile(fs.readFileSync( path.join(__dirname,'doc.md.jade')),{
      compiler : require('./libs/compiler_for_md'),
      compileDebug : true
    });
    readme_ext = '.md';
  } else {
    tmpl = jade.compile(fs.readFileSync( path.join(__dirname,'doc.jade')));
  }

  fs.writeFileSync( path.join(options.project_root,'README' + (options.ext || readme_ext) ),  tmpl(datas),  'utf8');
}



module.exports = {
  get_docs_form_files : get_docs_form_files,
  parse_docs          : parse_docs,
  output_page         : output_page
}

// condition
if( require.main == module ){ 
  // do
  commander
    .option('--md', 'output md doc')
    .parse(process.argv);
  var project_root = process.cwd();
  get_docs_form_files(project_root,function( err, datas ){
    var view_data = parse_docs( datas );
    var package_info = overview();
    commander.project_root = project_root;
    output_page ( view_data, package_info, commander );
  })
}
