var THREE = require('./three.js');
var Quaternion = THREE.Quaternion;
var Vector2 = THREE.Vector2;
var Vector3 = THREE.Vector3;
var SerialPort = require('serialport');
var fs = require('fs');
var net = require('net');
var WII_ADDRESS = '/var/tmp/wii.sock';

var width = 1024, height = 768;

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

function defish(x, y, zoom) {
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

// unix socket
var server = net.createServer(function(sock) {
	sock.on('data', function(data){
		try {
			var dot_raw = JSON.parse(data.toString());
			var dots = [], scores = [], slots = [];
			for (var i=0; i<dot_raw.length; i+=3) {
				var dot = {pos2d:defish(dot_raw[i],dot_raw[i+1],1.5), size:dot_raw[i+2], guess:false};
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
var gclip = new Vector3();
var aclip = new Vector3();

var qhead = new Quaternion();
var ghead = new Vector3();
var ahead = new Vector3();

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
				  out[0] = '$';
				  out[1] = PACKET_QUAT;
				  out[2] = HEAD;

				  // quat
				  out[3] = (char)(quat[0] >> 24);
				  out[4] = (char)(quat[0] >> 16);
				  out[5] = (char)(quat[0] >> 8);
				  out[6] = (char)quat[0];
				  out[7] = (char)(quat[1] >> 24);
				  out[8] = (char)(quat[1] >> 16);
				  out[9] = (char)(quat[1] >> 8);
				  out[10] = (char)quat[1];
				  out[11] = (char)(quat[2] >> 24);
				  out[12] = (char)(quat[2] >> 16);
				  out[13] = (char)(quat[2] >> 8);
				  out[14] = (char)quat[2];
				  out[15] = (char)(quat[3] >> 24);
				  out[16] = (char)(quat[3] >> 16);
				  out[17] = (char)(quat[3] >> 8);
				  out[18] = (char)quat[3];

				  // gyro
				  out[19] = (char)(gyro[0] >> 24);
				  out[20] = (char)(gyro[0] >> 16);
				  out[21] = (char)(gyro[0] >> 8);
				  out[22] = (char)gyro[0];
				  out[23] = (char)(gyro[1] >> 24);
				  out[24] = (char)(gyro[1] >> 16);
				  out[25] = (char)(gyro[1] >> 8);
				  out[26] = (char)gyro[1];
				  out[27] = (char)(gyro[2] >> 24);
				  out[28] = (char)(gyro[2] >> 16);
				  out[29] = (char)(gyro[2] >> 8);
				  out[30] = (char)gyro[2];

				  // linear accel
				  out[31] = (char)(accel[0] >> 24);
				  out[32] = (char)(accel[0] >> 16);
				  out[33] = (char)(accel[0] >> 8);
				  out[34] = (char)accel[0];
				  out[35] = (char)(accel[1] >> 24);
				  out[36] = (char)(accel[1] >> 16);
				  out[37] = (char)(accel[1] >> 8);
				  out[38] = (char)accel[1];
				  out[39] = (char)(accel[2] >> 24);
				  out[40] = (char)(accel[2] >> 16);
				  out[41] = (char)(accel[2] >> 8);
				  out[42] = (char)accel[2];

				  // angle
				  out[43] = 0;

				  // done
				  out[44] = '\r';
				  out[45] = '\n';
				*/
				if (data.length === 46) {	 
					var buf = new Buffer(data);
					var q = new Quaternion(buf.readFloatBE(7), buf.readFloatBE(15), -buf.readFloatBE(11), buf.readFloatBE(3));
					var g = new Vector3(buf.readFloatBE(19), buf.readFloatBE(27), -buf.readFloatBE(23));
					var a = new Vector3(buf.readFloatBE(31), buf.readFloatBE(39), -buf.readFloatBE(35));

					if (data[2] == 1) {	// clip
						qclip.copy(q);
						gclip.copy(g);
						aclip.copy(a);
						clip_angle = data[43] / 255;
						port.write(irMask);
					} else if (data[2] == 2) {	// head
						qhead.copy(q);
						ghead.copy(g);
						ahead.copy(a);
					}

					var qh = qhead.clone();
					qrel.multiplyQuaternions(qh.conjugate(), qclip);
				}
			});
		}
	});
});

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(130, width/height, 0.1, 1000);

var renderer = new THREE.WebGLRenderer({
	width: width,
	height: height
});

var geometry = new THREE.BoxGeometry(2, 2, 3);
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
var led_pos = [new Vector3(-2, 0, -1), new Vector3(-2, 0, 1), new Vector3(2, -1, 0), new Vector3(2, 1, 0)];
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

function get_screen_coord(obj){
	var widthHalf = width / 2, heightHalf = height / 2;

	var vector = new Vector3();
	vector.setFromMatrixPosition( obj.matrixWorld );
	vector.project(camera);

	vector.x = ( vector.x * widthHalf ) + widthHalf;
	vector.y = - ( vector.y * heightHalf ) + heightHalf;	

	return new Vector2(vector.x, vector.y);
}

function update_dots() {
	// first guess
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
//		var h = maxy - miny;
//		if (h < 1) h = 1;
//		cube.scale.set(h/2,1,1);

		// second guess
		cube.updateMatrixWorld();

		// get screen pos of dots
		var pos_list = [];
		for (var i=0; i<dots.length; i++) {
			pos_list.push(get_screen_coord(dots[i]));
		}

		// find marching dots

		// 1. march position

		// 2. march edge
		var edge1 = new Vector2();
		var edge2 = new Vector2();
		edge1.subVectors(pos_list[1], pos_list[0]);
		edge2.subVectors(pos_list[3], pos_list[2]);

		// moves them there
	}

	for (var i=cnt; i<4; i++) {
		dots[i].visible = false;
	}
}

var render = function () {
	THREE.requestAnimationFrame(render);

	cube.setRotationFromQuaternion(qrel);

	update_dots();

	renderer.render(scene, camera);
};

render();

