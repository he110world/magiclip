var fs = require('fs');
var net = require('net');
var WII_ADDRESS = '/var/tmp/wii.sock';

// This server listens on a Unix socket at /var/run/mysocket
var server = net.createServer(function(sock) {
	sock.on('data', function(data){
		console.log(data.toString());
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
