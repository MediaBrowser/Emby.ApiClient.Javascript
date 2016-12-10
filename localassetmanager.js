define(['filerepository', 'itemrepository', 'userrepository', 'useractionrepository', 'transfermanager', 'cryptojs-md5'], function (filerepository, itemrepository, userrepository, useractionrepository, transfermanager) {
    'use strict';

    function getLocalItem(serverId, itemId) {
        var id = getLocalId(serverId, itemId);
        return itemrepository.get(id);
    }

    function getLocalItemById(id) {
        return itemrepository.get(id);
    }

    function getLocalItems(localItemIds) {
        var list = [];

        localItemIds.forEach(function (id) {
            var res = itemrepository.get(id);
            list.push(res);
        });

        return Promise.all(list).then(function (values) {
            return values;
        });
    }

    function getLocalId(serverId, itemId) {

        return CryptoJS.MD5(serverId + itemId).toString();
    }

    function saveOfflineUser(user) {
        return userrepository.set(user.Id, user);
    }

    function deleteOfflineUser(id) {
        return userrepository.remove(id);
    }

    //TODO:
    function getCameraPhotos() {
        return Promise.resolve([]);
    }

    function recordUserAction(action) {

        action.Id = createGuid();
        return useractionrepository.set(action.Id, action);
    }

    function getUserActions(serverId) {
        return useractionrepository.getByServerId(serverId);
    }

    function deleteUserAction(action) {
        return useractionrepository.remove(action.Id);
    }

    function deleteUserActions(actions) {
        var results = [];

        actions.forEach(function (action) {
            results.push(deleteUserAction(action));
        });

        return Promise.all(results);
    }

    function getServerItemIds(serverId) {
        return itemrepository.getServerItemIds(serverId);
    }

    function getServerItems(serverId) {

        return itemrepository.getServerIds(serverId).then(function (localIds) {

            var actions = localIds.map(function (id) {
                return getLocalItemById(id);
            });

            return Promise.all(actions).then(function (items) {

                return Promise.resolve(items);
            });
        });
    }

    function removeLocalItem(localItem) {

        return itemrepository.get(localItem.Id).then(function (item) {
            return filerepository.deleteFile(item.LocalPath).then(function () {
                var p = Promise.resolve(true);

                if (item.AdditionalFiles) {
                    item.AdditionalFiles.forEach(function (file) {
                        p = p.then(function () {
                            return filerepository.deleteFile(file);
                        });
                    });
                }

                return p.then(itemrepository.remove(localItem.Id));

            }, function (error) {

                var p = Promise.resolve(true);

                if (item.AdditionalFiles) {
                    item.AdditionalFiles.forEach(function (file) {
                        p = p.then(function (item) {
                            return filerepository.deleteFile(file);
                        });
                    });
                }

                return p.then(itemrepository.remove(localItem.Id));
            });
        });
    }

    function addOrUpdateLocalItem(localItem) {
        return itemrepository.set(localItem.Id, localItem);
    }

    function createLocalItem(libraryItem, serverInfo, jobItem) {

        var path = getDirectoryPath(libraryItem, serverInfo);
        var localFolder = filerepository.getFullLocalPath(path);

        path.push(getLocalFileName(libraryItem, jobItem.OriginalFileName));

        var localPath = filerepository.getFullLocalPath(path);

        for (var i = 0; i < libraryItem.MediaSources.length; i++) {
            var mediaSource = libraryItem.MediaSources[i];
            mediaSource.Path = localPath;
            mediaSource.Protocol = 'File';
        }

        var item = {

            Item: libraryItem,
            ItemId: libraryItem.Id,
            ServerId: serverInfo.Id,
            LocalPath: localPath,
            LocalFolder: localFolder,
            Id: getLocalId(serverInfo.Id, libraryItem.Id),
            SyncJobItemId: jobItem.SyncJobItemId
        };

        return Promise.resolve(item);
    }

    function getLocalFilePath(localItem, fileName) {

        var localPathArray = [localItem.LocalFolder, fileName];
        var localFilePath = filerepository.getFullLocalPath(localPathArray);

        return localFilePath;
    }

    function getSubtitleSaveFileName(mediaPath, language, isForced, format) {

        var name = getNameWithoutExtension(mediaPath);

        if (language) {
            name += "." + language.toLowerCase();
        }

        if (isForced) {
            name += ".foreign";
        }

        return name + "." + format.toLowerCase();
    }

    function getItemFileSize(path) {
        return filerepository.getItemFileSize(path);
    }

    function getNameWithoutExtension(path) {

        var fileName = path;

        var pos = fileName.lastIndexOf(".");

        if (pos > 0) {
            fileName = fileName.substring(0, pos);
        }

        return fileName;
    }

    function downloadFile(url, localItem) {

        return transfermanager.downloadFile(url, localItem);
    }

    function downloadSubtitles(url, fileName) {

        return transfermanager.downloadSubtitles(url, fileName);
    }

    function hasImage(serverId, itemId, imageTag) {
        return imageRepository.hasImage(getImageRepositoryId(serverId, itemId), imageId);
    }

    function downloadImage(url, fileName) {

        return transfermanager.downloadImage(url, fileName);
    }

    function isDownloadInQueue(externalId) {
        return transfermanager.isDownloadInQueue(externalId);
    }

    function fileExists(path) {
        return Promise.resolve(false);
    }

    function translateFilePath(path) {
        return Promise.resolve(path);
    }

    // Helpers ***********************************************************

    function getDirectoryPath(item, server) {

        var parts = [];
        parts.push(server.Name);

        var itemtype = item.Type.toLowerCase();

        if (itemtype === 'episode') {

            parts.push("TV");

            var seriesName = item.SeriesName;
            if (seriesName) {
                parts.push(seriesName);
            }

            var seasonName = item.SeasonName;
            if (seasonName) {
                parts.push(seasonName);
            }

        } else if (itemtype === 'video') {

            parts.push("Videos");
            parts.push(item.Name);

        } else if (itemtype === 'audio') {

            parts.push("Music");

            var albumArtist = item.AlbumArtist;
            if (albumArtist) {
                parts.push(albumArtist);
            }

            if ((item.AlbumId) && (item.Album)) {
                parts.push(item.Album);
            }

        } else if (itemtype === 'photo') {

            parts.push("Photos");

            if ((item.AlbumId) && (item.Album)) {
                parts.push(item.Album);
            }

        }

        var finalParts = [];
        for (var i = 0; i < parts.length; i++) {

            finalParts.push(filerepository.getValidFileName(parts[i]));
        }

        return finalParts;
    }

    function getLocalFileName(item, originalFileName) {

        var filename = originalFileName || item.Name;

        return filerepository.getValidFileName(filename);
    }



    function createGuid() {
        var d = new Date().getTime();
        if (window.performance && typeof window.performance.now === "function") {
            d += performance.now(); //use high-precision timer if available
        }
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        return uuid;
    }

    return {

        getLocalItem: getLocalItem,
        saveOfflineUser: saveOfflineUser,
        deleteOfflineUser: deleteOfflineUser,
        getCameraPhotos: getCameraPhotos,
        recordUserAction: recordUserAction,
        getUserActions: getUserActions,
        deleteUserAction: deleteUserAction,
        deleteUserActions: deleteUserActions,
        getServerItemIds: getServerItemIds,
        removeLocalItem: removeLocalItem,
        addOrUpdateLocalItem: addOrUpdateLocalItem,
        createLocalItem: createLocalItem,
        downloadFile: downloadFile,
        downloadSubtitles: downloadSubtitles,
        hasImage: hasImage,
        downloadImage: downloadImage,
        fileExists: fileExists,
        translateFilePath: translateFilePath,
        getLocalFilePath: getLocalFilePath,
        getSubtitleSaveFileName: getSubtitleSaveFileName,
        getLocalItems: getLocalItems,
        getLocalItemById: getLocalItemById,
        getServerItems: getServerItems,
        getItemFileSize: getItemFileSize,
        isDownloadInQueue: isDownloadInQueue
    };
});