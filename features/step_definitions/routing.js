var util = require('util');
var d3 = require('d3-queue');

module.exports = function () {
    this.When(/^I route I should get$/, (table, callback) => {
        var actual = [];
        this.reprocessAndLoadData(() => {
            var headers = new Set(table.raw()[0]);

            var requestRow = (row, ri, cb) => {
                var got,
                    json;

                var afterRequest = (err, res, body) => {
                    var instructions, bearings, compasses, turns, modes, times, distances;

                    if (body && body.length) {
                        json = JSON.parse(body);

                        if (json.status === 200) {
                            instructions = this.wayList(json.route_instructions);
                            bearings = this.bearingList(json.route_instructions);
                            compasses = this.compassList(json.route_instructions);
                            turns = this.turnList(json.route_instructions);
                            modes = this.modeList(json.route_instructions);
                            times = this.timeList(json.route_instructions);
                            distances = this.distanceList(json.route_instructions);
                        }
                    }

                    if (headers.has('status')) {
                        got.status = json.status.toString();
                    }

                    if (headers.has('message')) {
                        got.message = json.status_message;
                    }

                    if (headers.has('#')) {
                        // comment column
                        got['#'] = row['#'];
                    }

                    // TODO this feels like has been repeated from elsewhere.....

                    if (headers.has('start')) {
                        got.start = instructions ? json.route_summary.start_point : null;
                    }

                    if (headers.has('end')) {
                        got.end = instructions ? json.route_summary.end_point : null;
                    }

                    if (headers.has('geometry')) {
                        got.geometry = json.route_geometry;
                    }

                    if (headers.has('route')) {
                        got.route = (instructions || '').trim();

                        if (headers.has('alternative')) {
                            got.alternative = json.found_alternative ?
                                wayList(json.alternative_instructions[0]) : '';
                        }

                        var distance = json.route_summary.total_distance,
                            time = json.route_summary.total_time;

                        if (headers.has('distance')) {
                            if (row.distance.length) {
                                if (!row.distance.match(/\d+m/))
                                    throw new Error('*** Distance must be specified in meters. (ex: 250m)');
                                got.distance = instructions ? util.format('%dm', distance) : '';
                            }
                        }

                        if (headers.has('time')) {
                            if (!row.time.match(/\d+s/))
                                throw new Error('*** Time must be specied in seconds. (ex: 60s)');
                            got.time = instructions ? util.format('%ds', time) : '';
                        }

                        if (headers.has('speed')) {
                            if (row.speed !== '' && instructions) {
                                if (!row.speed.match(/\d+ km\/h/))
                                    throw new Error('*** Speed must be specied in km/h. (ex: 50 km/h)');
                                var speed = time > 0 ? Math.round(3.6*distance/time) : null;
                                got.speed = util.format('%d km/h', speed);
                            } else {
                                got.speed = '';
                            }
                        }

                        function putValue(key, value) {
                            if (headers.has(key)) got[key] = instructions ? value : '';
                        }

                        putValue('bearing', bearings);
                        putValue('compass', compasses);
                        putValue('turns', turns);
                        putValue('modes', modes);
                        putValue('times', times);
                        putValue('distances', distances);
                    }

                    ok = true;

                    for (var key in row) {
                        if (this.FuzzyMatch.match(got[key], row[key])) {
                            got[key] = row[key];
                        } else {
                            ok = false;
                        }
                    }

                    if (!ok) {
                        this.logFail(row, got, { route: { query: this.query, response: res }});
                    }

                    cb(null, got);
                }

                if (row.request) {
                    got = { request: row.request };
                    requestUrl(row.request, afterRequest);
                } else {
                    var defaultParams = this.queryParams;
                    var userParams = [];
                    got = {};
                    for (var k in row) {
                        var match = k.match(/param:(.*)/);
                        if (match) {
                            if (row[k] === '(nil)') {
                                userParams.push([match[1], null]);
                            } else if (row[k]) {
                                userParams.push([match[1], row[k]]);
                            }
                            got[k] = row[k];
                        }
                    }

                    var params = this.overwriteParams(defaultParams, userParams),
                        waypoints = [],
                        bearings = [];

                    if (row.bearings) {
                        got.bearings = row.bearings;
                        bearings = row.bearings.split(' ').filter(b => !!b);
                    }

                    if (row.from && row.to) {
                        var fromNode = this.findNodeByName(row.from);
                        if (!fromNode) throw new Error(util.format('*** unknown from-node "%s"'), row.from);
                        waypoints.push(fromNode);

                        var toNode = this.findNodeByName(row.to);
                        if (!toNode) throw new Error(util.format('*** unknown to-node "%s"'), row.to);
                        waypoints.push(toNode);

                        got.from = row.from;
                        got.to = row.to;
                        this.requestRoute(waypoints, bearings, params, afterRequest);
                    } else if (row.waypoints) {
                        row.waypoints.split(',').forEach((n) => {
                            // TODO again this might need to be trimmed *before* split
                            var node = this.findNodeByName(n.trim());
                            if (!node) throw new Error('*** unknown waypoint node "%s"', n.trim());
                            waypoints.push(node);
                        });
                        got.waypoints = row.waypoints;
                        this.requestRoute(waypoints, bearings, params, afterRequest);
                    } else {
                        throw new Error('*** no waypoints');
                    }
                }
            };

            var q = d3.queue();
            table.hashes().forEach((row, ri) => { q.defer(requestRow, row, ri); });
            q.awaitAll((err, gotArray) => {
                this.diffTables(table, gotArray, {}, callback);
            });
        });
    });

    this.When(/^I route (\d+) times I should get$/, (n, table) => {
        var ok = true;
        for (var i=0; i<n; i++) {
            if (!step('I route I should get', table)) ok = false;
        }
        return ok;
    });
}
