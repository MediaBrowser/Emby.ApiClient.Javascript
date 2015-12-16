(function (globalScope) {

    function serverSync(connectionManager) {

        var self = this;

        self.sync = function (server, options) {

            if (!server.AccessToken && !server.ExchangeToken) {

                Logger.log('Skipping sync to server ' + server.Id + ' because there is no saved authentication information.');
                return new Promise(function (resolve, reject) {

                    resolve();
                });
            }

            var connectionOptions = {
                updateDateLastAccessed: false,
                enableWebSocket: false,
                reportCapabilities: false
            };

            return connectionManager.connectToServer(server, connectionOptions).then(function (result) {

                if (result.State == MediaBrowser.ConnectionState.SignedIn) {
                    return performSync(server, options);
                } else {
                    Logger.log('Unable to connect to server id: ' + server.Id);
                    return Promise.reject();
                }

            }, function (err) {

                Logger.log('Unable to connect to server id: ' + server.Id);
                throw err;
            });
        };

        function performSync(server, options) {

            Logger.log("Creating ContentUploader to server: " + server.Id);

            options = options || {};

            var uploadPhotos = options.uploadPhotos !== false;

            if (options.cameraUploadServers && options.cameraUploadServers.indexOf(server.Id) == -1) {
                uploadPhotos = false;
            }

            if (!uploadPhotos) {
                return syncOfflineUsers(server, options);
            }

            return new Promise(function (resolve, reject) {

                require(['contentuploader'], function () {

                    new MediaBrowser.ContentUploader(connectionManager).uploadImages(server).then(function () {

                        Logger.log("ContentUploaded succeeded to server: " + server.Id);

                        syncOfflineUsers(server, options).then(resolve, reject);

                    }, function () {

                        Logger.log("ContentUploaded failed to server: " + server.Id);

                        syncOfflineUsers(server, options).then(resolve, reject);
                    });
                });
            });
        }

        function syncOfflineUsers(server, options) {

            if (options.syncOfflineUsers === false) {
                return syncMedia(server, options);
            }

            return new Promise(function (resolve, reject) {

                require(['offlineusersync'], function () {

                    var apiClient = connectionManager.getApiClient(server.Id);

                    new MediaBrowser.OfflineUserSync().sync(apiClient, server).then(function () {

                        Logger.log("OfflineUserSync succeeded to server: " + server.Id);

                        syncMedia(server, options).then(resolve, reject);

                    }, function () {

                        Logger.log("OfflineUserSync failed to server: " + server.Id);

                        reject();
                    });
                });
            });
        }

        function syncMedia(server, options) {

            return new Promise(function (resolve, reject) {

                require(['mediasync'], function () {

                    var apiClient = connectionManager.getApiClient(server.Id);

                    new MediaBrowser.MediaSync().sync(apiClient, server, options).then(function () {

                        Logger.log("MediaSync succeeded to server: " + server.Id);

                        resolve();

                    }, function () {

                        Logger.log("MediaSync failed to server: " + server.Id);

                        reject();
                    });
                });
            });
        }
    }

    if (!globalScope.MediaBrowser) {
        globalScope.MediaBrowser = {};
    }

    globalScope.MediaBrowser.ServerSync = serverSync;

})(this);