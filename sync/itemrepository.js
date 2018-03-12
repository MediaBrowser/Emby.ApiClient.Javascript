// In the following line, you should include the prefixes of implementations you want to test.
const indexedDB = self.indexedDB || self.mozIndexedDB || self.webkitIndexedDB || self.msIndexedDB;
// DON'T use "var indexedDB = ..." if you're not in a function.
// Moreover, you may need references to some window.IDB* objects:
const IDBTransaction = self.IDBTransaction || self.webkitIDBTransaction || self.msIDBTransaction || { READ_WRITE: "readwrite" }; // This line should only be needed if it is needed to support the object's constants for older browsers
const IDBKeyRange = self.IDBKeyRange || self.webkitIDBKeyRange || self.msIDBKeyRange;
// (Mozilla has never prefixed these objects, so we don't need window.mozIDB*)

// Database version
const dbVersion = 1;

const databases = {};

function ServerDatabase(dbName, readyCallback) {

    const request = indexedDB.open(dbName, dbVersion);

    request.onerror = event => {
        // Handle errors.
    };

    request.onupgradeneeded = event => {
        const db = event.target.result;

        // Create an objectStore to hold information about our customers. We're
        // going to use "ssn" as our key path because it's guaranteed to be
        // unique - or at least that's what I was told during the kickoff meeting.
        const objectStore = db.createObjectStore(dbName);

        // Use transaction oncomplete to make sure the objectStore creation is 
        // finished before adding data into it.
        objectStore.transaction.oncomplete = event => {
            readyCallback(db);
        };
    };

    request.onsuccess = event => {
        const db = event.target.result;
        readyCallback(db);
    };
}

function getDbName(serverId) {

    return `items_${serverId}`;
}

function getDb(serverId, callback) {

    const dbName = getDbName(serverId);
    const db = databases[dbName];
    if (db) {
        callback(db);
        return;
    }

    new ServerDatabase(dbName, db => {

        databases[dbName] = db;
        callback(db);
    });
}

function getServerItemTypes(serverId, userId) {

    return getAll(serverId, userId).then(all => all.map(item2 => item2.Item.Type || '').filter(filterDistinct));
}

function getAll(serverId, userId) {

    return new Promise((resolve, reject) => {
        getDb(serverId, db => {

            const storeName = getDbName(serverId);

            const transaction = db.transaction([storeName], 'readonly');
            const objectStore = transaction.objectStore(storeName);
            let request;

            if ('getAll' in objectStore) {

                // IDBObjectStore.getAll() will return the full set of items in our store.
                request = objectStore.getAll(null, 10000);

                request.onsuccess = event => {
                    resolve(event.target.result);
                };

            } else {

                // Fallback to the traditional cursor approach if getAll isn't supported.
                const results = [];
                request = objectStore.openCursor();

                request.onsuccess = event => {
                    const cursor = event.target.result;
                    if (cursor) {
                        results.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };
            }

            request.onerror = reject;
        });
    });
}

function get(serverId, key) {

    return new Promise((resolve, reject) => {
        getDb(serverId, db => {

            const storeName = getDbName(serverId);

            const transaction = db.transaction([storeName], 'readonly');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.get(key);

            request.onerror = reject;

            request.onsuccess = event => {
                // Do something with the request.result!
                resolve(request.result);
            };
        });
    });
}

function set(serverId, key, val) {

    return new Promise((resolve, reject) => {
        getDb(serverId, db => {

            const storeName = getDbName(serverId);

            const transaction = db.transaction([storeName], 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.put(val, key);

            request.onerror = reject;
            request.onsuccess = resolve;
        });
    });
}

function remove(serverId, key) {
    return new Promise((resolve, reject) => {
        getDb(serverId, db => {

            const storeName = getDbName(serverId);

            const transaction = db.transaction([storeName], 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.delete(key);

            request.onerror = reject;
            request.onsuccess = resolve;
        });
    });
}

function clear(serverId) {
    return new Promise((resolve, reject) => {
        getDb(serverId, db => {

            const storeName = getDbName(serverId);

            const transaction = db.transaction([storeName], 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.clear();

            request.onerror = reject;
            request.onsuccess = resolve;
        });
    });
}

function filterDistinct(value, index, self) {
    return self.indexOf(value) === index;
}

export default {
    get,
    set,
    remove,
    clear,
    getAll,
    getServerItemTypes
};
