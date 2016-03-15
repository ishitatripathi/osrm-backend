var util = require('util');
var d3 = require('d3-queue');

module.exports = function () {
    var IRouteIShouldGetStep = this.When(/^I route I should get$/, (table, callback) => {
        this.WhenIRouteIShouldGet(table, callback);
    });

    this.When(/^I route (\d+) times I should get$/, (n, table, callback) => {
        var ok = true;

        var q = d3.queue(1);
        // TODO this fails on simultaneous requests because of the process.chdir in run.js -- modify??

        for (var i=0; i<n; i++) {
            q.defer(this.WhenIRouteIShouldGet, table);
        }

        q.awaitAll(callback);
    });
}
