var http = require('https'),
    config = require('config'),
    mongo = require('mongodb'),
    monk = require('monk'),
    db = monk(config.mongostr);

var data = '', response = [];

// config
var notifications = config.notifications;

var pushbulletToken = config.pushbulletToken;

try {
    http.get({
            host: 'www.meethue.com',
            port: 443,
            path: '/api/getbridge?token=' + encodeURIComponent(config.hueToken)
        },
        function (resp) {
            resp.setEncoding('utf8');

            resp.on('data', function (chunk) {
                data += chunk;
            });

            resp.on('end', function () {
                try {
                    handleResponse(JSON.parse(data));
                }
                catch (e) {
                    console.log("Got error: " + e.message);
                }
            });
        }).on("error", function (e) {
            console.log("Got error: " + e.message);
        }).end();
}
catch (err) {
    console.log(err);
}

function handleResponse(data) {
    var light, isOn, states = [];
    for (key in data.lights) {
        light = data.lights[key];

        states[light.uniqueid] = {
            name: light.name,
            on: ((light.state.reachable && light.state.on) || (light.state.reachable && light.state.bri > 200))
        };
    }

    handleStates(states);
}

function handleStates(lights) {
    for (id in lights) {
        handleLight(id, lights[id]);
    }
}

function handleLight(id, light) {
    var dbt = db.get('history');

    // check for last status
    dbt.find({ lightId: id }, { limit: 1, sort: { datetime: -1 } }, function (err, res) {
        var state = null;
        var l = light;

        if (typeof res[0] === 'object') {
            state = res[0].state;
        }

        if (state == null || state != light.on) {
            // update
            dbt.insert({
                lightId: id,
                name: light.name,
                state: light.on,
                datetime: new Date()
            });

            handleUpdate(id, light);
        }
    });
}

function handleUpdate(id, light) {
    if (id in notifications && notifications[id] == true) {
        // pushbullet notification
        var note = {"type": "note", "title": light.name + ' is nu ' + (light.on ? 'aan' : 'uit'), "body": ''};
        var noteStr = JSON.stringify(note);
        var headers = {
            'Content-Type': 'application/json',
            'Content-Length': noteStr.length
        };

        var options = {
            host: 'api.pushbullet.com',
            port: 443,
            path: '/v2/pushes',
            method: 'POST',
            headers: headers,
            auth: pushbulletToken + ':'
        };

        var req = http.request(options, function(res) {
            res.setEncoding('utf-8');

            var responseString = '';

            res.on('data', function(data) {
                responseString += data;
            });

            res.on('end', function() {
                var resultObject = JSON.parse(responseString);

                var dbt = db.get('pushes');
                dbt.insert(resultObject);
            });
        });

        req.write(noteStr);
        req.end();
    }
}

setTimeout(function() {
    process.exit();
}, 10000);