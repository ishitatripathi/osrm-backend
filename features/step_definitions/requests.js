var assert = require('assert');

module.exports = function () {
    this.When(/^I request \/(.*)$/, (path, callback) => {
        this.reprocessAndLoadData(() => {
            this.response = this.requestPath(path, [], callback);
        });
    });

    this.Then(/^I should get a response/, () => {
        assert.equal(this.response.code, '200');
        assert.ok(this.response.body);
        assert.ok(this.response.body.length);
    });

    this.Then(/^response should be valid JSON$/, (callback) => {
        try {
            this.json = JSON.parse(this.response.body);
            callback();
        } catch (e) {
            callback(e);
        }
    });

    this.Then(/^response should be well-formed$/, () => {
        assert.equal(typeof this.json.status, 'number');
    });

    this.Then(/^status code should be (\d+)$/, (code, callback) => {
        try {
            this.json = JSON.parse(this.response.body);
            assert.equal(this.json.status, parseInt(code));
            callback();
        } catch(e) {
            callback(e);
        }
    });

    this.Then(/^status message should be "(.*?)"$/, (message, callback) => {
        try {
            this.json = JSON.parse(this.response.body);
            assert(this.json.status_message, message);
            callback();
        } catch(e) {
            callback(e);
        }
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
