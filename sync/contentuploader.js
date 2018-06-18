function getFilesToUpload(files, uploadHistory) {

    return files.filter(file => {

        // Seeing some null entries for some reason
        if (!file) {
            return false;
        }

        const uploadId = getUploadId(file);

        return uploadHistory.FilesUploaded.filter(u => uploadId === u.Id).length === 0;
    });
}

function getUploadId(file) {
    return btoa(`${file.Id}1`);
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

        const url = apiClient.getUrl('Devices/CameraUploads', {
            DeviceId: apiClient.deviceId(),
            Name: file.Name,
            Album: 'Camera Roll',
            Id: getUploadId(file),
            api_key: apiClient.accessToken()
        });

        console.log(`Uploading file to ${url}`);

        return new FileUpload().upload(file, url);
    });
}

export default class ContentUploader {
    uploadImages(connectionManager, server) {

        return import(AppModules.cameraRoll).then(cameraRoll => {

            return cameraRoll.getFiles().then(files => {

                if (!files.length) {
                    return Promise.resolve();
                }

                const apiClient = connectionManager.getApiClient(server.Id);

                return apiClient.getContentUploadHistory().then(uploadHistory => {

                    files = getFilesToUpload(files, uploadHistory);

                    console.log(`Found ${files.length} files to upload`);

                    return new Promise((resolve, reject) => {

                        uploadNext(files, 0, server, apiClient, resolve, reject);
                    });

                }, () => Promise.resolve());

            });
        });
    }
}