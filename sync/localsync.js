define(['appSettings', 'connectionManager'], function (appSettings, connectionManager) {
    'use strict';

    var isSyncing;

    return {

        sync: function (options) {

            console.log('localSync.sync starting...');

            if (isSyncing) {
                return Promise.resolve();
            }

            isSyncing = true;

            return new Promise(function (resolve, reject) {

                require(['multiserversync'], function (MultiServerSync) {

                    options = options || {};

                    options.cameraUploadServers = appSettings.cameraUploadServers();

                    new MultiServerSync().sync(connectionManager, options).then(function () {

                        isSyncing = null;
                        resolve();

                    }, function () {

                        isSyncing = null;
                        reject();
                    });
                });

            });
        }
    };

});