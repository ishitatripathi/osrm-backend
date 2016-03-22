var path = require('path');
var util = require('util');
var fs = require('fs');
var exec = require('child_process').exec;

module.exports = function () {
    this.initializeEnv = (callback) => {
        this.DEFAULT_PORT = 5000;
        this.DEFAULT_TIMEOUT = 2000;
        this.setDefaultTimeout(this.DEFAULT_TIMEOUT);
        this.ROOT_FOLDER = process.cwd();
        this.OSM_USER = 'osrm';
        this.OSM_GENERATOR = 'osrm-test';
        this.OSM_UID = 1;
        this.TEST_FOLDER = path.resolve(this.ROOT_FOLDER, 'test');
        this.DATA_FOLDER = path.resolve(this.TEST_FOLDER, 'cache');
        this.OSM_TIMESTAMP = '2000-01-01T00:00:00Z';
        this.DEFAULT_SPEEDPROFILE = 'bicycle';
        this.WAY_SPACING = 100;
        this.DEFAULT_GRID_SIZE = 100;    // meters
        this.PROFILES_PATH = path.resolve(this.ROOT_FOLDER, 'profiles');
        this.FIXTURES_PATH = path.resolve(this.ROOT_FOLDER, 'unit_tests/fixtures');
        this.BIN_PATH = path.resolve(this.ROOT_FOLDER, 'build');
        this.DEFAULT_INPUT_FORMAT = 'osm';
        this.DEFAULT_ORIGIN = [1,1];
        this.LAUNCH_TIMEOUT = 1000;
        this.SHUTDOWN_TIMEOUT = 10000;
        this.DEFAULT_LOAD_METHOD = 'datastore';
        this.OSRM_ROUTED_LOG_FILE = path.resolve(this.TEST_FOLDER, 'osrm-routed.log');
        this.ERROR_LOG_FILE = path.resolve(this.TEST_FOLDER, 'error.log');

        // OS X shim to ensure shared libraries from custom locations can be loaded
        // This is needed in OS X >= 10.11 because DYLD_LIBRARY_PATH is blocked
        // https://forums.developer.apple.com/thread/9233
        this.LOAD_LIBRARIES = process.env.OSRM_SHARED_LIBRARY_PATH ? util.format('DYLD_LIBRARY_PATH=%s ', process.env.OSRM_SHARED_LIBRARY_PATH) : '';

        // TODO make sure this works on win
        if (process.platform.match(/indows.*/)) {
            this.TERMSIGNAL = 9;
            this.EXE = '.exe';
            this.QQ = '"';
        } else {
            this.TERMSIGNAL = 'SIGTERM';
            this.EXE = '';
            this.QQ = '';
        }

        console.log(util.format('Node Version', process.version));
        if (parseInt(process.version.match(/v(\d)/)[1]) < 4) throw new Error('*** PLease upgrade to Node 4.+ to run OSRM cucumber tests');

        if (process.env.OSRM_PORT) {
            this.OSRM_PORT = parseInt(process.env.OSRM_PORT);
            console.log(util.format('Port set to %d', this.OSRM_PORT));
        } else {
            this.OSRM_PORT = this.DEFAULT_PORT;
            console.log(util.format('Using default port %d', this.OSRM_PORT));
        }

        if (process.env.OSRM_TIMEOUT) {
            this.OSRM_TIMEOUT = parseInt(process.env.OSRM_TIMEOUT);
            console.log(util.format('Timeout set to %d', this.OSRM_TIMEOUT));
        } else {
            this.OSRM_TIMEOUT = this.DEFAULT_TIMEOUT;
            console.log(util.format('Using default timeout %d', this.OSRM_TIMEOUT));
        }

        if (!fs.existsSync(this.TEST_FOLDER)) {
            throw new Error(util.format('*** Test folder %s doesn\'t exist.', this.TEST_FOLDER));
        }

        callback();
    }


    this.logTimeAndRun = (cmd) => {
        this.logTime(cmd);
        exec(cmd);
    }

    this.logTime = (cmd) => {
        var d = new Date();
        console.log(util.format('[%d-%d-%d %d:%d:%d:%d] %s'), d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds(), cmd);
        // TODO need to fix date formats -- this prints e.g. 2016-3-5 rt 2016-03-05
        // TODO i think this should be console... but maybe other log? rb had 'puts'
    }


    this.verifyOSRMIsNotRunning = () => {
        if (this.OSRMLoader.up()) {
            throw new Error('*** osrm-routed is already running.');
        }
    }

    this.verifyExistenceOfBinaries = () => {
        ['osrm-extract', 'osrm-prepare', 'osrm-routed'].forEach((bin) => {
            var binPath = path.resolve(util.format('%s/%s%s', this.BIN_PATH, bin, this.EXE));
            if (!fs.existsSync(binPath)) {
                throw new Error(util.format('%s is missing. Build failed?', binPath));
            }

            var helpPath = util.format('%s%s --help > /dev/null 2>&1', this.LOAD_LIBRARIES, binPath);
            exec(helpPath, (err, stdout, stderr) => {
                if (err) {
                    this.log(util.format('*** Exited with code %d', err.code), 'preprocess');
                    throw new Error(util.format('*** %s exited with code %d', helpPath, err.code));
                }
            });
        });
    }

    this.AfterConfiguration = (config) => {
        this.clearLogFiles();
        this.verifyOSRMIsNotRunning();
        this.verifyExistenceOfBinaries();
    }

    process.on('exit', () => {
        if (this.OSRMLoader.loader) this.OSRMLoader.shutdown(() => {});
    });

    process.on('SIGINT', () => {
        process.exit(2);
        // TODO need to handle for windows??
    });
}
