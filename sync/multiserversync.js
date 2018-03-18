import ServerSync from './serversync';

function syncNext(connectionManager, servers, index, options, resolve, reject) {
    const length = servers.length;

    if (index >= length) {
        console.log('MultiServerSync.sync complete');
        resolve();
        return;
    }

    const server = servers[index];

    console.log(`Creating ServerSync to server: ${server.Id}`);

    new ServerSync().sync(connectionManager, server, options).then(
        () => {
            console.log(`ServerSync succeeded to server: ${server.Id}`);

            syncNext(connectionManager, servers, index + 1, options, resolve, reject);
        },
        err => {
            console.log(`ServerSync failed to server: ${server.Id}. ${err}`);

            syncNext(connectionManager, servers, index + 1, options, resolve, reject);
        }
    );
}

export default class MultiServerSync {
    sync(connectionManager, options) {
        console.log('MultiServerSync.sync starting...');

        return new Promise((resolve, reject) => {
            const servers = connectionManager.getSavedServers();

            syncNext(connectionManager, servers, 0, options, resolve, reject);
        });
    }
}