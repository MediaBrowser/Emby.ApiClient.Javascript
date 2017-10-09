define(['serversync'], function (ServerSync) {
    'use strict';

    function syncNext(connectionManager, servers, index, options, resolve, reject) {

        var length = servers.length;

        if (index >= length) {

            console.log('MultiServerSync.sync complete');
            resolve();
            return;
        }

        var server = servers[index];

        console.log("Creating ServerSync to server: " + server.Id);

        new ServerSync().sync(connectionManager, server, options).then(function () {

            console.log("ServerSync succeeded to server: " + server.Id);

            syncNext(connectionManager, servers, index + 1, options, resolve, reject);

        }, function (err) {

            console.log("ServerSync failed to server: " + server.Id + '. ' + err);

            syncNext(connectionManager, servers, index + 1, options, resolve, reject);
        });
    }

    function MultiServerSync() {

    }

    MultiServerSync.prototype.sync = function (connectionManager, options) {

        console.log('MultiServerSync.sync starting...');

        return new Promise(function (resolve, reject) {

            var servers = connectionManager.getSavedServers();

            syncNext(connectionManager, servers, 0, options, resolve, reject);
        });
    };

    return MultiServerSync;
});