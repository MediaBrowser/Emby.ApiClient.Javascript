define([], function () {
    'use strict';

    function performSync(connectionManager, server, options) {

        console.log("ServerSync.performSync to server: " + server.Id);

        options = options || {};

        var uploadPhotos = options.uploadPhotos !== false;

        if (options.cameraUploadServers && options.cameraUploadServers.indexOf(server.Id) === -1) {
            uploadPhotos = false;
        }

        var pr = Promise.resolve();

        return pr.then(function () {

            if (uploadPhotos) {
                return uploadContent(connectionManager, server, options);
            }

            return Promise.resolve();

        }).then(function () {

            return syncMedia(connectionManager, server, options);
        });
    }


    function uploadContent(connectionManager, server, options) {

        return new Promise(function (resolve, reject) {

            require(['contentuploader'], function (contentuploader) {

                uploader = new ContentUploader(connectionManager);
                uploader.uploadImages(server).then(resolve, reject);
            });
        });
    }

    function syncMedia(connectionManager, server, options) {

        return new Promise(function (resolve, reject) {

            require(['mediasync'], function (MediaSync) {

                var apiClient = connectionManager.getApiClient(server.Id);

                new MediaSync().sync(apiClient, server, options).then(resolve, reject);
            });
        });
    }

    function ServerSync() {

    }

    ServerSync.prototype.sync = function (connectionManager, server, options) {

        if (!server.AccessToken && !server.ExchangeToken) {

            console.log('Skipping sync to server ' + server.Id + ' because there is no saved authentication information.');
            return Promise.resolve();
        }

        var connectionOptions = {
            updateDateLastAccessed: false,
            enableWebSocket: false,
            reportCapabilities: false,
            enableAutomaticBitrateDetection: false
        };

        return connectionManager.connectToServer(server, connectionOptions).then(function (result) {

            if (result.State === MediaBrowser.ConnectionState.SignedIn) {
                return performSync(server, options);
            } else {
                console.log('Unable to connect to server id: ' + server.Id);
                return Promise.reject();
            }

        }, function (err) {

            console.log('Unable to connect to server id: ' + server.Id);
            throw err;
        });
    };

    return ServerSync;
});