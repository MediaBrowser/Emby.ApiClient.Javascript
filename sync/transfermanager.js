define([], function () {
    'use strict';

    function createDownload(url, folderName, fileName, monitorCompletion, imageUrl) {

        return Promise.reject();
    }

    function downloadFile(url, folderName, localItem, imageUrl) {

        var fileName = localItem.LocalPath;

        return createDownload(url, folderName, fileName, true, imageUrl);
    }

    function downloadSubtitles(url, folderName, fileName) {

        return createDownload(url, folderName, fileName, false);
    }

    function downloadImage(url, folderName, fileName) {
        return createDownload(url, folderName, fileName, false);
    }

    return {
        downloadFile: downloadFile,
        downloadSubtitles: downloadSubtitles,
        downloadImage: downloadImage
    };
});