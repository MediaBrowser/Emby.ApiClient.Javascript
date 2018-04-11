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

function updateFiltersForTopLevelView(parentId, mediaTypes, includeItemTypes, query) {

    switch (parentId) {
        case 'MusicView':
            if (query.Recursive) {
                includeItemTypes.push('Audio');
            } else {
                includeItemTypes.push('MusicAlbum');
            }
            return true;
        case 'PhotosView':
            if (query.Recursive) {
                includeItemTypes.push('Photo');
            } else {
                includeItemTypes.push('PhotoAlbum');
            }
            return true;
        case 'TVView':
            if (query.Recursive) {
                includeItemTypes.push('Episode');
            } else {
                includeItemTypes.push('Series');
            }
            return true;
        case 'VideosView':
            if (query.Recursive) {
                includeItemTypes.push('Video');
            } else {
                includeItemTypes.push('Video');
            }
            return true;
        case 'MoviesView':
            if (query.Recursive) {
                includeItemTypes.push('Movie');
            } else {
                includeItemTypes.push('Movie');
            }
            return true;
        case 'MusicVideosView':
            if (query.Recursive) {
                includeItemTypes.push('MusicVideo');
            } else {
                includeItemTypes.push('MusicVideo');
            }
            return true;
    }

    return false;
}

function normalizeId(id) {
    if (id) {
        id = stripStart(id, 'localview:');
        id = stripStart(id, 'local:');
        return id;
    }

    return null;
}

function normalizeIdList(val) {

    if (val) {
        return val.split(',').map(normalizeId);
    }

    return [];
}

function shuffle(array) {
    let currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function sortItems(items, query) {

    const sortBy = (query.sortBy || '').split(',')[0];

    if (sortBy === 'DateCreated') {
        items.sort((a, b) => { return compareDates(a.DateCreated, b.DateCreated); });
    }
    else if (sortBy === 'Random') {
        items = shuffle(items);
    } else {
        items.sort((a, b) => { return a.SortName.toLowerCase().localeCompare(b.SortName.toLowerCase()); });
    }

    return items;
}

function getViewItems(serverId, userId, options) {

    let parentId = options.ParentId;

    parentId = normalizeId(parentId);
    const seasonId = normalizeId(options.SeasonId || options.seasonId);
    const seriesId = normalizeId(options.SeriesId || options.seriesId);
    const albumIds = normalizeIdList(options.AlbumIds || options.albumIds);

    const includeItemTypes = options.IncludeItemTypes ? options.IncludeItemTypes.split(',') : [];
    const filters = options.Filters ? options.Filters.split(',') : [];
    const mediaTypes = options.MediaTypes ? options.MediaTypes.split(',') : [];

    if (updateFiltersForTopLevelView(parentId, mediaTypes, includeItemTypes, options)) {
        parentId = null;
    }

    return getServerItems(serverId).then((items) => {

        //debugPrintItems(items);

        let resultItems = items.filter((item) => {

            if (item.SyncStatus && item.SyncStatus !== 'synced') {
                return false;
            }

            if (mediaTypes.length) {
                if (mediaTypes.indexOf(item.Item.MediaType || '') === -1) {
                    return false;
                }
            }

            if (seriesId && item.Item.SeriesId !== seriesId) {
                return false;
            }

            if (seasonId && item.Item.SeasonId !== seasonId) {
                return false;
            }

            if (albumIds.length && albumIds.indexOf(item.Item.AlbumId || '') === -1) {
                return false;
            }

            if (item.Item.IsFolder && filters.indexOf('IsNotFolder') !== -1) {
                return false;
            } else if (!item.Item.IsFolder && filters.indexOf('IsFolder') !== -1) {
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

        }).map((item2) => {
            return item2.Item;
        });

        resultItems = sortItems(resultItems, options);

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
        .then(({ LocalPath, AdditionalFiles }) => {

            const onFileDeletedSuccessOrFail = () => {
                return itemrepository.remove(localItem.ServerId, localItem.Id);
            };

            if (!item.LocalPath) {
                return onFileDeletedSuccessOrFail();
            }

            return filerepository.deleteFile(item.LocalPath).then(onFileDeletedSuccessOrFail, onFileDeletedSuccessOrFail);
        });
}

function addOrUpdateLocalItem(localItem) {
    return itemrepository.set(localItem.ServerId, localItem.Id, localItem);
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

    const localPathParts = getImagePath(serverId, itemId, imageType, index);

    return transfermanager.downloadImage(url, localPathParts);
}

function isDownloadFileInQueue(path) {
    return transfermanager.isDownloadFileInQueue(path);
}

function getDownloadItemCount() {
    return transfermanager.getDownloadItemCount();
}

// Helpers ***********************************************************

function getDirectoryPath(item) {
    const parts = [];

    const itemtype = item.Type.toLowerCase();
    const mediaType = (item.MediaType || '').toLowerCase();

    if (itemtype === 'episode' || itemtype === 'series' || itemtype === 'season') {

        parts.push("TV");

    } else if (mediaType === 'video') {

        parts.push("Videos");

    } else if (itemtype === 'audio' || itemtype === 'musicalbum' || itemtype === 'musicartist') {

        parts.push("Music");

    } else if (itemtype === 'photo' || itemtype === 'photoalbum') {

        parts.push("Photos");

    } else if (itemtype === 'game' || itemtype === 'gamesystem') {

        parts.push("Games");
    }

    const albumArtist = item.AlbumArtist;
    if (albumArtist) {
        parts.push(albumArtist);
    }

    const seriesName = item.SeriesName;
    if (seriesName) {
        parts.push(seriesName);
    }

    const seasonName = item.SeasonName;
    if (seasonName) {
        parts.push(seasonName);
    }

    if (item.Album) {
        parts.push(item.Album);
    }

    if ((mediaType === 'video' && itemtype !== 'episode') || itemtype === 'game' || item.IsFolder) {

        parts.push(item.Name);
    }

    const finalParts = [];
    for (let i = 0; i < parts.length; i++) {
        finalParts.push(filerepository.getValidFileName(parts[i]));
    }

    return finalParts;
}

function getImagePath(serverId, itemId, imageType, index) {
    const parts = [];
    parts.push('images');

    index = index || 0;
    // Store without extension. This allows mixed image types since the browser will
    // detect the type from the content
    parts.push(`${itemId}_${imageType}_${index.toString()}`); // + '.jpg');

    const finalParts = [];
    for (let i = 0; i < parts.length; i++) {
        finalParts.push(parts[i]);
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

function enableBackgroundCompletion() {
    return transfermanager.enableBackgroundCompletion;
}

export default {
    getLocalItem,
    getDirectoryPath,
    getLocalFileName,
    recordUserAction,
    getUserActions,
    deleteUserAction,
    deleteUserActions,
    removeLocalItem,
    addOrUpdateLocalItem,
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
    enableBackgroundCompletion
};