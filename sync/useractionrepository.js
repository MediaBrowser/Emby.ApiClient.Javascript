// In the following line, you should include the prefixes of implementations you want to test.
const indexedDB = self.indexedDB || self.mozIndexedDB || self.webkitIndexedDB || self.msIndexedDB;
// DON'T use "var indexedDB = ..." if you're not in a function.
// Moreover, you may need references to some window.IDB* objects:
const IDBTransaction = self.IDBTransaction || self.webkitIDBTransaction || self.msIDBTransaction || { READ_WRITE: "readwrite" }; // This line should only be needed if it is needed to support the object's constants for older browsers
const IDBKeyRange = self.IDBKeyRange || self.webkitIDBKeyRange || self.msIDBKeyRange;
// (Mozilla has never prefixed these objects, so we don't need window.mozIDB*)

// Database name
const dbName = "useractions";

// Database version
const dbVersion = 1;

let databaseInstance;

function getDb(callback) {

    const db = databaseInstance;
    if (db) {
        callback(db);
        return;
    }

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
            callback(db);
        };
    };

    request.onsuccess = event => {
        const db = event.target.result;
        callback(db);
    };
}

function getByServerId(serverId) {

    return getAll().then(items => items.filter(item => item.ServerId === serverId));
}

function getAll() {

    return new Promise((resolve, reject) => {
        getDb(db => {

            const storeName = dbName;

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

function get(key) {

    return new Promise((resolve, reject) => {
        getDb(db => {

            const storeName = dbName;

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

function set(key, val) {

    return new Promise((resolve, reject) => {
        getDb(db => {

            const storeName = dbName;

            const transaction = db.transaction([storeName], 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.put(val, key);

            request.onerror = reject;
            request.onsuccess = resolve;
        });
    });
}

function remove(key) {
    return new Promise((resolve, reject) => {
        getDb(db => {

            const storeName = dbName;

            const transaction = db.transaction([storeName], 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.delete(key);

            request.onerror = reject;
            request.onsuccess = resolve;
        });
    });
}

function clear() {
    return new Promise((resolve, reject) => {
        getDb(db => {

            const storeName = dbName;

            const transaction = db.transaction([storeName], 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.clear();

            request.onerror = reject;
            request.onsuccess = resolve;
        });
    });
}

export default {
    get,
    set,
    remove,
    clear,
    getAll,
    getByServerId
};