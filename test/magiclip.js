var THREE = require('./three.js');
var Quaternion = THREE.Quaternion;
var Vector2 = THREE.Vector2;
var Vector3 = THREE.Vector3;
var SerialPort = require('serialport');
var fs = require('fs');
var net = require('net');
var WII_ADDRESS = '/var/tmp/wii.sock';

var width = 1024, height = 768;

// unix socket
// wii ir dots 
var dot_history = [[],[],[],[]];
function dot_score(dot, dotlist) {
	var score = 0;
	for (var i=0; i<dotlist.length; ++i) {
		var dot2 = dotlist[i];
		score += dot.pos2d.distanceTo(dotlist[i].pos2d);
	}
	return score;
}

function defish2(x, y, zoom) {
	// center
	var midx = width / 2;
	var midy = height / 2;

	
	var r = Math.floor(Math.sqrt(width*width + height*height) / 2);

	var dist = r * 2 / 2.7;
	var r2 = r*r;

	var nx = x - midx;
	var ny = y - midy;

	var d2 = nx*nx + ny*ny;
	var sx, sy;

	if (d2 <= r2) {
		var d = Math.floor(Math.sqrt(d2));
		var radius = d / dist;
		var theta = Math.tan(radius) / radius;
		sx = Math.floor(midx + theta * nx / zoom);
		sy = Math.floor(midy + theta * ny / zoom);

		/*
		if (sx >= width) {
			sx = width;
		}
		if (sx < 0) {
			sx = 0;
		}
		if (sy >= height) {
			sy = height;
		}
		if (sy < 0) {
			sy = 0;
		}
		*/
	} else {
		sx = x;
		sy = y;
	}

	return new Vector2(sx, sy);
}


var server = net.createServer(function(sock) {
	sock.on('data', function(data){
		try {
			var dot_raw = JSON.parse(data.toString());
			var dots = [], scores = [], slots = [];
			for (var i=0; i<dot_raw.length; i+=3) {
				var dot = {pos2d:defish2(dot_raw[i],dot_raw[i+1],1.5), size:dot_raw[i+2], guess:false};
				var score = [];

				// dot against history, find scores
				for (var j=0; j<4; j++) {
					score.push(dot_score(dot, dot_history[j]));
				}
				dots.push(dot);
				scores.push(score);
			}

			do {
				var min = 1e10;
				var who = 0;
				var slot = 0;
				for (var i=0; i<scores.length; ++i) {
					var score = scores[i];
					for (var j=0; j<score.length; ++j) {
						var s = score[j];
						if (s < min) {
							who = i;
							slot = j;
							min = s;
						}
					}
				}
				slots.push(slot);
				dot_history[slot].push(dots[who]);
				dots.splice(who,1);	// skip this dot
				scores.splice(who,1);
				for (var i=0; i<scores.length; ++i) {
					scores[i][slot] = 1e11;	// skip this slot
				}
			} while (scores.length > 0);
			
			for (var i=0; i<4; i++) {
				var history = dot_history[i];
				if (history.length > 10) {
					history.shift();
				}
				if (history.length > 0 && slots.indexOf(i) === -1) {
					history[history.length-1].guess = true;
				}
			}
		} catch (e){
		}
	});
});

server.on('error', function(e){
	if (e.code == 'EADDRINUSE') {
		var testsock = new net.Socket();
		testsock.on('error', function(e) { // handle error trying to talk to server
			if (e.code == 'ECONNREFUSED') {  // No other server listening
				fs.unlinkSync(WII_ADDRESS);
				server.listen(WII_ADDRESS, function() { //'listening' listener
					console.log('server recovered');
				});
			}
		});
		testsock.connect({path: WII_ADDRESS}, function() { 
			console.log('Server running, giving up...');
			process.exit();
		});
	}
});

server.listen(WII_ADDRESS);

// serial ports
// head & clip orientations
var qclip = new Quaternion();
var qhead = new Quaternion();
var qrel = new Quaternion();
var clip_angle = 0;
var irMask = new Buffer(1);

irMask[0] = 0xff;

SerialPort.list(function(err,ports){
	ports.forEach(function(port_info){
		if (port_info.productId == 0x7523) {	// arduino?
			var port = new SerialPort(port_info.comName, {baudRate:115200, parser: SerialPort.parsers.byteDelimiter([13,10])});

			port.on('open', function(){
				console.log('port',port_info.comName,'opened');
			});

			port.on('data', function(data){
				/*
				 * data[0] = '$';
				 * data[1] = PACKET_QUAT;
				 * data[2] = CLIP(1)/HEAD(2);
				 * 
				 * data[3] = (char)(quat[0] >> 24);
				 * data[4] = (char)(quat[0] >> 16);
				 * data[5] = (char)(quat[0] >> 8);
				 * data[6] = (char)quat[0];
				 *
				 * data[7] = (char)(quat[1] >> 24);
				 * data[8] = (char)(quat[1] >> 16);
				 * data[9] = (char)(quat[1] >> 8);
				 * data[10] = (char)quat[1];
				 *
				 * data[11] = (char)(quat[2] >> 24);
				 * data[12] = (char)(quat[2] >> 16);
				 * data[13] = (char)(quat[2] >> 8);
				 * data[14] = (char)quat[2];
				 *
				 * data[15] = (char)(quat[3] >> 24);
				 * data[16] = (char)(quat[3] >> 16);
				 * data[17] = (char)(quat[3] >> 8);
				 * data[18] = (char)quat[3];
				 *
				 * data[21] = 0;//(char)(angle - 470);
				 * data[22] = '\r';
				 * data[23] = '\n';
				 */
				if (data.length === 24) {	 
					var buf = new Buffer(data);
					var q = new Quaternion(buf.readFloatBE(7), buf.readFloatBE(15), -buf.readFloatBE(11), buf.readFloatBE(3));

					if (data[2] == 1) {	// clip
						qclip.copy(q);
						clip_angle = data[21] / 255;
						port.write(irMask);
					} else if (data[2] == 2) {	// head
						qhead.copy(q);
					}

					var qh = qhead.clone();
					qrel.multiplyQuaternions(qh.conjugate(), qclip);
				}
			});
		}
	});
});

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(120, width/height, 0.1, 1000);

var renderer = new THREE.WebGLRenderer({
	width: width,
	height: height
});

var geometry = new THREE.BoxGeometry(1, 2, 3);
var material = new THREE.MeshBasicMaterial();
var cube = new THREE.Mesh(geometry, material);
cube.visible = false;
scene.add(cube);
var wireCube = new THREE.BoxHelper(cube);
scene.add(wireCube);

var colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];

//LED
var leds = [];
var led_geom = new THREE.BoxGeometry(0.1,0.1,0.1);
var led_pos = [new Vector3(-1, 0, -1), new Vector3(-1, 0, 1), new Vector3(1, -1, 0), new Vector3(1, 1, 0)];
for (var i=0; i<4; i++) {
	var led = new THREE.Mesh(led_geom, new THREE.MeshBasicMaterial({wireframe:true}));
	leds.push(led);
	led.scale.set(1.5,1.5,1.5);
	led.position.copy(led_pos[i]);
	led.material.color.setHex(colors[i]);
	wireCube.add(led);

	/*
	wireLed.visible = true;
	scene.add(wireLed);
	wireLed.position.set(led_pos[i]);
	wireLed.material.color.setHex(colors[i]);
	*/
}

camera.position.z = 5;

// dots
var dots = [];
var dot_geom = new THREE.BoxGeometry(0.1,0.1,0.1);
for (var i=0; i<4; i++) {
	var dot = new THREE.Mesh(dot_geom, new THREE.MeshBasicMaterial());
	dot.visible = false;
	dot.material.color.setHex(colors[i]);
	scene.add(dot);
	dots.push(dot);
}

function test_update_ir_dots () {
	var avgx = 0, avgy = 0, cnt = 0;
	var miny = 1e10, maxy = -1e10;
	for (var i=0; i<4; i++) {
		var history = dot_history[i];
		if (history.length > 0) {
			var d = history[history.length-1];
			var dot = dots[i];
			dot.visible = true;
			var x = (d.pos2d.x/1024-0.5)*14;
			var y = (0.5-d.pos2d.y/768)*10;
			dot.position.set(x, y, 0);
			if (d.guess) {
				dot.scale.set(0.5,0.5,0.5);
			} else {
				dot.scale.set(d.size*3, d.size*3, d.size*3);
			}
			avgx += x;
			avgy += y;
			if (y < miny) {
				miny = y;
			}
			if (y > maxy) {
				maxy = y;
			}
			++cnt;
		}
	}

	if (cnt > 0) {
		avgx /= cnt;
		avgy /= cnt;
		cube.position.set(avgx, avgy, 0);
		var h = maxy - miny;
		if (h < 1) h = 1;
		cube.scale.set(h/2,1,1);
	}

	for (var i=cnt; i<4; i++) {
		dots[i].visible = false;
	}
}

var render = function () {
	THREE.requestAnimationFrame(render);

	cube.setRotationFromQuaternion(qrel);

	test_update_ir_dots();

	renderer.render(scene, camera);
};

render();

