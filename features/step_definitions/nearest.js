var util = require('util');

module.exports = function () {
    this.When(/^I request nearest I should get$/, (table) => {
        this.reprocess();
        var actual = [];

        this.OSRMLoader.load(util.format('%s.osrm', this.osmData.preparedFile), () => {
            table.hashes().forEach((row, ri) => {
                var inNode = this.findNodeByName(row.in);
                if (!inNode) throw new Error(util.format('*** unknown in-node "%s"'), row.in);

                var outNode = this.findNodeByName(row.out);
                if (!outNode) throw new Error(util.format('*** unknown out-node "%s"'), row.out);

                var response = requestNearest(inNode, this.queryParams);

                var coord;

                if (response.code === '200' && response.body.length) {
                    var json = JSON.parse(response.body);

                    if (json.status === 200) {
                        coord = json.mapped_coordinate;
                    }
                }

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

                actual.push(got);
            });
        });

        // TODO this again
        // is this a return maybe?
        return table.diff(actual);
    });

    this.When(/^I request nearest (\d+) times I should get$/, (n, table) => {
        var ok = true;

        for (var i=0; i<parseInt(n); i++) {
            // TODO see below for rb version -- i know what this should do but not pos how cucumber.js step method works
            ok = this.step('I request nearest I should get', table);
        }

        return ok;
    });
    // When /^I request nearest (\d+) times I should get$/ do |n,table|
    //   ok = true
    //   n.to_i.times do
    //     ok = false unless step "I request nearest I should get", table
    //   end
    //   ok
    // end
}
