define(['filerepository', 'itemrepository', 'useractionrepository', 'transfermanager', 'cryptojs-md5'], function (filerepository, itemrepository, useractionrepository, transfermanager) {
    'use strict';

    function getLocalItem(serverId, itemId) {
        return itemrepository.get(serverId, itemId);
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

    function getServerItems(serverId) {

        return itemrepository.getAll(serverId);
    }

    function getItemsFromIds(serverId, ids) {

        var actions = ids.map(function (id) {
            var strippedId = stripStart(id, 'local:');

            return getLocalItem(serverId, strippedId);
        });

        return Promise.all(actions).then(function (items) {

            var libItems = items.map(function (locItem) {

                return locItem.Item;
            });


            return Promise.resolve(libItems);
        });
    }

    function getViews(serverId, userId) {

        return itemrepository.getServerItemTypes(serverId, userId).then(function (types) {

            var list = [];
            var item;

            if (types.indexOf('audio') > -1) {

                item = {
                    Name: 'Music',
                    ServerId: serverId,
                    Id: 'localview:MusicView',
                    Type: 'MusicView',
                    CollectionType: 'music',
                    IsFolder: true
                };

                list.push(item);
            }

            if (types.indexOf('photo') > -1) {

                item = {
                    Name: 'Photos',
                    ServerId: serverId,
                    Id: 'localview:PhotosView',
                    Type: 'PhotosView',
                    CollectionType: 'photos',
                    IsFolder: true
                };

                list.push(item);
            }

            if (types.indexOf('episode') > -1) {

                item = {
                    Name: 'TV',
                    ServerId: serverId,
                    Id: 'localview:TVView',
                    Type: 'TVView',
                    CollectionType: 'tvshows',
                    IsFolder: true
                };

                list.push(item);
            }

            if (types.indexOf('movie') > -1) {

                item = {
                    Name: 'Movies',
                    ServerId: serverId,
                    Id: 'localview:MoviesView',
                    Type: 'MoviesView',
                    CollectionType: 'movies',
                    IsFolder: true
                };

                list.push(item);
            }

            if (types.indexOf('video') > -1) {

                item = {
                    Name: 'Videos',
                    ServerId: serverId,
                    Id: 'localview:VideosView',
                    Type: 'VideosView',
                    CollectionType: 'videos',
                    IsFolder: true
                };

                list.push(item);
            }

            if (types.indexOf('musicvideo') > -1) {

                item = {
                    Name: 'Music Videos',
                    ServerId: serverId,
                    Id: 'localview:MusicVideosView',
                    Type: 'MusicVideosView',
                    CollectionType: 'videos',
                    IsFolder: true
                };

                list.push(item);
            }

            return Promise.resolve(list);
        });
    }

    function getTypeFilterForTopLevelView(parentId) {

        var typeFilter = null;

        switch (parentId) {
            case 'localview:MusicView':
                typeFilter = 'Audio';
                break;
            case 'localview:PhotosView':
                typeFilter = 'Photo';
                break;
            case 'localview:TVView':
                typeFilter = 'Episode';
                break;
            case 'localview:VideosView':
                typeFilter = 'Video';
                break;
            case 'localview:MoviesView':
                typeFilter = 'Movie';
                break;
            case 'localview:MusicVideosView':
                typeFilter = 'MusicVideo';
                break;
        }

        return typeFilter;
    }

    function normalizeId(id) {

        if (id) {
            id = stripStart(id, 'localview:');
            id = stripStart(id, 'local:');
            return id;
        }

        return null;
    }

    function getViewItems(serverId, userId, options) {

        var parentId = options.ParentId;

        var typeFilter = getTypeFilterForTopLevelView(parentId);

        parentId = normalizeId(parentId);
        var seasonId = normalizeId(options.SeasonId || options.seasonId);
        var seriesId = normalizeId(options.SeriesId || options.seriesId);

        var includeItemTypes = options.IncludeItemTypes ? options.IncludeItemTypes.split(',') : [];
        if (typeFilter) {
            includeItemTypes.push(typeFilter);
        }

        return getServerItems(serverId).then(function (items) {

            //debugPrintItems(items);

            var resultItems = items.filter(function (item) {

                if (item.SyncStatus && item.SyncStatus !== 'synced') {
                    return false;
                }

                if (options.MediaType && item.Item.MediaType !== options.MediaType) {
                    return false;
                }

                if (seriesId && item.Item.SeriesId !== seriesId) {
                    return false;
                }

                if (seasonId && item.Item.SeasonId !== seasonId) {
                    return false;
                }

                if (options.Filters === 'IsNotFolder' && item.Item.IsFolder) {
                    return false;
                } else if (options.Filters === 'IsFolder' && !item.Item.IsFolder) {
                    return false;
                }

                if (includeItemTypes.length) {
                    if (includeItemTypes.indexOf(item.Item.Type || '') === -1) {
                        return false;
                    }
                }

                if (options.Recursive) {

                } else {
                    if (parentId && item.Item.ParentId !== parentId) {
                        return false;
                    }
                }

                return true;

            }).map(function (item2) {
                return item2.Item;
            });

            if (options.SortBy === 'DateCreated') {
                resultItems.sort(function (a, b) { return compareDates(a.DateCreated, b.DateCreated); });
            }

            if (options.Limit) {
                resultItems = resultItems.slice(0, options.Limit);
            }

            return Promise.resolve(resultItems);
        });
    }

    function removeObsoleteContainerItems(serverId) {

        return getServerItems(serverId).then(function (items) {

            var seriesItems = items.filter(function (item) {

                var type = (item.Item.Type || '').toLowerCase();
                return type === 'series';
            });


            var seasonItems = items.filter(function (item) {

                var type = (item.Item.Type || '').toLowerCase();
                return type === 'season';
            });

            var albumItems = items.filter(function (item) {

                var type = (item.Item.Type || '').toLowerCase();
                return type === 'musicalbum' || type === 'photoalbum';
            });

            var requiredSeriesIds = items.filter(function (item) {

                var type = (item.Item.Type || '').toLowerCase();
                return type === 'episode';
            }).map(function (item2) {

                return item2.Item.SeriesId;
            }).filter(filterDistinct);

            var requiredSeasonIds = items.filter(function (item) {

                var type = (item.Item.Type || '').toLowerCase();
                return type === 'episode';
            }).map(function (item2) {

                return item2.Item.SeasonId;
            }).filter(filterDistinct);

            var requiredAlbumIds = items.filter(function (item) {

                var type = (item.Item.Type || '').toLowerCase();
                return type === 'audio' || type === 'photo';
            }).map(function (item2) {

                return item2.Item.AlbumId;
            }).filter(filterDistinct);


            var obsoleteItems = [];

            seriesItems.forEach(function (item) {

                if (requiredSeriesIds.indexOf(item.Item.Id) < 0) {
                    obsoleteItems.push(item);
                }
            });

            seasonItems.forEach(function (item) {

                if (requiredSeasonIds.indexOf(item.Item.Id) < 0) {
                    obsoleteItems.push(item);
                }
            });

            albumItems.forEach(function (item) {

                if (requiredAlbumIds.indexOf(item.Item.Id) < 0) {
                    obsoleteItems.push(item);
                }
            });


            var p = Promise.resolve();

            obsoleteItems.forEach(function (item) {

                p = p.then(function () {
                    return itemrepository.remove(item.ServerId, item.Id);
                });
            });

            return p;
        });
    }


    function removeLocalItem(localItem) {

        return itemrepository.get(localItem.ServerId, localItem.Id).then(function (item) {
            return filerepository.deleteFile(item.LocalPath).then(function () {

                var p = Promise.resolve(true);

                if (item.AdditionalFiles) {
                    item.AdditionalFiles.forEach(function (file) {
                        p = p.then(function () {
                            return filerepository.deleteFile(file.Path);
                        });
                    });
                }

                return p.then(function (file) {
                    return itemrepository.remove(localItem.ServerId, localItem.Id);
                });

            }, function (error) {

                var p = Promise.resolve(true);

                if (item.AdditionalFiles) {
                    item.AdditionalFiles.forEach(function (file) {
                        p = p.then(function (item) {
                            return filerepository.deleteFile(file.Path);
                        });
                    });
                }

                return p.then(function (file) {
                    return itemrepository.remove(localItem.ServerId, localItem.Id);
                });
            });
        });
    }

    function addOrUpdateLocalItem(localItem) {
        console.log('addOrUpdateLocalItem Start');
        return itemrepository.set(localItem.ServerId, localItem.Id, localItem).then(function (res) {
            console.log('addOrUpdateLocalItem Success');
            return Promise.resolve(true);
        }, function (error) {
            console.log('addOrUpdateLocalItem Error');
            return Promise.resolve(false);
        });
    }

    function createLocalItem(libraryItem, serverInfo, jobItem) {

        var path = getDirectoryPath(libraryItem, serverInfo);
        var localFolder = filerepository.getFullLocalPath(path);

        var localPath;

        if (jobItem) {
            path.push(getLocalFileName(libraryItem, jobItem.OriginalFileName));
            localPath = filerepository.getFullLocalPath(path);
        }

        if (libraryItem.MediaSources) {
            for (var i = 0; i < libraryItem.MediaSources.length; i++) {
                var mediaSource = libraryItem.MediaSources[i];
                mediaSource.Path = localPath;
                mediaSource.Protocol = 'File';
            }
        }

        var item = {

            Item: libraryItem,
            ItemId: libraryItem.Id,
            ServerId: serverInfo.Id,
            LocalPath: localPath,
            LocalFolder: localFolder,
            SyncDate: Date.now(),
            Id: libraryItem.Id
        };

        if (jobItem) {
            item.AdditionalFiles = jobItem.AdditionalFiles.slice(0);
            item.SyncJobItemId = jobItem.SyncJobItemId;
        }

        return Promise.resolve(item);
    }

    function getSubtitleSaveFileName(localItem, mediaPath, language, isForced, format) {

        var name = getNameWithoutExtension(mediaPath);

        if (language) {
            name += "." + language.toLowerCase();
        }

        if (isForced) {
            name += ".foreign";
        }

        name = name + "." + format.toLowerCase();

        var localPathArray = [localItem.LocalFolder, name];
        var localFilePath = filerepository.getPathFromArray(localPathArray);

        return localFilePath;

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

        var folder = filerepository.getLocalPath();
        var imageUrl = getImageUrl(localItem.Item.ServerId, localItem.Item.Id, 'Primary', 0);
        return transfermanager.downloadFile(url, folder, localItem, imageUrl);
    }

    function downloadSubtitles(url, fileName) {

        var folder = filerepository.getLocalPath();
        return transfermanager.downloadSubtitles(url, folder, fileName);
    }

    function getImageUrl(serverId, itemId, imageType, index) {

        var pathArray = getImagePath(serverId, itemId, imageType, index);
        var relPath = pathArray.join('/');

        var prefix = 'ms-appdata:///local';
        return prefix + '/' + relPath;
    }

    function hasImage(serverId, itemId, imageType, index) {

        var pathArray = getImagePath(serverId, itemId, imageType, index);
        var localFilePath = filerepository.getFullMetadataPath(pathArray);

        return filerepository.fileExists(localFilePath).then(function (exists) {
            // TODO: Maybe check for broken download when file size is 0 and item is not queued
            ////if (exists) {
            ////    if (!transfermanager.isDownloadFileInQueue(localFilePath)) {
            ////        // If file exists but 
            ////        exists = false;
            ////    }
            ////}

            return Promise.resolve(exists);
        }, function (err) {
            return Promise.resolve(false);
        });
    }

    function fileExists(localFilePath) {
        return filerepository.fileExists(localFilePath);
    }

    function downloadImage(localItem, url, serverId, itemId, imageType, index) {

        var pathArray = getImagePath(serverId, itemId, imageType, index);
        var localFilePath = filerepository.getFullMetadataPath(pathArray);

        if (!localItem.AdditionalFiles) {
            localItem.AdditionalFiles = [];
        }

        var fileInfo = {
            Path: localFilePath,
            Type: 'Image',
            Name: imageType + index.toString(),
            ImageType: imageType
        };

        localItem.AdditionalFiles.push(fileInfo);

        var folder = filerepository.getMetadataPath();
        return transfermanager.downloadImage(url, folder, localFilePath);
    }

    function isDownloadFileInQueue(path) {

        return transfermanager.isDownloadFileInQueue(path);
    }

    function getDownloadItemCount() {

        return transfermanager.getDownloadItemCount();
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

    function getImagePath(serverId, itemId, imageType, index) {

        var parts = [];
        parts.push('Metadata');
        parts.push(serverId);
        parts.push('images');
        // Store without extension. This allows mixed image types since the browser will
        // detect the type from the content
        parts.push(itemId + '_' + imageType + '_' + index.toString()); // + '.jpg');

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

    function resyncTransfers() {
        return transfermanager.resyncTransfers();
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

    function startsWith(str, find) {

        if (str && find && str.length > find.length) {
            if (str.indexOf(find) === 0) {
                return true;
            }
        }

        return false;
    }

    function stripStart(str, find) {
        if (startsWith(str, find)) {
            return str.substr(find.length);
        }

        return str;
    }

    function filterDistinct(value, index, self) {
        return self.indexOf(value) === index;
    }

    function compareDates(a, b) {
        // Compare two dates (could be of any type supported by the convert
        // function above) and returns:
        //  -1 : if a < b
        //   0 : if a = b
        //   1 : if a > b
        // NaN : if a or b is an illegal date
        // NOTE: The code inside isFinite does an assignment (=).
        return (
            isFinite(a = a.valueOf()) &&
            isFinite(b = b.valueOf()) ?
            (a > b) - (a < b) :
            NaN
        );
    }

    function debugPrintItems(items) {

        console.log("Current local items:");
        console.group();

        items.forEach(function (item) {
            console.info("ID: %s Type: %s Name: %s", item.Item.Id, item.Item.Type, item.Item.Name);
        });

        console.groupEnd();
    }


    return {

        getLocalItem: getLocalItem,
        recordUserAction: recordUserAction,
        getUserActions: getUserActions,
        deleteUserAction: deleteUserAction,
        deleteUserActions: deleteUserActions,
        removeLocalItem: removeLocalItem,
        addOrUpdateLocalItem: addOrUpdateLocalItem,
        createLocalItem: createLocalItem,
        downloadFile: downloadFile,
        downloadSubtitles: downloadSubtitles,
        hasImage: hasImage,
        downloadImage: downloadImage,
        getImageUrl: getImageUrl,
        getSubtitleSaveFileName: getSubtitleSaveFileName,
        getServerItems: getServerItems,
        getItemFileSize: getItemFileSize,
        isDownloadFileInQueue: isDownloadFileInQueue,
        getDownloadItemCount: getDownloadItemCount,
        getViews: getViews,
        getViewItems: getViewItems,
        resyncTransfers: resyncTransfers,
        getItemsFromIds: getItemsFromIds,
        removeObsoleteContainerItems: removeObsoleteContainerItems,
        fileExists: fileExists
    };
});