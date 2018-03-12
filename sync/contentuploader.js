function getFilesToUpload(files, uploadHistory) {

    return files.filter(file => {

        // Seeing some null entries for some reason
        if (!file) {
            return false;
        }

        return uploadHistory.FilesUploaded.filter(u => getUploadId(file) === u.Id).length === 0;
    });
}

function getUploadId(file) {
    return btoa(file);
}

function uploadNext(files, index, server, apiClient, resolve, reject) {

    const length = files.length;

    if (index >= length) {

        resolve();
        return;
    }

    uploadFile(files[index], apiClient).then(() => {

        uploadNext(files, index + 1, server, apiClient, resolve, reject);
    }, () => {
        uploadNext(files, index + 1, server, apiClient, resolve, reject);
    });
}

function uploadFile(file, apiClient) {

    return import(AppModules.fileUpload).then((FileUpload) => {

        const name = `camera image ${new Date().getTime()}`;

        const url = apiClient.getUrl('Devices/CameraUploads', {
            DeviceId: apiClient.deviceId(),
            Name: name,
            Album: 'Camera Roll',
            Id: getUploadId(file),
            api_key: apiClient.accessToken()
        });

        console.log(`Uploading file to ${url}`);

        return new FileUpload().upload(file, name, url);
    });
}

export default class ContentUploader {
    uploadImages(connectionManager, server) {

        return import(AppModules.cameraRoll).then(cameraRoll => {

            return cameraRoll.getFiles().then(photos => {

                if (!photos.length) {
                    return Promise.resolve();
                }

                const apiClient = connectionManager.getApiClient(server.Id);

                return apiClient.getContentUploadHistory().then(uploadHistory => {

                    photos = getFilesToUpload(photos, uploadHistory);

                    console.log(`Found ${photos.length} files to upload`);

                    return new Promise((resolve, reject) => {

                        uploadNext(photos, 0, server, apiClient, resolve, reject);
                    });

                }, () => Promise.resolve());

            });
        });
    }
}