var util = require('util');
var Timeout = require('node-timeout');

module.exports = function () {
    // this.STRESS_TIMEOUT = 300;

    this.BeforeFeatures((features, callback) => {
        this.pid = null;
        this.initializeEnv(() => {
            this.initializeOptions(callback);
        });
    });

    this.Before((scenario, callback) => {
        // fetch scenario and feature name, so we can use it in log files if needed

        // TODO idk if this is in cucumber.js
        // switch (scenario) {
        //     case Cucumber.RunningTestCase
        // }
          // case scenario
          //   when Cucumber::RunningTestCase::Scenario
          //     @feature_name = scenario.feature.name
          //     @scenario_title = scenario.name
          //   when Cucumber::RunningTestCase::ExampleRow
          //     @feature_name = scenario.scenario_outline.feature.name
          //     @scenario_title = scenario.scenario_outline.name
          // end
        this.scenarioTitle = scenario.getName();
        // this.scenarioTitle = scenario.name;

        this.loadMethod = this.DEFAULT_LOAD_METHOD;
        this.queryParams = [];
        var d = new Date();
        this.scenarioTime = util.format('%d-%d-%dT%s:%s:%sZ', d.getFullYear(), d.getMonth()+1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
        this.resetData();
        this.hasLoggedPreprocessInfo = false;
        this.hasLoggedScenarioInfo = false;
        this.setGridSize(this.DEFAULT_GRID_SIZE);
        this.setOrigin(this.DEFAULT_ORIGIN);
        callback();
    });

    this.After((scenario, callback) => {
        this.setExtractArgs('');
        if (this.loadMethod === 'directly') this.OSRMLoader.shutdown(callback);
        else callback();
    });

    this.Around('@stress', (scenario, callback) => {
        setTimeout(callback, this.STRESS_TIMEOUT);
    });
}
