var util = require('util');

module.exports = function () {
    this.When(/^I request nearest I should get$/, (table, callback) => {
        var actual = [];

        this.reprocessAndLoadData(() => {
            var testRow = (row, ri, cb) => {
                var inNode = this.findNodeByName(row.in);
                if (!inNode) throw new Error(util.format('*** unknown in-node "%s"'), row.in);

                var outNode = this.findNodeByName(row.out);
                if (!outNode) throw new Error(util.format('*** unknown out-node "%s"'), row.out);

                this.requestNearest(inNode, this.queryParams, (err, response, body) => {
                    if (err) cb(err);
                    var coord;

                    if (response.statusCode === 200 && response.body.length) {
                        var json = JSON.parse(response.body);

                        coord = json.mapped_coordinate;

                        var got = { in: row.in, out: row.out };

                        var ok = true;

                        Object.keys(row).forEach((key) => {
                            if (key === 'out') {
                                if (this.FuzzyMatch.matchLocation(coord, outNode)) {
                                    got[key] = row[key];
                                } else {
                                    row[key] = util.format('%s [%d,%d]', row[key], outNode.lat, outNode.lon);
                                    ok = false;
                                }
                            }
                        });

                        if (!ok) {
                            var failed = { attempt: 'nearest', query: this.query, response: response };
                            this.logFail(row, got, [failed]);
                        }

                        cb(null, got);
                    }
                    else {
                        cb();
                    }
                });
            };

            this.processRowsAndDiff(table, testRow, callback);
        });
    });
}
