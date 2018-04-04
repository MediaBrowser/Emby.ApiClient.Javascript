import filerepository from 'fileRepository';
import itemrepository from 'itemRepository';
import useractionrepository from 'userActionRepository';
import transfermanager from 'transferManager';

function getLocalItem(serverId, itemId) {
    console.log('[lcoalassetmanager] Begin getLocalItem');

    return itemrepository.get(serverId, itemId);
}

function recordUserAction(action) {
    action.Id = createGuid();
    return useractionrepository.set(action.Id, action);
}

function getUserActions(serverId) {
    return useractionrepository.getByServerId(serverId);
}

function deleteUserAction({ Id }) {
    return useractionrepository.remove(Id);
}

function deleteUserActions(actions) {
    const results = [];

    actions.forEach(action => {
        results.push(deleteUserAction(action));
    });

    return Promise.all(results);
}

function getServerItems(serverId) {
    console.log('[localassetmanager] Begin getServerItems');

    return itemrepository.getAll(serverId);
}

function getItemsFromIds(serverId, ids) {
    const actions = ids.map(id => {
        const strippedId = stripStart(id, 'local:');

        return getLocalItem(serverId, strippedId);
    });

    return Promise.all(actions).then(items => {
        const libItems = items.map(({ Item }) => Item);

        return Promise.resolve(libItems);
    });
}

function getViews(serverId, userId) {
    return itemrepository.getServerItemTypes(serverId, userId).then(types => {
        const list = [];
        let item;

        if (types.includes('Audio')) {
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

        if (types.includes('Photo')) {
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

        if (types.includes('Episode')) {
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

        if (types.includes('Movie')) {
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

        if (types.includes('Video')) {
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

        if (types.includes('MusicVideo')) {
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
    let typeFilter = null;

    switch (parentId) {
        case 'localview:MusicView':
            typeFilter = 'MusicAlbum';
            break;
        case 'localview:PhotosView':
            typeFilter = 'PhotoAlbum';
            break;
        case 'localview:TVView':
            typeFilter = 'Series';
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
    let parentId = options.ParentId;

    const typeFilter = getTypeFilterForTopLevelView(parentId);

    parentId = normalizeId(parentId);
    const seasonId = normalizeId(options.SeasonId || options.seasonId);
    const seriesId = normalizeId(options.SeriesId || options.seriesId);

    const includeItemTypes = options.IncludeItemTypes
        ? options.IncludeItemTypes.split(',')
        : [];
    if (typeFilter) {
        parentId = null;
        includeItemTypes.push(typeFilter);
    }

    return getServerItems(serverId).then(items => {
        //debugPrintItems(items);

        let resultItems = items
            .filter(({ SyncStatus, Item }) => {
                if (SyncStatus && SyncStatus !== 'synced') {
                    return false;
                }

                if (options.MediaType && Item.MediaType !== options.MediaType) {
                    return false;
                }

                if (seriesId && Item.SeriesId !== seriesId) {
                    return false;
                }

                if (seasonId && Item.SeasonId !== seasonId) {
                    return false;
                }

                if (options.Filters === 'IsNotFolder' && Item.IsFolder) {
                    return false;
                } else if (options.Filters === 'IsFolder' && !Item.IsFolder) {
                    return false;
                }

                if (includeItemTypes.length) {
                    if (!includeItemTypes.includes(Item.Type || '')) {
                        return false;
                    }
                }

                if (options.Recursive) {
                } else {
                    if (parentId && Item.ParentId !== parentId) {
                        return false;
                    }
                }

                return true;
            })
            .map(({ Item }) => Item);

        if (options.SortBy === 'DateCreated') {
            resultItems.sort((a, b) => compareDates(a, b));
        }

        if (options.Limit) {
            resultItems = resultItems.slice(0, options.Limit);
        }

        return Promise.resolve(resultItems);
    });
}

function removeObsoleteContainerItems(serverId) {
    return getServerItems(serverId).then(items => {
        const seriesItems = items.filter(({ Item }) => {
            const type = (Item.Type || '').toLowerCase();
            return type === 'series';
        });

        const seasonItems = items.filter(({ Item }) => {
            const type = (Item.Type || '').toLowerCase();
            return type === 'season';
        });

        const albumItems = items.filter(({ Item }) => {
            const type = (Item.Type || '').toLowerCase();
            return type === 'musicalbum' || type === 'photoalbum';
        });

        const requiredSeriesIds = items
            .filter(({ Item }) => {
                const type = (Item.Type || '').toLowerCase();
                return type === 'episode';
            })
            .map(({ Item }) => Item.SeriesId)
            .filter(filterDistinct);

        const requiredSeasonIds = items
            .filter(({ Item }) => {
                const type = (Item.Type || '').toLowerCase();
                return type === 'episode';
            })
            .map(({ Item }) => Item.SeasonId)
            .filter(filterDistinct);

        const requiredAlbumIds = items
            .filter(({ Item }) => {
                const type = (Item.Type || '').toLowerCase();
                return type === 'audio' || type === 'photo';
            })
            .map(({ Item }) => Item.AlbumId)
            .filter(filterDistinct);

        const obsoleteItems = [];

        seriesItems.forEach(item => {
            if (!requiredSeriesIds.includes(item.Item.Id)) {
                obsoleteItems.push(item);
            }
        });

        seasonItems.forEach(item => {
            if (!requiredSeasonIds.includes(item.Item.Id)) {
                obsoleteItems.push(item);
            }
        });

        albumItems.forEach(item => {
            if (!requiredAlbumIds.includes(item.Item.Id)) {
                obsoleteItems.push(item);
            }
        });

        let p = Promise.resolve();

        obsoleteItems.forEach(({ ServerId, Id }) => {
            p = p.then(() => itemrepository.remove(ServerId, Id));
        });

        return p;
    });
}

function removeLocalItem({ ServerId, Id }) {
    return itemrepository
        .get(ServerId, Id)
        .then(({ LocalPath, AdditionalFiles }) =>
            filerepository.deleteFile(LocalPath).then(
                () => {
                    let p = Promise.resolve(true);

                    if (AdditionalFiles) {
                        AdditionalFiles.forEach(({ Path }) => {
                            p = p.then(() => filerepository.deleteFile(Path));
                        });
                    }

                    return p.then(file => itemrepository.remove(ServerId, Id));
                },
                error => {
                    let p = Promise.resolve(true);

                    if (AdditionalFiles) {
                        AdditionalFiles.forEach(({ Path }) => {
                            p = p.then(item => filerepository.deleteFile(Path));
                        });
                    }

                    return p.then(file => itemrepository.remove(ServerId, Id));
                }
            )
        );
}

function addOrUpdateLocalItem(localItem) {
    return itemrepository.set(localItem.ServerId, localItem.Id, localItem);
}

function createLocalItem(libraryItem, serverInfo, jobItem) {
    console.log('[lcoalassetmanager] Begin createLocalItem');

    const path = getDirectoryPath(libraryItem, serverInfo);
    // pass in isFile = false
    const localFolder = filerepository.getFullLocalPath(path, false);

    let localPath;

    if (jobItem) {
        path.push(getLocalFileName(libraryItem, jobItem.OriginalFileName));
        // pass in isFile = true
        localPath = filerepository.getFullLocalPath(path, true);
    }

    if (libraryItem.MediaSources) {
        for (let i = 0; i < libraryItem.MediaSources.length; i++) {
            const mediaSource = libraryItem.MediaSources[i];
            mediaSource.Path = localPath;
            mediaSource.Protocol = 'File';
        }
    }

    const item = {
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

    return item;
}

function getSubtitleSaveFileName(
    { LocalFolder },
    mediaPath,
    language,
    isForced,
    format
) {
    let name = getNameWithoutExtension(mediaPath);

    if (language) {
        name += `.${language.toLowerCase()}`;
    }

    if (isForced) {
        name += '.foreign';
    }

    name = `${name}.${format.toLowerCase()}`;

    const localPathArray = [LocalFolder, name];
    const localFilePath = filerepository.getPathFromArray(localPathArray);

    return localFilePath;
}

function getItemFileSize(path) {
    return filerepository.getItemFileSize(path);
}

function getNameWithoutExtension(path) {
    let fileName = path;

    const pos = fileName.lastIndexOf('.');

    if (pos > 0) {
        fileName = fileName.substring(0, pos);
    }

    return fileName;
}

function downloadFile(url, localItem) {
    const imageUrl = getImageUrl(localItem.Item.ServerId, localItem.Item.Id, {
        type: 'Primary',
        index: 0
    });
    return transfermanager.downloadFile(url, localItem, imageUrl);
}

function downloadSubtitles(url, fileName) {
    return transfermanager.downloadSubtitles(url, fileName);
}

function getImageUrl(serverId, itemId, imageOptions) {
    const imageType = imageOptions.type;
    const index = imageOptions.index;

    const pathArray = getImagePath(serverId, itemId, imageType, index);

    return filerepository.getImageUrl(pathArray);
}

function hasImage(serverId, itemId, imageType, index) {
    const pathArray = getImagePath(serverId, itemId, imageType, index);
    const localFilePath = filerepository.getFullMetadataPath(pathArray);

    return filerepository.fileExists(localFilePath).then(
        (
            exists // TODO: Maybe check for broken download when file size is 0 and item is not queued
        ) =>
            ////if (exists) {
            ////    if (!transfermanager.isDownloadFileInQueue(localFilePath)) {
            ////        // If file exists but
            ////        exists = false;
            ////    }
            ////}

            Promise.resolve(exists),
        err => Promise.resolve(false)
    );
}

function fileExists(localFilePath) {
    return filerepository.fileExists(localFilePath);
}

function downloadImage(localItem, url, serverId, itemId, imageType, index) {
    const pathArray = getImagePath(serverId, itemId, imageType, index);
    const localFilePath = filerepository.getFullMetadataPath(pathArray);

    if (!localItem.AdditionalFiles) {
        localItem.AdditionalFiles = [];
    }

    const fileInfo = {
        Path: localFilePath,
        Type: 'Image',
        Name: imageType + index.toString(),
        ImageType: imageType
    };

    localItem.AdditionalFiles.push(fileInfo);

    return transfermanager.downloadImage(url, localFilePath);
}

function isDownloadFileInQueue(path) {
    return transfermanager.isDownloadFileInQueue(path);
}

function getDownloadItemCount() {
    return transfermanager.getDownloadItemCount();
}

// Helpers ***********************************************************

function getDirectoryPath(item, { Name }) {
    const parts = [];
    parts.push(Name);

    const itemtype = item.Type.toLowerCase();

    if (itemtype === 'episode') {
        parts.push('TV');

        const seriesName = item.SeriesName;
        if (seriesName) {
            parts.push(seriesName);
        }

        const seasonName = item.SeasonName;
        if (seasonName) {
            parts.push(seasonName);
        }
    } else if (itemtype === 'video') {
        parts.push('Videos');
        parts.push(item.Name);
    } else if (itemtype === 'audio') {
        parts.push('Music');

        const albumArtist = item.AlbumArtist;
        if (albumArtist) {
            parts.push(albumArtist);
        }

        if (item.AlbumId && item.Album) {
            parts.push(item.Album);
        }
    } else if (itemtype === 'photo') {
        parts.push('Photos');

        if (item.AlbumId && item.Album) {
            parts.push(item.Album);
        }
    }

    const finalParts = [];
    for (let i = 0; i < parts.length; i++) {
        finalParts.push(filerepository.getValidFileName(parts[i]));
    }

    return finalParts;
}

function getImagePath(serverId, itemId, imageType, index) {
    const parts = [];
    parts.push('Metadata');
    parts.push(serverId);
    parts.push('images');

    index = index || 0;
    // Store without extension. This allows mixed image types since the browser will
    // detect the type from the content
    parts.push(`${itemId}_${imageType}_${index.toString()}`); // + '.jpg');

    const finalParts = [];
    for (let i = 0; i < parts.length; i++) {
        finalParts.push(filerepository.getValidFileName(parts[i]));
    }

    return finalParts;
}

function getLocalFileName({ Name }, originalFileName) {
    const filename = originalFileName || Name;

    return filerepository.getValidFileName(filename);
}

function resyncTransfers() {
    return transfermanager.resyncTransfers();
}

function createGuid() {
    let d = new Date().getTime();
    if (window.performance && typeof window.performance.now === 'function') {
        d += performance.now(); //use high-precision timer if available
    }
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = ((d + Math.random() * 16) % 16) | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
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
    return isFinite((a = a.valueOf())) && isFinite((b = b.valueOf()))
        ? (a > b) - (a < b)
        : NaN;
}

function debugPrintItems(items) {
    console.log('Current local items:');
    console.group();

    items.forEach(({ Item }) => {
        console.info('ID: %s Type: %s Name: %s', Item.Id, Item.Type, Item.Name);
    });

    console.groupEnd();
}

function enableRepeatDownloading() {
    return transfermanager.enableRepeatDownloading;
}

export default {
    getLocalItem,
    recordUserAction,
    getUserActions,
    deleteUserAction,
    deleteUserActions,
    removeLocalItem,
    addOrUpdateLocalItem,
    createLocalItem,
    downloadFile,
    downloadSubtitles,
    hasImage,
    downloadImage,
    getImageUrl,
    getSubtitleSaveFileName,
    getServerItems,
    getItemFileSize,
    isDownloadFileInQueue,
    getDownloadItemCount,
    getViews,
    getViewItems,
    resyncTransfers,
    getItemsFromIds,
    removeObsoleteContainerItems,
    fileExists,
    enableRepeatDownloading
};