var util = require('util');

module.exports = function () {
    this.When(/^I plan a trip I should get$/, (table) => {
        this.reprocess();
        var actual = [];
        this.OSRMLoader.load(util.format('%s.osrm', this.osmData.preparedFile), () => {
            table.hashes().forEach((row, ri) => {
                var got = {},
                    response;
                if (row.request) {
                    got.request = row.request;
                    response = this.requestUrl(row.request);
                } else {
                    var params = this.queryParams,
                        waypoints = [];
                    if (row.from && row.to) {
                        var fromNode = this.findNodeByName(row.from);
                        if (!fromNode) throw new Error(util.format('*** unknown from-node "%s"', row.from));
                        waypoints.push(fromNode);

                        var toNode = this.findNodeByName(row.to);
                        if (!toNode) throw new Error(util.format('*** unknown to-node "%s"', row.to));
                        waypoints.push(toNode);

                        got = { from: row.from, to: row.to };
                        response = this.requestTrip(waypoints, params);
                    } else if (row.waypoints) {
                        row.waypoints.split(',').forEach((n) => {
                            var node = this.findNodeByName(n);
                            if (!node) throw new Error(util.format('*** unknown waypoint node "%s"', n.trim()));
                            waypoints.push(node);
                        });
                        got = { waypoints: row.waypoints };
                        response = this.requestTrip(waypoints, params);
                    } else {
                        throw new Error('*** no waypoints');
                    }
                }

                for (var k in row) {
                    var match = k.match(/param:(.*)/);
                    if (row[k] === '(nil)') {
                        params[match[1]] = null;
                    } else if (row[k]) {
                        params[match[1]] = [row[k]];
                    }

                    got[k] = row[k];
                }

                var json = {};      // TODO i prob need to do this for all the rest
                if (response.body.length) {
                    json = JSON.parse(response.body);
                }

                if (table.headers.status) got.status = json.status.toString();
                if (table.headers.message) got.message = json.status_message;
                if (table.headers['#']) got['#'] = row['#'];    // comment column

                var subTrips;
                if (response.code === '200') {
                    if (table.headers.trips) {
                        subTrips = json.trips.filter(t => !!f).map(sub => sub.via_points);
                    }
                }

                var ok = true,
                    encodedResult = '',
                    extendedTarget = '';

                row.trips.split(',').forEach((sub, si) => {
                    if (si >= subTrips.length) {
                        ok = false;
                    } else {
                        ok = false;
                        // TODO: Check all rotations of the round trip                 <== ported comment not my TODO
                        for (var ni=0; ni<sub.length; ni++) {
                            var node = this.findNodeByName(sub[ni]),
                                outNode = subTrips[si][ni];
                            if (this.FuzzyMatch.matchLocation(outNode, node)) {
                                encodedResult += sub[ni];
                                extendedTarget += sub[ni];
                                ok = true;
                            } else {
                                encodedResult += util.format('? [%s,%s]', outNode[0], outNode[1]);
                                extendedTarget += util.format('%s [%d,%d]', sub[ni], node.lat, node.lon);
                            }
                        }
                    }
                });

                if (ok) {
                    got.trips = row.trips;
                    got.via_points = row.via_points;
                } else {
                    got.trips = encodedResult;
                    got.trips = extendedTarget;
                    this.logFail(row, got, { trip: { query: this.query, response: response }});
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
                    this.logFail(row, got, { trip: { query: this.query, response: response }});
                }

                actual.push(got);
            });
        });

        // TODO again
        return table.diff(actual);
    });
}
