var assert = require('assert');

module.exports = function () {
    this.When(/^I request \/(.*)$/, (path) => {
        this.reprocess();
        this.OSRMLoader.load(util.format('%s.osrm', this.osmData.preparedFile), () => {
            this.response = this.requestPath(path, []);
        });
    });

    this.Then(/^I should get a response/, () => {
        assert.equal(this.response.code, '200');
        assert.ok(this.response.body);
        assert.ok(this.response.body.length);
    });

    this.Then(/^response should be valid JSON$/, () => {
        this.json = JSON.parse(this.response.body);
    });

    this.Then(/^response should be well-formed$/, () => {
        assert.equal(typeof this.json.status, 'number');
    });

    this.Then(/^status code should be (\d+)$/, (code) => {
        this.json = JSON.parse(this.response.body);
        assert.equal(this.json.status, parseInt(code));
    });

    this.Then(/^status message should be "(.*?)"$/, (message) => {
        this.json = JSON.parse(this.response.body);
        assert(this.json.status_message, message);
    });

    this.Then(/^response should be a well-formed route$/, () => {
        this.step("response should be well-formed");
        assert.equal(typeof this.json.status_message, 'string');
        assert.equal(typeof this.json.route_summary, 'object');
        assert.equal(typeof this.json.route_geometry, 'string');
        assert.ok(Array.isArray(this.json.route_instructions));
        assert.ok(Array.isArray(this.json.via_points));
        assert.ok(Array.isArray(this.json.via_indices));
    });

    this.Then(/^"([^"]*)" should return code (\d+)$/, (binary, code) => {
        assert.ok(this.processError instanceof this.OSRMError);
        assert.equal(this.processError.process, binary);
        assert.equal(parseInt(this.processError.code), parseInt(code));
    });
}
