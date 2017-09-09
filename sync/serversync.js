define([], function () {
    'use strict';

    function performSync(connectionManager, apiClient, options) {

        var serverId = apiClient.serverId();
        console.log("ServerSync.performSync to server: " + serverId);

        options = options || {};

        var uploadPhotos = options.uploadPhotos !== false;

        if (options.cameraUploadServers && options.cameraUploadServers.indexOf(serverId) === -1) {
            uploadPhotos = false;
        }

        var pr = Promise.resolve();

        return pr.then(function () {

            if (uploadPhotos) {
                return uploadContent(connectionManager, apiClient, options);
            }

            return Promise.resolve();

        }).then(function () {

            return syncMedia(connectionManager, apiClient, options);
        });
    }


    function uploadContent(connectionManager, apiClient, options) {

        return new Promise(function (resolve, reject) {

            require(['contentuploader'], function (ContentUploader) {

                var uploader = new ContentUploader();
                uploader.uploadImages(connectionManager, apiClient).then(resolve, reject);
            });
        });
    }

    function syncMedia(connectionManager, apiClient, options) {

        return new Promise(function (resolve, reject) {

            require(['mediasync'], function (MediaSync) {

                new MediaSync().sync(apiClient, options).then(resolve, reject);
            });
        });
    }

    function ServerSync() {

    }

    ServerSync.prototype.sync = function (connectionManager, apiClient, options) {

        var serverId = apiClient.serverId();

        if (!apiClient.accessToken()) {

            console.log('Skipping sync to server ' + serverId + ' because there is no saved authentication information.');
            return Promise.resolve();
        }

        return performSync(connectionManager, apiClient, options);
    };

    return ServerSync;
});