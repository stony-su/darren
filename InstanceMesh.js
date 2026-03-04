/*
  InstanceMesh - Creates instanced geometry for efficient rendering
  Compatible with older Three.js versions that don't have InstancedBufferGeometry
  
  Uses the same approach as Snake.js - duplicates geometry per instance
*/

function InstanceMesh( geometry , attributes , uniforms , vs , fs , params ){

  var params = params || {};
  
  // Get the number of instances from the lookup attribute
  var numInstances = 0;
  for( var propt in attributes ){
    if( attributes[propt].data ){
      var type = attributes[propt].type;
      var length = 1;
      if( type == "v2" ){ length = 2; }
      if( type == "v3" ){ length = 3; }
      if( type == "v4" ){ length = 4; }
      numInstances = attributes[propt].data.length / length;
      break;
    }
  }

  var geo = this.createGeometry( geometry , attributes, numInstances );

  var attr = {};

  for( var propt in attributes ){
    attr[ propt ] = {
      type:   attributes[ propt ].type,
      value:  null
    };
  }

  var material = new THREE.ShaderMaterial({
  
    uniforms: uniforms,
    attributes: attr,
    vertexShader:   vs,
    fragmentShader: fs,
    side:         params.side         || THREE.DoubleSide,
    transparent:  params.transparent  || false,
    blending:     params.blending     || THREE.NormalBlending,
  
  });

  var body = new THREE.Mesh( geo , material );

  return body;

}


InstanceMesh.prototype.createGeometry = function( geometry, attributes, numInstances ){

  // Convert geometry to face/vertex arrays if needed
  var basePositions, baseNormals;
  var numFaces;
  
  if( geometry instanceof THREE.BufferGeometry ){
    basePositions = geometry.attributes.position.array;
    baseNormals = geometry.attributes.normal.array;
    numFaces = basePositions.length / 9; // 3 verts * 3 components
  } else {
    // Regular THREE.Geometry
    numFaces = geometry.faces.length;
    basePositions = new Float32Array( numFaces * 3 * 3 );
    baseNormals   = new Float32Array( numFaces * 3 * 3 );

    for( var j = 0; j < numFaces; j++ ){
      var index = j * 3;
      var face = geometry.faces[j];

      var p1 = geometry.vertices[ face.a ];
      var p2 = geometry.vertices[ face.b ];
      var p3 = geometry.vertices[ face.c ];

      var n1 = face.vertexNormals[0] || face.normal; 
      var n2 = face.vertexNormals[1] || face.normal; 
      var n3 = face.vertexNormals[2] || face.normal; 
   
      basePositions[ index * 3 + 0 ] = p1.x;
      basePositions[ index * 3 + 1 ] = p1.y;
      basePositions[ index * 3 + 2 ] = p1.z;
      basePositions[ index * 3 + 3 ] = p2.x;
      basePositions[ index * 3 + 4 ] = p2.y;
      basePositions[ index * 3 + 5 ] = p2.z;
      basePositions[ index * 3 + 6 ] = p3.x;
      basePositions[ index * 3 + 7 ] = p3.y;
      basePositions[ index * 3 + 8 ] = p3.z;

      baseNormals[ index * 3 + 0 ] = n1.x;
      baseNormals[ index * 3 + 1 ] = n1.y;
      baseNormals[ index * 3 + 2 ] = n1.z;
      baseNormals[ index * 3 + 3 ] = n2.x;
      baseNormals[ index * 3 + 4 ] = n2.y;
      baseNormals[ index * 3 + 5 ] = n2.z;
      baseNormals[ index * 3 + 6 ] = n3.x;
      baseNormals[ index * 3 + 7 ] = n3.y;
      baseNormals[ index * 3 + 8 ] = n3.z;
    } 
  }

  var vertsPerInstance = numFaces * 3;
  var totalVerts = vertsPerInstance * numInstances;
  
  console.log('InstanceMesh: ' + numInstances + ' instances, ' + totalVerts + ' total vertices');

  // Create arrays for all instances
  var positions = new Float32Array( totalVerts * 3 );
  var normals   = new Float32Array( totalVerts * 3 );

  // Create lookup attribute array (expanded per vertex)
  var lookupSize = Math.ceil( Math.sqrt( numInstances ) );
  var lookups = new Float32Array( totalVerts * 2 );

  // Duplicate geometry for each instance
  for( var i = 0; i < numInstances; i++ ){
    
    // Calculate lookup UV for this instance
    var y = (Math.floor( i / lookupSize )) / lookupSize;
    var x = (i - ( (Math.floor( i / lookupSize )) * lookupSize )) / lookupSize;
    var a = 0.5 / lookupSize;
    var lookupX = x + a;
    var lookupY = y + a;

    for( var j = 0; j < vertsPerInstance; j++ ){
      var srcIndex = j * 3;
      var dstIndex = (i * vertsPerInstance + j) * 3;
      var lookupIndex = (i * vertsPerInstance + j) * 2;

      // Copy position
      positions[ dstIndex + 0 ] = basePositions[ srcIndex + 0 ];
      positions[ dstIndex + 1 ] = basePositions[ srcIndex + 1 ];
      positions[ dstIndex + 2 ] = basePositions[ srcIndex + 2 ];

      // Copy normal
      normals[ dstIndex + 0 ] = baseNormals[ srcIndex + 0 ];
      normals[ dstIndex + 1 ] = baseNormals[ srcIndex + 1 ];
      normals[ dstIndex + 2 ] = baseNormals[ srcIndex + 2 ];

      // Set lookup UV (same for all verts in this instance)
      lookups[ lookupIndex + 0 ] = lookupX;
      lookups[ lookupIndex + 1 ] = lookupY;
    }
  }

  // Create BufferGeometry (compatible with older Three.js)
  var geo = new THREE.BufferGeometry();

  geo.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
  geo.addAttribute( 'normal',   new THREE.BufferAttribute( normals,   3 ) );
  geo.addAttribute( 'lookup',   new THREE.BufferAttribute( lookups,   2 ) );

  return geo;

}
