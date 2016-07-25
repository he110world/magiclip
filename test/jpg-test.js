var fs = require('fs');
var jpg = require('jpeg-js');
var filename = process.argv[2];
var filter = process.argv[3] || 1;
if (!filename) {
	console.log('no file name');
	process.exit(1);
}
var jpgData = fs.readFileSync(filename);
var rawData = jpg.decode(jpgData);
var width = rawData.width;
var height = rawData.height;

// dest image
var dstData = new Buffer(width * height * 4);

// fill with black
for (var i=0; i<dstData.length; i+=4) {
	dstData[i] = dstData[i+1] = dstData[i+2] = 0;
	dstData[i+3] = 0xff;
}

function defish2(src, dst, strength, zoom) {
	// center
	var midx = width / 2;
	var midy = height / 2;

	
	var r = Math.floor(Math.sqrt(width*width + height*height) / 2);

	var dist = r * 2 / 2.7;//* strength;
	var r2 = r*r;

	for (var x=0; x<width; x++) {
		for (var y=0; y<height; y++) {
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
			} else {
				sx = x;
				sy = y;
			}

			var src_idx = (sy*width + sx) * 4;
			var dst_idx = (y*width + x) * 4;
			if (src_idx != dst_idx) {
//				console.log(src_idx, dst_idx);
			}
			for (var i=0; i<4; i++) {
				dst.data[src_idx + i] = src.data[dst_idx + i];
			}
		}
	}
}


function defish(src, dst, strength, zoom) {
	// center
	var midx = width / 2;
	var midy = height / 2;

	
	var r = Math.floor(Math.sqrt(width*width + height*height) / 2);

	var dist = r * 2 / strength;
	var r2 = r*r;

	for (var x=0; x<width; x++) {
		for (var y=0; y<height; y++) {
			var nx = x - midx;
			var ny = y - midy;
			
			var d2 = nx*nx + ny*ny;
			var sx, sy;

			if (d2 <= r2) {
				var d = Math.floor(Math.sqrt(d2));
				var radius = d / dist;

				var theta = radius>0 ? Math.atan(radius) / radius : 1;
				sx = Math.floor(midx + theta * nx * zoom);
				sy = Math.floor(midy + theta * ny * zoom);

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
			} else {
				sx = x;
				sy = y;
			}

			var src_idx = (sy*width + sx) * 4;
			var dst_idx = (y*width + x) * 4;
			if (src_idx != dst_idx) {
//				console.log(src_idx, dst_idx);
			}
			for (var i=0; i<4; i++) {
				dst.data[dst_idx + i] = src.data[src_idx + i];
			}
		}
	}
}


// save
var dstRawData = {data:dstData, width:width, height:height};

if (filter == 1) {
	defish(rawData, dstRawData, 5.26, 1.86);
} else {
	defish2(rawData, dstRawData, 6, 1.5);
}

var dstJpgData = jpg.encode(dstRawData, 90);
fs.writeFileSync('test-out.jpg', dstJpgData.data);


