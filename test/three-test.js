var THREE = require('./three.js');
var w = 1024, h = 768;
var renderer = new THREE.WebGLRenderer({width:w, height:h});
THREE.document.setTitle('test');

var scene = new THREE.Scene();

var camera = new THREE.PerspectiveCamera(
		63,             // Field of view
		56 / 38,      // Aspect ratio
		2,            // Near plane
		1000           // Far plane
		);
//camera.position.set( 0, 31, 0 );
//camera.up.set(0,0,1);
//camera.lookAt( scene.position );

camera.position.set( -2.7, 21.5, 3.5 );
camera.up.set(0,-0.13,0.99);
camera.lookAt(new THREE.Vector3(0,0,1));
var geometry = new THREE.BoxGeometry( 24, 1, 17.6 );
var material = new THREE.MeshBasicMaterial( { color: 0xFF0000 } );
var mesh = new THREE.Mesh( geometry, material );
scene.add( mesh );

//var light = new THREE.PointLight( 0xFFFF00 );
//light.position.set( 10, 0, 10 );
//scene.add( light );

//renderer.setClearColor( 0xdddddd, 1);

var render = function () {
	THREE.requestAnimationFrame(render);
	renderer.render(scene, camera);
};

render();

