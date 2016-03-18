'use strict';

var fs = require('fs');
var net = require('net');
var spawn = require('child_process').spawn;
var util = require('util');
var Timeout = require('node-timeout');
// var waitpid = require('waitpid');

var OSRMBaseLoader = class {
    constructor (scope) {
        this.scope = scope;
    }

    launch (callback) {
        var limit = Timeout(this.scope.LAUNCH_TIMEOUT, { err: this.scope.RoutedError('Launching osrm-routed timed out.') });

        var runLaunch = (cb) => {
            this.osrmUp(() => {
                this.waitForConnection(cb);
            });
        };

        runLaunch(limit((e) => { if (e) callback(e); callback(); }));
    }

    shutdown (callback) {
        var limit = Timeout(this.scope.SHUTDOWN_TIMEOUT, { err: this.scope.RoutedError('Shutting down osrm-routed timed out.')});

        var runShutdown = (cb) => {
            this.osrmDown(cb);
        };

        runShutdown(limit((e) => { if (e) callback(e); callback(); }));
    }

    osrmIsRunning () {
        return !!this.pid && this.child && !this.child.killed;
    }

    osrmDown (callback) {
        // callback()
        if (this.pid) {
            // TODO what is up w this
            console.log('kill', this.pid)
            process.kill(this.pid, this.scope.TERMSIGNAL);
            this.waitForShutdown(callback);
            this.pid = null;
        } else callback(true);
    }

    // TODO is this used?
    kill () {
        if (this.pid) process.kill(this.pid, 'SIGKILL');
    }

    waitForConnection (callback) {
        var socket = net.connect({
            port: this.scope.OSRM_PORT,
            host: '127.0.0.1'
        })
            .on('connect', (c) => {
                callback();
            })
            .on('error', (e) => {
                setTimeout(callback, 100);
            });
    }

    waitForShutdown (callback) {
        var check = () => {
            // TODO this isn't working -- i think process is ending before the timeout
                if (!this.osrmIsRunning()) callback();
            };
        setTimeout(check, 100);

        // TODO I don't think the shutdown timeout is working -- managed to OOM this after ~20-30 seconds w a bad while loop
    }
}

var OSRMDirectLoader = class extends OSRMBaseLoader {
    constructor (scope) {
        super(scope);
    }

    load (inputFile, callback) {
        this.inputFile = inputFile;
        var startDir = process.cwd();
        this.launch(() => {
            this.shutdown(callback);
        });
    }

    osrmUp (callback) {
        console.log('UP PID', this.pid)
        if (this.pid) return callback();
        var writeToLog = (data) => {
            fs.appendFileSync(this.scope.OSRM_ROUTED_LOG_FILE, data);
        }

        var child = spawn(util.format('%s%s/osrm-routed', this.scope.LOAD_LIBRARIES, this.scope.BIN_PATH), [this.input_file, util.format('-p%d', this.scope.OSRM_PORT)], {detached: true});
        console.log("PID:::::", child.pid)
        this.pid = child.pid;
        child.stdout.on('data', writeToLog);
        child.stderr.on('data', writeToLog);

        callback();
    }
}

var OSRMDatastoreLoader = class extends OSRMBaseLoader {
    constructor (scope) {
        super(scope);
    }

    load (inputFile, callback) {
        this.inputFile = inputFile;
        var startDir = process.cwd();
        this.loadData(() => {
            if (!this.pid) return this.launch(callback);
            else callback();
        });
    }

    loadData (callback) {
        this.scope.runBin('osrm-datastore', this.inputFile, callback);
    }

    osrmUp (callback) {
        console.log('UP PID', this.pid)
        if (this.pid) return callback();
        var writeToLog = (data) => {
            fs.appendFileSync(this.scope.OSRM_ROUTED_LOG_FILE, data);
        }

        var child = spawn(util.format('%s%s/osrm-routed', this.scope.LOAD_LIBRARIES, this.scope.BIN_PATH), ['--shared-memory=1', util.format('-p%d', this.scope.OSRM_PORT)], {detached: true});
        this.child = child;
        console.log("PID:::::", child.pid)
        this.pid = child.pid;
        child.stdout.on('data', writeToLog);
        child.stderr.on('data', writeToLog);

        callback();
    }
}

module.exports = {
    OSRMBaseLoader: OSRMBaseLoader,

    _OSRMLoader: class {
        constructor (scope) {
            this.scope = scope;
            this.loader = null;
        }

        load (inputFile, callback) {
            var method = this.scope.loadMethod,
                loader;
            if (method === 'datastore') {
                this.loader = new OSRMDatastoreLoader(this.scope);
                this.loader.load(inputFile, callback);
            } else if (method === 'directly') {
                this.loader = new OSRMDirectLoader(this.scope);
                this.loader.load(inputFile, callback);
            } else {
                throw new Error('*** Unknown load method ' + method);
            }
        }

        shutdown (callback) {
            if (!this.loader) {
                // TODO: ??
                console.error('what there is no loader?');
            }
            this.loader.shutdown(callback);
        }
    }
}
