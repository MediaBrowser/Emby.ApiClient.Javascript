import MultiServerSync from './multiserversync.js';

let isSyncing;

export default {

    sync(connectionManager, options) {

        console.log('localSync.sync starting...');

        if (isSyncing) {
            return Promise.resolve();
        }

        isSyncing = true;

        options = options || {};

        // TODO, get from appSettings
        options.cameraUploadServers = [];

        return new MultiServerSync().sync(connectionManager, options).then(() => {

            isSyncing = null;
            return Promise.resolve();

        }, err => {

            isSyncing = null;
            return Promise.reject(err);
        });
    }
};