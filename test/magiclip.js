var THREE = require('./three.js');
var Quaternion = THREE.Quaternion;
var Vector2 = THREE.Vector2;
var Vector3 = THREE.Vector3;
var SerialPort = require('serialport');
var fs = require('fs');
var net = require('net');
var WII_ADDRESS = '/var/tmp/wii.sock';
var regression = require('regression');

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

function defish(x, y) {
	var strength = 1.95;
	var zoom = 1.5;

	// center
	var midx = width / 2;
	var midy = height / 2;

	
	var r = Math.floor(Math.sqrt(width*width + height*height) / 2);

	var dist = r * 2 / strength;
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
				var dot = {pos2d:defish(dot_raw[i],dot_raw[i+1]), size:dot_raw[i+2], guess:false};
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
//						clip_angle = data[43] / 255;
//						port.write(irMask);
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
var camera = new THREE.PerspectiveCamera(63, 56/38, 0.1, 1000);

var renderer = new THREE.WebGLRenderer({
	width: width,
	height: height
});
THREE.document.setTitle('magiclip');

var CUBE_LENGTH = 19.2;
var RANGE = 40;
var geometry = new THREE.BoxGeometry(CUBE_LENGTH, 0.8, 0.8);
var material = new THREE.MeshBasicMaterial();
var cube = new THREE.Mesh(geometry, material);
cube.visible = false;
cube.position.set(0,0,-31.8);
scene.add(cube);
var wireCube = new THREE.BoxHelper(cube);
scene.add(wireCube);

var colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];
var sim_colors = [0x880000, 0x008800, 0x000088, 0x888800];

//LED
var leds = [];
var led_geom = new THREE.BoxGeometry(1,1,1);
var led_pos = [new Vector3(-9.6, 0, 0), new Vector3(-3.2, 0, 0), new Vector3(3.2, 0, 0), new Vector3(9.6, 0, 0)];
for (var i=0; i<4; i++) {
	var led = new THREE.Mesh(led_geom, new THREE.MeshBasicMaterial({wireframe:true}));
	leds.push(led);
//	led.scale.set(1.5,1.5,1.5);
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

camera.position.set(0,0,1);
camera.up.set(0,0,1);

// dots
var dots = [];
var sim_dots = [];
var dot_geom = new THREE.BoxGeometry(0.01,0.01,0.01);
var sim_dot_geom = new THREE.BoxGeometry(1,1,1);
for (var i=0; i<4; i++) {
	var dot = new THREE.Mesh(dot_geom, new THREE.MeshBasicMaterial());
	var sim_dot = new THREE.Mesh(sim_dot_geom, new THREE.MeshBasicMaterial());
	dot.visible = false;
	sim_dot.visible = true;
	dot.material.color.setHex(colors[i]);
	sim_dot.material.color.setHex(sim_colors[i]);
	scene.add(dot);
	scene.add(sim_dot);
	dots.push(dot);
	sim_dots.push(sim_dot);
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

function world_to_screen (w) {
	var widthHalf = width / 2, heightHalf = height / 2;

	var vector = w.clone();
	vector.project(camera);

	vector.x = ( vector.x * widthHalf ) + widthHalf;
	vector.y = - ( vector.y * heightHalf ) + heightHalf;	

	return new Vector2(vector.x, vector.y);

}

function screen_to_world (s) {
	var vector = new THREE.Vector3();
	vector.set(s.x/width*2-1, 1-s.y/height*2, 0.5);
	vector.unproject( camera );
	var dir = vector.sub( camera.position ).normalize();
	var distance = - camera.position.z / dir.z;
	var pos = camera.position.clone().add( dir.multiplyScalar( distance ) );
	return pos;
}

var line_geom = new THREE.BufferGeometry();
var line_pos = new Float32Array(2*3);
line_geom.addAttribute('position', new THREE.BufferAttribute(line_pos, 3));
var line_mat = new THREE.LineBasicMaterial({color:0xffffff, linewidth:2});
var source_line = new THREE.Line(line_geom, line_mat);
scene.add(source_line);

function update_line(line, p1, p2) {
	var p = line.geometry.attributes.position;
	var pos = p.array;
	pos[0] = p1.x;
	pos[1] = p1.y;
	pos[2] = 0;
	pos[3] = p2.x;
	pos[4] = p2.y;
	pos[5] = 0;
	p.needsUpdate = true;
}

function intersect_sphere_line(sphere, line){
    var a, b, c, d, u1, u2, ret, retP1, retP2, v1, v2, tmpv1;
    v1 = new Vector3();
    v2 = new Vector3();
	v1.subVectors(line.p2, line.p1);
	v2.subVectors(line.p1, sphere.center);
    var b = -2 * v1.dot(v2);
    var c = 2 * v1.lengthSq();
    d = Math.sqrt(b * b - 2 * c * (v2.lengthSq() - sphere.radius * sphere.radius));
    if(isNaN(d)){ // no intercept
        return [];
    }
    u1 = (b - d) / c;  // these represent the unit distance of point one and two on the line
    u2 = (b + d) / c;    
    retP1 = new Vector3();   // return points
    retP2 = new Vector3();  
    ret = []; // return array
    if(u1 <= 1 && u1 >= 0){  // add point if on the line segment
		tmpv1 = v1.clone();
		tmpv1.multiplyScalar(u1);
		retP1.addVectors(line.p1, tmpv1);
        ret[0] = retP1;
    }
    if(u2 <= 1 && u2 >= 0){  // second add point if on the line segment
		tmpv1 = v1.clone();
		tmpv1.multiplyScalar(u2);
		retP2.addVectors(line.p1, tmpv1);
        ret[ret.length] = retP2;
    }       
    return ret;
}

var idx_to_order = [];
function update_dots() {
	var line = [];
	var target_dots = [];
	var idx_list = [];
	for (var i=0; i<4; i++) {
		var history = dot_history[i];
		if (history.length > 0) {
			var d = history[history.length-1];
			var dot = dots[i];
			dot.visible = true;
			var pos = screen_to_world(d.pos2d);
			dot.position.copy(pos);
			if (d.guess) {
				dot.scale.set(0.5,0.5,0.5);
			} else {
				line.push([pos.x,pos.y]);
				idx_list.push(i);
				target_dots[i] = d.pos2d;
				dot.scale.set(d.size, d.size, d.size);
			}
		}
	}

	var all_visible = line.length === 4;

	if (line.length >= 2) {
		var result = regression('linear', line);

		// find major axis
		var k = result.equation[0];
		var major_axis = k>1||k<-1 ? 1 : 0;

		// sort points along axis
		var points = [];
		for (var i=0; i<result.points.length; i++) {
			var p = result.points[i];
			points.push({pos:new Vector3(p[0],p[1],0), idx:idx_list[i]});
		}

		//extrapolate the missing point
		/*
		if (idx_list.length === 2 && idx_to_order.length===4) {
			// sort points by previous order
			points.sort(function(p1,p2){
				return idx_to_order[p1.idx] - idx_to_order[p2.idx];
			});

			var visible_indices = [];
			var visible_orders = [];
			for (var i=0; i<4; i++) {
				if (idx_list.indexOf(i) !== -1) {
					visible_indices.push(i);
					visible_orders.push(idx_to_order[i]);
				}
			}
			// order missing points
			if (visible_orders[0] > visible_orders[1]) {
				var tmp = visible_orders[0];
				visible_orders[0] = visible_orders[1];
				visible_orders[1] = tmp;
			}

			var dot_dist = CUBE_LENGTH / 3 * (visible_orders[1] - visible_orders[0]);

			// get offset vector from 3d model
			var cube_dots = [];
			for (var i=0; i<4; i++) {
				cube_dots[i] = new Vector3;
				cube_dots[i].setFromMatrixPosition(leds[i].matrixWorld);
			}
			console.log(cube_dots);
		}
		*/

			// get real world space position
		if (idx_list.length === 3 && idx_to_order.length==4) {
			// sort points by previous order
			points.sort(function(p1,p2){
				return idx_to_order[p1.idx] - idx_to_order[p2.idx];
			});

			var missing_idx = 3;
			for (var i=0; i<3; i++) {
				if (idx_list[i] != i) {
					missing_idx = i;
					break;
				}
			}
			var newp = {pos:new Vector3, idx:missing_idx};
			switch (idx_to_order[missing_idx]) {
				case 0:	// A <- B C D:		AB = BC^2 / CD
					var BC = new Vector3;
					var CD = new Vector3;
					BC.subVectors(points[1].pos, points[0].pos);
					CD.subVectors(points[2].pos, points[1].pos);
					var bc = BC.length();
					var cd = CD.length();
					var ab = bc*bc/cd;
					newp.pos.subVectors(points[0].pos, BC.normalize().multiplyScalar(ab));
					points.push(newp);
					break;
				case 1: // A -> B <- C D:	BC = (sqrt(CD*AD - 3*CD^2) - CD) / 2
					var AD = new Vector3;
					var CD = new Vector3;
					AD.subVectors(points[2].pos, points[0].pos);
					CD.subVectors(points[2].pos, points[1].pos);
					var ad = AD.length();
					var cd = CD.length();
					var bc = (Math.sqrt(cd*ad - 3*cd*cd)-cd) / 2;
					if (!isNaN(bc) && bc>0) {
						newp.pos.subVectors(points[1].pos, CD.normalize().multiplyScalar(bc));
						points.push(newp);
					}
					break;
				case 2:	// A B -> C <- D:	BC = (sqrt(AB*AD - 3*AB^2) - AB) / 2
					var AD = new Vector3;
					var AB = new Vector3;
					AD.subVectors(points[2].pos, points[0].pos);
					AB.subVectors(points[1].pos, points[0].pos);
					var ad = AD.length();
					var ab = AB.length();
					var bc = (Math.sqrt(ab*ad - 3*ab*ab)-ab) / 2;
					if (!isNaN(bc) && bc>0) {
						newp.pos.addVectors(points[1].pos, AB.normalize().multiplyScalar(bc));
						points.push(newp);
					}
					break;
				case 3:	// A B C -> D:		CD = BC^2 / AB
					var BC = new Vector3;
					var AB = new Vector3;
					BC.subVectors(points[2].pos, points[1].pos);
					AB.subVectors(points[1].pos, points[0].pos);
					var bc = BC.length();
					var ab = AB.length();
					var cd = bc*bc/ab;
					newp.pos.addVectors(points[2].pos, BC.normalize().multiplyScalar(cd));
					points.push(newp);
					break;
			}

			if (points.length === 4) {
				target_dots[missing_idx] = world_to_screen(newp.pos);
			}
		}

		points.sort(function(p1,p2){
			return p1.pos.getComponent(major_axis) - p2.pos.getComponent(major_axis);
		});

		// find 2 end points (in world space)
		var begin_points = [points[0].pos, points[points.length-1].pos];
		update_line(source_line, begin_points[0], begin_points[1]);

		// cast end points (to 2 lines)
		var end_points = [new Vector3(), new Vector3()];
		for (var i=0; i<2; i++) {
			var p = end_points[i];
			p.subVectors(begin_points[i], camera.position);
			p.normalize();
			p.multiplyScalar(RANGE);
			p.add(begin_points[i]);
		}

		if (points.length === 2 && idx_to_order.length===4) {
			// get offset vector from 3d model
			var cube_dots = [];
			for (var i=0; i<4; i++) {
				cube_dots[i] = new Vector3;
				cube_dots[i].setFromMatrixPosition(leds[i].matrixWorld);
			}
			console.log(cube_dots);
		} 
		// for each point A on line 1, find another point B on line 2, so that dist(A,B) == CUBE_LENGTH
		// intersect(sphere(center=A,r=CUBE_LENGTH), line2)
		else if (points.length === 4) {
			var sphere = {center:new Vector3, radius:CUBE_LENGTH};
			var line = {p1:begin_points[1], p2:end_points[1]};
			var offset = new Vector3;
			var inter;
			var p1, p2, p3, p4, p4p1=new Vector3;
			var proj_points = [];
			var min_err = 1e10;
			var min_points = [];
			var min_proj = [];
			var tmpv = new Vector3;
			for (var f=0; f<=1; f+=0.01) {
				sphere.center.copy(begin_points[0]);
				offset.subVectors(end_points[0], begin_points[0]);
				offset.multiplyScalar(f);
				sphere.center.add(offset);
				inter = intersect_sphere_line(sphere,line);
				if (inter.length > 0) {
					// find the best fit
					p1 = sphere.center;
					for (var i=0; i<inter.length; i++) {
						p4 = inter[i];
						p4p1.subVectors(p4, p1);
						p4p1.multiplyScalar(1/3);
						p2 = sphere.center.clone();
						p2.add(p4p1);
						p3 = p2.clone();
						p3.add(p4p1);

						// project them on to screen
						proj_points[0] = world_to_screen(p1);
						proj_points[1] = world_to_screen(p2);
						proj_points[2] = world_to_screen(p3);
						proj_points[3] = world_to_screen(p4);
					}

					var err = 0;
					var idx;
					for (var i=0; i<4; i++) {
						idx = points[i].idx;
						err += target_dots[idx].distanceToSquared(proj_points[i]);
					}
					if (err < min_err) {
						min_err = err;
						min_points = [p1.clone(),p2.clone(),p3.clone(),p4.clone()];
						min_proj = [proj_points[0].clone(), proj_points[1].clone(),proj_points[2].clone(),proj_points[3].clone()];
					}
				}
			}
			if (min_points.length>0) {
				var original_dots = [];
				for (var i=0; i<4; i++) {
					var idx = points[i].idx;
					if (all_visible) {
						idx_to_order[idx] = i;
					}
					original_dots[i] = target_dots[idx];
					var history = dot_history[idx];
					if (history.length > 0) {
						var hist = history[history.length-1];
						if (hist.guess) {
							hist.pos2d.copy(min_proj[i]);
						}
					}
					sim_dots[idx].position.copy(min_points[i]);
				}
//				console.log('err:',min_err);
			}

		}

	}
}

function update_dots_old() {
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
	cube.updateMatrixWorld();

	update_dots();

	var test_center = new Vector3;
	for (var i=0; i<4; i++) {
		test_center.add(sim_dots[i].position);
	}
	test_center.multiplyScalar(0.25);
	cube.position.copy(test_center);

	renderer.render(scene, camera);
};

render();

