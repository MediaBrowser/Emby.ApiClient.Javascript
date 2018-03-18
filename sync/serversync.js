import MediaSync from './mediasync';
import ContentUploader from './contentuploader';
import localAssetManager from '../localassetmanager';

function performSync(connectionManager, server, options) {

    console.log(`ServerSync.performSync to server: ${server.Id}`);

    options = options || {};

    const cameraUploadServers = options.cameraUploadServers || [];
    console.log("ServerSync cameraUploadServers: " + JSON.stringify(cameraUploadServers));

    const uploadPhotos = cameraUploadServers.includes(server.Id);
    console.log("ServerSync uploadPhotos: " + uploadPhotos);

    const promise = uploadPhotos ? uploadContent(connectionManager, server, options) : Promise.resolve();

    return promise.then(() => syncMedia(connectionManager, server, options));
}

function uploadContent(connectionManager, server, options) {

    return new ContentUploader().uploadImages(connectionManager, server);
}

function syncMedia(connectionManager, server, options) {

    const apiClient = connectionManager.getApiClient(server.Id);

    return new MediaSync().sync(apiClient, localAssetManager, server, options);
}

export default class ServerSync {
    sync(connectionManager, server, options) {

        if (!server.AccessToken && !server.ExchangeToken) {

            console.log(`Skipping sync to server ${server.Id} because there is no saved authentication information.`);
            return Promise.resolve();
        }

        const connectionOptions = {
            updateDateLastAccessed: false,
            enableWebSocket: false,
            reportCapabilities: false,
            enableAutomaticBitrateDetection: false
        };

        return connectionManager.connectToServer(server, connectionOptions).then(result => {

            if (result.State === 'SignedIn') {
                return performSync(connectionManager, server, options);
            } else {
                console.log(`Unable to connect to server id: ${server.Id}`);
                return Promise.reject();
            }

        }, err => {

            console.log(`Unable to connect to server id: ${server.Id}`);
            throw err;
        });
    }
}