var THREE = require('./three.js');
var OrbitControls = require('three-orbit-controls')(THREE);
var SimpleDatGui = require('three-dat-gui')(THREE, THREE.document);
//var Canvas = require('canvas');
//THREE.canvas = new Canvas(256,256);
var Quaternion = THREE.Quaternion;
var Vector2 = THREE.Vector2;
var Vector3 = THREE.Vector3;
var SerialPort = require('serialport');
var fs = require('fs');
var net = require('net');
var WII_ADDRESS = '/var/tmp/wii.sock';
var regression = require('regression');
var JPEG = require('jpeg-js');
var btoa = require('btoa');

var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);
app.set('view engine', 'pug');

var width = 1024, height = 768;

// unix socket
var server = net.createServer(function(sock) {
	sock.on('data', function(data){
		position_tracker.update_ir_sensor(data);
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
				position_tracker.update_imu_sensor(data);
			});
		}
	});
});

// config
var config = {
	show_model : false,
	enable_correction : true
};
// renderer
var renderer = new THREE.WebGLRenderer({
	width: width,
	height: height
});
//renderer.autoClear = false;	// for GUI pass

THREE.document.setTitle('magiclip');

// scene
var scene = new THREE.Scene();
//var gui_scene = new THREE.Scene();

// camera
var camera = new THREE.PerspectiveCamera(63, 56/38, 0.01, 100);
//var gui_camera = new THREE.OrthographicCamera(-width/2, width/2, height/2, -height/2, 0, 30 );

camera.position.set(0,0,1);
var camera_saved = camera.clone();

var controls = new OrbitControls(camera, THREE.document);
//controls.zoomSpeed = 0.1;
//controls.rotateSpeed = 0.1;

//camera.up.set(0,0,1);
//GUI
//gui_camera = camera_saved;
//var gui = new SimpleDatGui({scene:gui_scene, camera:gui_camera, renderer:renderer, width:200, position : screen_to_world(new Vector2(width/2,height/2)), scale : 0.002, automatic:true});

/*
var myOptions = {
	RENDER_TEXT : "Hello World!",
	TRANPARENT : false,
	ROTATION_SPEED : 2.5,
	ROTATION_ANGLE : 0.0,
	FONT_SIZE : 150,
	ROTATION_X_AXIS : true,
	OPACITY : 100,
	FONT_NAME : "Gentilis",
	SHOW_STATS : false
};

gui.add(myOptions, 'TRANPARENT').name('Tranparent').onChange(function(value) {
	myOptions.OPACITY = (value) ? 80 : 100;
});
gui.add(myOptions, 'OPACITY', 10, 100).step(5).name('Opacity').onChange(function(value) {
	myOptions.TRANPARENT = !(value == 100);
});
gui.add(myOptions, 'RENDER_TEXT').name('Render Text').onChange(function(value) {
	//addOrUpdateRotatingText(scene, myOptions.RENDER_TEXT);
});
gui.add(myOptions, 'FONT_NAME', [
	'Helvetiker', 'Gentilis', 'Optimer'
	]).name('Font Type').onChange(function(value) {
	//	addOrUpdateRotatingText(scene, myOptions.RENDER_TEXT);
	});
	*/
// add light
var light_source = new THREE.PointLight( 0xffffff, 1, 0 );
light_source.position.set( 0, 0, 200 );
scene.add( light_source );

// models
var BAR_LENGTH = 11.5;
var HANDLE_LENGTH = 16.8;
var BOX_SIZE = 10;

var colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];
var sim_colors = [0x880000, 0x008800, 0x000088, 0x888800];

function DebugBox () {
	this.transparent = false;

	this.geom = new THREE.BoxGeometry(BOX_SIZE,BOX_SIZE,BOX_SIZE);
	this.material = new THREE.MeshPhongMaterial({transparent:this.transparent, opacity:0.5});
	this.mesh = new THREE.Mesh(this.geom, this.material);

	this.mesh.position.set(0,0,-30);
	this.mesh.visible = config.show_model;

	scene.add(this.mesh);
}

// crossbar model
function DebugCrossBar () {
	this.add_line('xbar', new Vector3(BAR_LENGTH/2,0,0), new Vector3(0,0,0), colors[0]);
	this.add_line('ybar', new Vector3(0,BAR_LENGTH/2,0), new Vector3(0,0,0), colors[1]);
	this.add_line('xbar_neg', new Vector3(-BAR_LENGTH/2,0,0), new Vector3(0,0,0), 0x770000);
	this.add_line('ybar_neg', new Vector3(0,-BAR_LENGTH/2,0), new Vector3(0,0,0), 0x007700);
	this.add_line('handle', new Vector3(0,0,0), new Vector3(0,0,-HANDLE_LENGTH), colors[2]);
	scene.add(this.model);
}

DebugCrossBar.prototype.add_line = function(name, p1, p2, color) {
	color = color || 0xffffff;

	this.model = this.model || new THREE.Group();
	this.geom = this.geom || {};
	this.mesh = this.mesh || {};

	// geometry
	this.geom[name] = new THREE.BufferGeometry();
	var verts = new Float32Array(2*3);
	this.geom[name].addAttribute('position', new THREE.BufferAttribute(verts, 3));

	// mesh
	this.mesh[name] = new THREE.Line(this.geom[name], new THREE.LineBasicMaterial({linewidth:2, color:color}));

	// verts
	var p = this.mesh[name].geometry.attributes.position;
	var pos = p.array;
	pos[0] = p1.x;
	pos[1] = p1.y;
	pos[2] = p1.z;
	pos[3] = p2.x;
	pos[4] = p2.y;
	pos[5] = p2.z;
	p.needsUpdate = true;

	this.model.add(this.mesh[name]);
};

DebugCrossBar.prototype.update_rotation = function(q) {
	this.q = q.clone();
	this.model.setRotationFromQuaternion(this.q);
};

function CrossBar () {
	this.transparent = false;
	this.model = new THREE.Group();

	this.geom = {};
	this.geom.xbar = new THREE.BoxGeometry(BAR_LENGTH, 1.5, 1.7);
	this.geom.ybar = new THREE.BoxGeometry(1.5, BAR_LENGTH, 1.7);
	this.geom.handle = new THREE.BoxGeometry(3.1, 1.5, HANDLE_LENGTH);
	this.geom.bulb = new THREE.SphereGeometry(1, 16, 16);

	this.material = new THREE.MeshPhongMaterial({transparent:this.transparent, opacity:0.5});

	this.mesh = {};
	this.mesh.xbar = new THREE.Mesh(this.geom.xbar, this.material);
	this.mesh.ybar = new THREE.Mesh(this.geom.ybar, this.material);
	this.mesh.handle = new THREE.Mesh(this.geom.handle, this.material);
	this.mesh.bulbs = [];

	this.init_pos = [
		new Vector3(-BAR_LENGTH/2, 0, 1.7/2+1), 
		new Vector3(0, -BAR_LENGTH/2, 1.7/2+1),
		new Vector3(BAR_LENGTH/2, 0, 1.7/2+1),
		new Vector3(0, BAR_LENGTH/2, 1.7/2+1)];

	this.pos = [];

	for (var i=0; i<4; i++) {
		var bulb = new THREE.Mesh(this.geom.bulb, new THREE.MeshPhongMaterial({color:colors[i], transparent:this.transparent, opacity:0.5}));
		bulb.position.copy(this.init_pos[i]);
		this.model.add(bulb);
		this.mesh.bulbs[i] = bulb;

		this.pos[i] = this.init_pos[i].clone();
	}

	this.mesh.handle.position.z = -HANDLE_LENGTH/2 - 1.7/2;

	this.model.add(this.mesh.xbar);
	this.model.add(this.mesh.ybar);
	this.model.add(this.mesh.handle);

	this.model.position.set(0,0,-30);
	scene.add(this.model);

	//
	this.q = new Quaternion();

	this.model.visible = config.show_model;
}

CrossBar.prototype.update_rotation = function(q) {
	this.q = q.clone();
	this.model.setRotationFromQuaternion(this.q);

	// apply only rotation to dots first
	for (var i=0; i<4; i++) {
		this.pos[i] = this.init_pos[i].clone();
		this.pos[i].applyQuaternion(this.q);
	}
};

var test_rot = 0;
CrossBar.prototype.update_sensor = function(data) {
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
		var test_q = new Quaternion;
		test_q.setFromAxisAngle(new Vector3(0,0,1), test_rot);
		qrel.multiplyQuaternions(qh.conjugate(), qclip);
		qrel.multiply(test_q);
	}
};

// IR dots
function IRDots () {
	this.mesh = {};
	this.mesh.dots = [];
	this.geom = new THREE.SphereGeometry(0.01, 4, 4);
	for (var i=0; i<4; i++) {
		var dot = new THREE.Mesh(this.geom, new THREE.MeshPhongMaterial({color:colors[i], transparent:true, opacity:0.5}));
		scene.add(dot);
		dot.visible = false;
		this.mesh.dots[i] = dot;
	}
}

// dot history
var dot_history = [[],[],[],[]];
function dot_score(dot, dotlist) {
	var score = 0;
	for (var i=0; i<dotlist.length; ++i) {
		var dot2 = dotlist[i];
		score += dot.screen_pos.distanceTo(dotlist[i].screen_pos);
	}
	return score;
}

// fisheye cam calibration
function FishEyeCalib () {
	this.strength = 1.95;
	this.zoom = 1.5;
}

var CALIB_SCALE	= 1.13;
FishEyeCalib.prototype.calib = function(x, y) {
	// center
	var midx = width / 2;
	var midy = height / 2;

	
	var r = Math.floor(Math.sqrt(width*width + height*height) / 2);

	var dist = r * 2 / this.strength;
	var r2 = r*r;

	var nx = x - midx;
	var ny = y - midy;

	var d2 = nx*nx + ny*ny;
	var sx, sy;

	if (d2 <= r2) {
		var d = Math.floor(Math.sqrt(d2));
		var radius = d / dist;
		var theta = Math.tan(radius) / radius;
		sx = Math.floor(midx + theta * nx / this.zoom);
		sy = Math.floor(midy + theta * ny / this.zoom);
	} else {
		sx = x;
		sy = y;
	}

	return new Vector2(sx, sy * CALIB_SCALE);	// a square is not a square after calibration: x/y=1.13, so we have to correct this
}

var fish_calib = new FishEyeCalib();

IRDots.prototype.update_sensor = function(data) {
	try {
		// may receive multiple frames at once
		var dot_str = data.toString().split('][');
		if (dot_str.length > 1) {
			for (var i=0; i<dot_str.length-1; i++) {
				dot_str[i] += ']';
			}
			for (var i=1; i<dot_str.length; i++) {
				dot_str[i] = '[' + dot_str[i];
			}
			for (var i=0; i<dot_str.length; i++) {
				this.update_sensor(dot_str[i]);
			}
			return;
		}
		var dot_raw = JSON.parse(dot_str[0]);
		var dots = [], scores = [], slots = [];
		for (var i=0; i<dot_raw.length; i+=3) {
			var dot = {screen_pos:fish_calib.calib(dot_raw[i],dot_raw[i+1]), size:dot_raw[i+2], guess:false};
			dot.world_pos = screen_to_world(dot.screen_pos);
			var score = [];

			// dot against history, find scores
			for (var j=0; j<4; j++) {
				score.push(dot_score(dot, dot_history[j]));
			}
			dots.push(dot);
			scores.push(score);
		}

		// point tracking
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
			if (history.length > 0){
				var newest = history[history.length-1];
				if (slots.indexOf(i) === -1) {
					newest.guess = true;
				} else {
					newest.idx = i;
					this.mesh.dots[i].position.copy(newest.world_pos);
				}
			} 
		}
	} catch (e){
		console.log(e,data.toString());
	}
};

IRDots.prototype.update_dot = function(dot) {
	if (!dot) return;

	var history = dot_history[dot.idx];
	if (history.length > 0) {
		var newest = history[history.length-1];
		if (newest.guess) {
			newest.world_pos.copy(dot.world_pos);
			newest.screen_pos.copy(dot.screen_pos);
			this.mesh.dots[dot.idx].position.copy(dot.world_pos);
		}
	}
};

IRDots.prototype.get_current = function() {
	var dots = [];
	for (var i=0; i<4; i++) {
		var hist = dot_history[i];
		if (hist.length > 0) {
			var dot_hist = hist[hist.length-1];
			var dot = {screen_pos:dot_hist.screen_pos.clone(), size:dot_hist.size, guess:dot_hist.guess, world_pos:dot_hist.world_pos.clone(), idx:dot_hist.idx};
			dots.push(dot);
		}
	}
	return dots;
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function DebugDot (color, r) {
	r = r || 0.1;
	this.geom = new THREE.SphereGeometry(r, 16, 16);
	this.mat = new THREE.MeshPhongMaterial({color:color});
	this.mesh = new THREE.Mesh(this.geom, this.mat);
	scene.add(this.mesh);
}

DebugDot.prototype.set_pos = function(pos) {
	this.mesh.position.copy(pos);
};

DebugDot.prototype.set_scale = function(s) {
	this.mesh.scale.set(s,s,s);
};

DebugDot.prototype.set_color = function(color) {
	this.mat.color.setHex(color);
};

function DebugLine (color) {
	this.geom = new THREE.BufferGeometry();
	var verts = new Float32Array(2*3);
	this.geom.addAttribute('position', new THREE.BufferAttribute(verts, 3));
	var mat = new THREE.LineBasicMaterial({color:color, linewidth:2});
	this.mesh = new THREE.Line(this.geom, mat);
	scene.add(this.mesh);
}

DebugLine.prototype.set_pos = function(p1, p2) {
	var p = this.mesh.geometry.attributes.position;
	var pos = p.array;
	pos[0] = p1.x;
	pos[1] = p1.y;
	pos[2] = p1.z;
	pos[3] = p2.x;
	pos[4] = p2.y;
	pos[5] = p2.z;
	p.needsUpdate = true;
};

//////////////////////////////////////////////////////////////////////////////////////////
function Sampler (name) {
	this.name = name || 'unnamed';
	this.write_stream = fs.createWriteStream(this.name + '.json');
	this.write_stream.write('[');
	this.written = false;
	var scope = this;
	process.on('exit', function(){
		scope.close();
	});
}

Sampler.prototype.log = function(samp) {
	if (!this.is_ready) return;

	var str;
	if (typeof samp === 'object') {
		str = JSON.stringify(samp);
	} else {
		str = samp.toString();
	}
	if (this.written) {
		str = ',\n' + str;
	} else {
		this.written = true;
	}
	this.write_stream.write(str);
};

Sampler.prototype.flush = function(samp) {
	this.log(samp);
	this.is_ready = false;
};

Sampler.prototype.close = function() {
	this.write_stream.end(']');
};

Sampler.prototype.ready = function() {
	this.is_ready = true;
};

var sampler = new Sampler('orientation-error');

//////////////////////////////////////////////////////////////////////////////////////////
var RANGE = 100;

function PositionTracker () {
	this.crossbar = new CrossBar();
	this.debug_crossbar = new DebugCrossBar();
	this.ir_dots = new IRDots();
	this.debug_dots = {};
	this.debug_lines = {};
	this.debug_box = new DebugBox();
	this.frame_cnt = 0;
}

PositionTracker.prototype.toggle_debug = function() {
	this.crossbar.model.visible = config.show_model;
	this.debug_box.mesh.visible = config.show_model;
};

PositionTracker.prototype.toggle_correction = function() {
	if (config.enable_correction) {
		MAX_ITER_CNT = 100;
	} else {
		MAX_ITER_CNT = 1;
	}
};

PositionTracker.prototype.translate = function(x,y,z) {
	this.crossbar.model.position.add(new Vector3(x,y,z));
};

PositionTracker.prototype.temp_debug_dot = function(pos, color, r) {
	color = color || 0xffffff;
	var d = this.temp_dot;
	if (!d) {
		d = this.temp_dot = new DebugDot(color, 1);
	}
	d.set_color(color);
	d.set_pos(pos);
	d.set_scale(r);
};

PositionTracker.prototype.debug_dot = function(pos, color, r) {
	color = color || 0xffffff;
	var d = this.debug_dots[color];
	if (!d) {
		d = this.debug_dots[color] = new DebugDot(color);
	}
	d.set_pos(pos);
	if (r) d.set_scale(r);
};

PositionTracker.prototype.debug_ray = function(pos1, ray, color) {
	color = color || 0xffffff;
	var line = this.debug_lines[color];
	if (!line) {
		line = this.debug_lines[color] = new DebugLine(color);
	}
	var pos2 = new Vector3;
	pos2.addVectors(pos1, ray);
	line.set_pos(pos1, pos2);
};

PositionTracker.prototype.debug_line = function(pos1, pos2, color) {
	color = color || 0xffffff;
	var d = this.debug_lines[color];
	if (!d) {
		d = this.debug_lines[color] = new DebugLine(color);
	}
	d.set_pos(pos1, pos2);
};

function cos2deg(c) {
	return Math.floor(Math.acos(c) * 180/Math.PI);
}

function rad2deg(r) {
	return Math.floor(r * 180 / Math.PI);
}

var test_euler = new THREE.Euler;
var last_sx = 1;
var last_sy = 1;
var last_sz = 1;
var MAX_ITER_CNT = 100;
var COLINEAR_THRESH = 0.995;

PositionTracker.prototype.optimize_diagnal = function(iter_max, ray1, ray2, diag_dir) {
	var rad = Math.acos(ray1.dot(ray2));
	var rad1 = Math.PI - Math.acos(ray1.dot(diag_dir));
	var rad2 = Math.acos(ray2.dot(diag_dir));

	if (rad + rad1 + rad2 > Math.PI + 0.01) {
		rad1 = Math.PI - rad1;
		rad2 = Math.PI - rad2;
	}

	console.log(rad2deg(rad), rad2deg(rad1), rad2deg(rad2));

	var k = BAR_LENGTH / Math.sin(rad);
	var d1 = k * Math.sin(rad1);
	var d2 = k * Math.sin(rad2);

	var world_pos1 = ray1.clone().multiplyScalar(d2).add(camera_saved.position);
	var world_pos2 = ray2.clone().multiplyScalar(d1).add(camera_saved.position);
	var center = world_pos1.clone().add(world_pos2).multiplyScalar(0.5);

	var result = {};
	result.center = center;
	result.world_pos1 = world_pos1;
	result.world_pos2 = world_pos2;

	return result;
};

PositionTracker.prototype.optimize = function(iter_max, min_dir, ray1, ray2, diagonal_dot_dir, missing_3rd) {
	var crossbar_dir = new Vector3;
	var intersect_dir = new Vector3;
	var point_at_center = new Vector3;
	var center = new Vector3;
	var ray = new THREE.Ray;
	var crossbar_plane = new THREE.Plane;
	var cast_center = new Vector3;
	var local_x = new Vector3;
	var local_y = new Vector3;
	var local_z = new Vector3;
	var dcenter = new Vector3;
	var mid12 = new Vector3;

	var first_dist_sq, last_dist_sq;
	var last_choice = 0;	//x
	var last_err = 0;
	var step_x = 0.01;
	var step_y = 0.01;
	var step_z = 0.01;
	var debug_str = '';

//		test_euler.set(0,0,0);
	for (var iter_cnt=0; iter_cnt<iter_max; iter_cnt++) {
		// when pointing at camera, crossbar_dir can be parallel to the direction of camera
		crossbar_dir.set(0,0,1);
		crossbar_dir.applyEuler(test_euler);	// euler.z is useless: euler_z((0,0,1), any_angle) === (0,0,1)
		crossbar_dir.applyQuaternion(qrel);

		// crossbar plane x side plane
		intersect_dir.crossVectors(crossbar_dir, min_dir);
		intersect_dir.normalize();

		// angle between crossbar plane & cast ray
		var cos1 = intersect_dir.dot(ray1);
		var cos2 = intersect_dir.dot(ray2);
		var target_d = BAR_LENGTH / Math.sqrt(2);

		var rad1 = Math.PI - Math.acos(cos1);
		var rad2 = Math.acos(cos2);
		var rad = Math.acos(ray1.dot(ray2));

		var k = target_d / Math.sin(rad);
		var d1 = k * Math.sin(rad1);
		var d2 = k * Math.sin(rad2);

		var world_pos1 = ray1.clone();
		var world_pos2 = ray2.clone();
		world_pos1.multiplyScalar(d2);
		world_pos2.multiplyScalar(d1);
		world_pos1.add(camera_saved.position);
		world_pos2.add(camera_saved.position);
		mid12.addVectors(world_pos1, world_pos2);
		mid12.multiplyScalar(0.5);

		point_at_center.crossVectors(intersect_dir, crossbar_dir);
		point_at_center.normalize();
		center = point_at_center.clone();
		center.multiplyScalar(-target_d / 2);
		center.add(mid12);

		// extrapolate the other two points
//			var world_pos3 = center.clone();
//			world_pos3.multiplyScalar(2);
//			world_pos3.sub(world_pos1);

//			var world_pos4 = center.clone();
//			world_pos4.multiplyScalar(2);
//			world_pos4.sub(world_pos2);

		// project IR dots to the crossbar plane
		ray.origin = camera_saved.position.clone();
		ray.direction = diagonal_dot_dir.clone();
		crossbar_plane.normal = crossbar_dir.clone();
		crossbar_plane.constant = -crossbar_dir.dot(center);
		var world_cast_pos = ray.intersectPlane(crossbar_plane);
		if (world_cast_pos) {
			var world_pos = missing_3rd ? world_pos2 : world_pos1;
			cast_center.addVectors(world_pos, world_cast_pos);
			cast_center.multiplyScalar(0.5);

			if (!config.enable_correction) break;

			//correction
			local_x = intersect_dir.clone();
			local_y.crossVectors(crossbar_dir, intersect_dir);
			local_z = crossbar_dir.clone();

			dcenter.subVectors(cast_center, center);
			var dist_sq = dcenter.lengthSq();
			if (last_dist_sq === undefined) {
				first_dist_sq = last_dist_sq = dist_sq;
			}
			var gx = dcenter.dot(local_x);
			var gy = dcenter.dot(local_y);
			var gz = dcenter.dot(local_z);

			if (gx*gx + gy*gy + gz*gz< 1e-4) break;

			var sx = last_sx;
			var sy = last_sy;
			var sz = last_sz;
			var k = 1;
			if (dist_sq > last_dist_sq) {
				debug_str += '-';

				// prevent error ping pong:
				// +x -> err -> -x -> err -> +x ...
				var err_ping_pong = last_err === last_choice;
				if (last_choice === 0) {
					sx = -sx;
					test_euler.x -= 2 * sx * step_x;
					if (err_ping_pong) gx = 0;
				} else if (last_choice === 1) {
					sy = -sy;
					test_euler.y -= 2 * sy * step_y;
					if (err_ping_pong) gy = 0;
				} else {
					sz = -sz;
					test_euler.z -= 2 * sz * step_z;
					if (err_ping_pong) gz = 0;
				}
				last_err = last_choice;
			} else {
				debug_str += '+';
				k = Math.sqrt(dist_sq / last_dist_sq);
			}

			var ax = Math.abs(gx);
			var ay = Math.abs(gy);
			var az = Math.abs(gz);
			var amax = Math.max(ax,ay,az);
			if (amax === ax) {
				test_euler.x -= sx * step_x;
				step_x *= k;
				last_choice = 0;
			} else if (amax === ay) {
				test_euler.y -= sy * step_y;
				step_y *= k;
				last_choice = 1;
			} else {
				test_euler.z -= sz * step_z;
				step_z *= k;
				last_choice = 2;				
			}
			last_sx = sx;
			last_sy = sy;
			last_sz = sz;
			last_dist_sq = dist_sq;
			debug_str += last_choice;
		}
	}

	var result = {};
	result.center = center;
	result.world_pos1 = world_pos1;
	result.world_pos2 = world_pos2;

	return result;
};

function is_colinear (dots) {
	var real_dots = [];
	var missing_i;
	for (var i=0; i<4; i++) {
		var dot = dots[i];
		if (!dot.guess) {
			real_dots.push(dot);
		} else {
			missing_i = i;
		}
	}

	var edge1 = real_dots[1].screen_pos.clone().sub(real_dots[0].screen_pos).normalize();
	var edge2 = real_dots[2].screen_pos.clone().sub(real_dots[1].screen_pos).normalize();
	var colinear = edge1.dot(edge2);
	return colinear > COLINEAR_THRESH || colinear < -COLINEAR_THRESH;
}

function find_diagonal (ir_dots, ir_rays, last_center) {
	var ray1, ray2, dot1, dot2;
	var max_d = -1e10;
	var max_i = -1;
	var max_j = -1;
	for (var i=0; i<3; i++) {
		for (var j=i+1; j<4; j++) {
			var d1 = ir_dots[i];
			var d2 = ir_dots[j];
			if (d1 && d2 && !d1.guess && !d2.guess) {
				var dist_sq = d1.screen_pos.distanceToSquared(d2.screen_pos);
				if (dist_sq > max_d) {
					max_d = dist_sq;
					max_i = i;
					max_j = j;
					ray1 = ir_rays[i].clone();
					ray2 = ir_rays[j].clone();
					dot1 = d1;
					dot2 = d2;
				}
			}
		}
	}

	// find diagonal axis
	if (!ray1 || !ray2) return null;

	// project axis to screen space
	var axis_x = new Vector3(1,0,0).applyEuler(test_euler).applyQuaternion(qrel);
	var axis_y = new Vector3(0,1,0).applyEuler(test_euler).applyQuaternion(qrel);

	// use last center
	var proj_x = last_center.clone().add(axis_x);
	var proj_y = last_center.clone().add(axis_y);
	var proj_x_neg = last_center.clone().sub(axis_x);
	var proj_y_neg = last_center.clone().sub(axis_y);


	var last_center_2d = world_to_screen(last_center);
	var proj_x_2d = world_to_screen(proj_x).sub(last_center_2d);
	var proj_y_2d = world_to_screen(proj_y).sub(last_center_2d);
	var proj_x_neg_2d = world_to_screen(proj_x_neg).sub(last_center_2d);
	var proj_y_neg_2d = world_to_screen(proj_y_neg).sub(last_center_2d);
	if (proj_x_2d.distanceToSquared(proj_x_neg_2d) > proj_y_2d.distanceToSquared(proj_y_neg_2d)) {
		diag_dir = axis_x.clone();
	} else {
		diag_dir = axis_y.clone();
	}
//	var diag_2d = dot2.screen_pos.clone().sub(dot1.screen_pos).normalize();

	
/*
	var dpx = Math.abs(diag_2d.dot(proj_x_2d));
	var dpy = Math.abs(diag_2d.dot(proj_y_2d));
	if (dpx > dpy) {
		diag_dir = axis_x.clone();
	} else {
		diag_dir = axis_y.clone();
	}
*/
	return {i:max_i, j:max_j, dir:diag_dir};
}

PositionTracker.prototype.get_last_center = function() {
	var last_center = this.record.center 
	? this.record.center.clone() 
	: this.crossbar.model.position.clone();
	return last_center;
};

PositionTracker.prototype.update = function() {
	// point matching
	var ir_dots = this.ir_dots.get_current();
	if (ir_dots.length === 0) return;

	// find 'fresh' IR dots
	var new_cnt = 0;
	for (var i=0; i<ir_dots.length; i++) {
		var dot = ir_dots[i];
		if (!dot.guess) {
			++new_cnt;
		}
	}

	// reorder dots
	var ir_center = new Vector2;
	for (var i=0; i<ir_dots.length; i++) {
		ir_center.add(ir_dots[i].screen_pos);
	}
	ir_center.multiplyScalar(1/ir_dots.length);

	// make points counterclockwise
	ir_dots.sort(function(p1, p2){
		var a = p1.screen_pos;
		var b = p2.screen_pos;
		if (a.x - ir_center.x >= 0 && b.x - ir_center.x < 0)
			return -1;
		if (a.x - ir_center.x < 0 && b.x - ir_center.x >= 0)
			return 1;
		if (a.x - ir_center.x == 0 && b.x - ir_center.x == 0) {
			if (a.y - ir_center.y >= 0 || b.y - ir_center.y >= 0)
				return b.y - a.y;
			return a.y - b.y;
		}

	    // compute the cross product of vectors (center -> a) x (center -> b)
	    var det = (a.x - ir_center.x) * (b.y - ir_center.y) - (b.x - ir_center.x) * (a.y - ir_center.y);
	    if (det != 0)
	    	return det;

	    // points a and b are on the same line from the center
	    // check which point is closer to the center
	    var d1 = (a.x - ir_center.x) * (a.x - ir_center.x) + (a.y - ir_center.y) * (a.y - ir_center.y);
	    var d2 = (b.x - ir_center.x) * (b.x - ir_center.x) + (b.y - ir_center.y) * (b.y - ir_center.y);
	    return d2 - d1;
	});


/*
	var iter_cnt;
	var crossbar_dir = new Vector3(0,0,1);
	var intersect_dir = new Vector3;
	var mid12 = new Vector3;
	var point_at_center = new Vector3;
	var cast_center = new Vector3;
	var ray3 = new THREE.Ray;
	var ray4 = new THREE.Ray;
	var crossbar_plane = new THREE.Plane;
	var dcenter = new Vector3;
	var local_x = new Vector3;
	var local_y = new Vector3;
	var local_z = new Vector3;
*/
	// if top view, disable correction
	var crossbar_dir = new Vector3(0,0,1);
	crossbar_dir.applyQuaternion(qrel);
	var straight = Math.abs(crossbar_dir.dot(camera_saved.getWorldDirection()));
	var iter_max;
	if (straight > 0.9) {
		// decrease iteration count gracefully
		iter_max = Math.max(1, Math.floor(Math.pow(1-straight,2) * 100 * MAX_ITER_CNT));
//			iter_max = 1;
		test_euler.set(0,0,0);
	} else {
		iter_max = MAX_ITER_CNT;
	}

	// cast IR dots
	var ir_rays = [];
	for (var i=0; i<ir_dots.length; i++) {
		var dot = ir_dots[i];
		var ray = new Vector3;
		ray.subVectors(dot.world_pos, camera_saved.position);
		ray.normalize();
		ir_rays[i] = ray.clone();
	}

	if (false && new_cnt === 2 && this.record && this.record.frame === this.frame_cnt) {
		/*
			edge or diagonal?
		*/
	} else if (new_cnt === 3 && this.record && this.record.frame === this.frame_cnt) {
		/* 
			3 edges, multiple possibilities
			3 edges / 2 edges + 1 diagonal / 1 edge + 1 merged vert
			missing 1 point
			1 merged vert
			3 dots on the same line

			we need:
			1 edge - most similar to a previous edge
			center of the IR dots on screen
		 */
		// 3 dots are colinear

		var result;
		var min_i = -1;
		if (is_colinear(ir_dots)) {
			// find diagonal
			var diag = find_diagonal(ir_dots, ir_rays, this.get_last_center());
			if (diag) {
				result = this.optimize_diagnal(1, ir_rays[diag.i], ir_rays[diag.j], diag.dir);
			} else {
				console.warn('4 dot error: failed to find diagonal');
			}

			// fix missing dots
			var missing_pos = result.center.clone().multiplyScalar(2);
			var missing_screen_pos = world_to_screen(result.center).multiplyScalar(4);
			var missing_dot;
			for (var i=0; i<4; i++) {
				var dot = ir_dots[i];
				if (dot.guess) {
					missing_dot = dot;
				} else {
					missing_screen_pos.sub(dot.screen_pos);
				}
			}
			missing_dot.screen_pos = missing_screen_pos;
			missing_dot.world_pos = screen_to_world(missing_screen_pos);
			this.ir_dots.update_dot(missing_dot);

			console.log('colinear 3');
			this.debug_dot(result.world_pos1, 0xdd0000, 5);
			this.debug_dot(result.world_pos2, 0x00dd00, 5);
		} else {
			// find edge similar to a previous edge
			var prev_dots = this.record.ir_dots;
			var idx_prev_dots = [];
			for (var i=0; i<4; i++) {
				idx_prev_dots[prev_dots[i].idx] = prev_dots[i];
			}

			var min_err = 1e10;
			var min_dir = new Vector3;
			for (var i=0; i<4; i++) {
				var d1 = ir_dots[i];
				var d2 = ir_dots[(i+1)%4];

			 	if (d1.guess || d2.guess) continue;	// both dots have to be real

			 	var prev_d1 = idx_prev_dots[d1.idx];
			 	var prev_d2 = idx_prev_dots[d2.idx];

			 	var prev_adj = Math.abs(prev_dots.indexOf(prev_d1) - prev_dots.indexOf(prev_d2));	// adjacent in prev frame?

			 	if (prev_adj!=1 && prev_adj!=3) continue;

			 	var err = d1.screen_pos.distanceToSquared(prev_d1.screen_pos) + d2.screen_pos.distanceToSquared(prev_d2.screen_pos);

			 	if (err < min_err) {
			 		min_err = err;
			 		min_i = i;
			 		min_dir.crossVectors(ir_rays[i], ir_rays[(i+1)%4]);
			 	}
			}

			if (min_i < 0) {
				console.warn('3 dot matching failed');
			}

			// find cast center
			// we have the 3rd dot, which can be: 1) a real dot, or 2) a merged dot
			// 1) a real dot
			var d3 = ir_dots[(min_i+2)%4];
			var d4 = ir_dots[(min_i+3)%4];

			var ray1 = ir_rays[min_i].clone();
			var ray2 = ir_rays[(min_i+1)%4].clone();
			var diagonal_dot_dir;

			//iter_max, min_dir, ray1, ray2, diagonal_dot_dir, missing_3rd
			if (d3.guess) {	// diagonal is d2-d4
				diagonal_dot_dir = ir_rays[(min_i+3)%4].clone();
			} else {	// diagonal is d1-d3
				diagonal_dot_dir = ir_rays[(min_i+2)%4].clone();
			}

			result = this.optimize(iter_max, min_dir, ray1, ray2, diagonal_dot_dir, d3.guess);

			// fix missing dot
			var missing_pos = result.center.clone().multiplyScalar(2);
			if (d3.guess) {// dot 3 missing: d3 = 2*center - d1
				missing_pos.sub(result.world_pos1);
				d3.screen_pos = world_to_screen(missing_pos);
				d3.world_pos = screen_to_world(d3.screen_pos);
				this.ir_dots.update_dot(d3);
			} else {// dot 4 missing: d4 = 2*center - d2
				missing_pos.sub(result.world_pos2);
				d4.screen_pos = world_to_screen(missing_pos);
				d4.world_pos = screen_to_world(d3.screen_pos);
				this.ir_dots.update_dot(d4);
			}
		}

		var center = result.center;
		this.temp_debug_dot(center, 0x00ffff, 0.2);
		this.debug_crossbar.model.position.copy(center);
		this.crossbar.model.position.copy(center);
		controls.target.copy(center);

	} else if (new_cnt === 4) {
		// 4 dots colinear?
		if (is_colinear(ir_dots)) {
			// find diagonal
			var diag = find_diagonal(ir_dots, ir_rays, this.get_last_center());
			if (diag) {
				result = this.optimize_diagnal(1, ir_rays[diag.i], ir_rays[diag.j], diag.dir);
			} else {
				console.warn('4 dot error: failed to find diagonal');
			}

			console.log('colinear 4');
		} else {
			// side planes
			var min_dot = 1e10;
			var min_i = 0;
			var min_dir;
			for (var i=0; i<ir_rays.length; i++) {
				var dir = new Vector3;
				dir.crossVectors(ir_rays[i], ir_rays[(i+1)%4]);
				dir.normalize();
				var d = Math.abs(dir.dot(crossbar_dir));
				// TODO: use the most stable dot?
				if (ir_dots[i].idx == 0) {
	//			if (d < min_dot) {
					min_dot = d;
					min_i = i;
					min_dir	= dir.clone();
				}
			}
			var ray1 = ir_rays[min_i].clone();
			var ray2 = ir_rays[(min_i+1)%4].clone();
			var ray3 = ir_rays[(min_i+2)%4].clone();

			result = this.optimize(iter_max, min_dir, ray1, ray2, ray3, false);
		}

		var center = result.center;

//		this.temp_debug_dot(center, 0xffff00, 1);
		this.debug_dot(result.world_pos1, 0xdd0000, 5);
		this.debug_dot(result.world_pos2, 0x00dd00, 5);
		this.debug_crossbar.model.position.copy(center);
		this.crossbar.model.position.copy(center);
		controls.target.copy(center);

	}

	this.crossbar.update_rotation(qrel);
	this.debug_crossbar.update_rotation(qrel);
	++this.frame_cnt;

	// save for later use
	this.record = {frame:this.frame_cnt, ir_dots:ir_dots};
	if (center) {
		this.record.center = center.clone();
	}
};

PositionTracker.prototype.update_ir_sensor = function(data) {
	this.ir_dots.update_sensor(data);
};

PositionTracker.prototype.update_imu_sensor = function(data) {
	this.crossbar.update_sensor(data);
};

var position_tracker = new PositionTracker();

function get_screen_coord(obj) {
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
	vector.project(camera_saved);

	vector.x = ( vector.x * widthHalf ) + widthHalf;
	vector.y = - ( vector.y * heightHalf ) + heightHalf;	

	return new Vector2(vector.x, vector.y);
}

function screen_to_world (s, cam) {
	cam = cam || camera_saved;
	var vector = new THREE.Vector3();
	vector.set(s.x/width*2-1, 1-s.y/height*2, 0.5);
	vector.unproject(cam);
	var dir = vector.sub(cam.position).normalize();
	var distance = - cam.position.z / dir.z;
	var pos = cam.position.clone().add(dir.multiplyScalar(distance));
	return pos;
}

function update_camera (key, val) {
	camera[key] = val;
	camera.updateProjectionMatrix();
	camera_saved[key] = val;
	camera_saved.updateProjectionMatrix();
}
/////////////////////////////////////////////
// input handling
var keys = {};
function mapKeyCode(code) {
  var named = {
    8: 'BACKSPACE',
    9: 'TAB',
    13: 'ENTER',
    16: 'SHIFT',
    27: 'ESCAPE',
    32: 'SPACE',
    37: 'LEFT',
    38: 'UP',
    39: 'RIGHT',
    40: 'DOWN'
  };
  return named[code] || (code >= 33 && code <= 126 ? String.fromCharCode(code) : null);
}

function on(element, name, callback) {
  element.addEventListener(name, callback);
}

function off(element, name, callback) {
  element.removeEventListener(name, callback);
}

on(THREE.document, 'keydown', function(e) {
//  console.log('keydown: '+require('util').inspect(e));
  if (!e.altKey && !e.ctrlKey && !e.metaKey) {
    var key = mapKeyCode(e.keyCode);
    if (key) keys[key] = true;
    keys[e.keyCode] = true;
  }
});

on(THREE.document, 'keyup', function(e) {
  if (!e.altKey && !e.ctrlKey && !e.metaKey) {
    var key = mapKeyCode(e.keyCode);
    if (key) keys[key] = false;
    keys[e.keyCode] = false;
  }
});

var first_render = true;
var render = function () {
	THREE.requestAnimationFrame(render);

	/*
	cube.setRotationFromQuaternion(qrel);
	cube.updateMatrixWorld();

	update_dots();

	var test_center = new Vector3;
	for (var i=0; i<4; i++) {
		test_center.add(sim_dots[i].position);
	}
	test_center.multiplyScalar(0.25);
	cube.position.copy(test_center);
	*/

	position_tracker.update();

	if (keys['A']) {
		position_tracker.translate(-0.1,0,0);
	}
	if (keys['D']) {
		position_tracker.translate(0.1,0,0);
	}
	if (keys['S']) {
		position_tracker.translate(0,0,0.1);
	}
	if (keys['W']) {
		position_tracker.translate(0,0,-0.1);
	}
	if (keys['Q']) {
		position_tracker.translate(0,0.1,0);
	}
	if (keys['Z']) {
		position_tracker.translate(0,-0.1,0);
	}

	// log
	if (keys['L']) {
		sampler.ready();
	}

	// show/hide model
	if (keys['M']) {
		config.show_model = !config.show_model;
		position_tracker.toggle_debug();
	}
	if (keys['C']) {
		config.enable_correction = !config.enable_correction;
		position_tracker.toggle_correction();
	}

	// reset camera
	if (keys['R']) {
		controls.reset();
	}
//	gui.update();//{position:screen_to_world(new Vector2(width/2,height/2), camera)});
//	renderer.clear();
	renderer.render(scene, camera);
//	renderer.clearDepth();
//	renderer.render(gui_scene, gui_camera);
	if (first_render) {
		camera_saved = camera.clone();
		first_render = false;
	}

//	camera_saved.lookAt(position_tracker.crossbar.model.position);
//	controls.update();
};

app.ws('/test', function(ws, req) {
	ws.on('message', function(msg) {
		if (msg === 'init') {
			ws.send(JSON.stringify({fov:camera.fov, aspect:camera.aspect, strength:fish_calib.strength, zoom:fish_calib.zoom, 
				euler_x:test_euler.x,euler_y:test_euler.y,euler_z:test_euler.z,test_rot:test_rot
			}));
		} else {
			var type_val = msg.split(':');
			var type = type_val[0];
			var val = Number(type_val[1]);
			console.log(type,val);
			if (type === 'fov' || type === 'aspect') {
				update_camera(type, val);
			} else if (type === 'strength' || type === 'zoom') {
				fish_calib[type] = val;
			} else if (type === 'euler_x' || type === 'euler_y' || type === 'euler_z') {
				var axis = type.split('_')[1];
				test_euler[axis] = val;
			} else if (type === 'test_rot') {
				test_rot = val;
			}
		}
	});
});

app.listen(3000);
render();

