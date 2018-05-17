import Dexie from 'dexie';
import axios from 'axios';

import 'imports-loader?this=>window!@destiny-item-manager/zip.js';
import inflate from 'file-loader?name=[name]-[hash:6].[ext]!@destiny-item-manager/zip.js/WebContent/inflate.js';
import zipWorker from 'file-loader?name=[name]-[hash:6].[ext]!@destiny-item-manager/zip.js/WebContent/z-worker.js';

import { requireDatabase, getAllRecords } from './database';

const db = new Dexie('destinyManifest');
db.version(1).stores({
  manifestBlob: '&key, data'
});

function fetchManifestDBPath() {
  return fetch('https://www.bungie.net/platform/Destiny2/Manifest/')
    .then(r => r.json())
    .then(data => {
      console.log('Got Manifest manifest back', data);
      const englishUrl = data.Response.mobileWorldContentPaths.en;
      return englishUrl;
    });
}

function fetchManifest(dbPath) {
  console.log('Requesting manifest from', dbPath);

  return db.manifestBlob.get(dbPath).then(cachedValue => {
    if (cachedValue) {
      return cachedValue.data;
    }

    return axios(`https://www.bungie.net${dbPath}`, {
      responseType: 'blob',
      onDownloadProgress(progress) {
        document.querySelector('pre').innerHTML = `Progress ${Math.round(
          progress.loaded / progress.total * 100
        )}%`;
      }
    }).then(resp => {
      console.log('Finished loading manifest');
      console.log('Storing in db', { key: dbPath, data: resp.data });
      db.manifestBlob.put({ key: dbPath, data: resp.data });
      return resp.data;
    });
  });
}

function unzipManifest(blob) {
  console.log('Unzipping file...');
  return new Promise((resolve, reject) => {
    zip.useWebWorkers = true;
    zip.workerScripts = {
      inflater: [zipWorker, inflate]
    };
    zip.createReader(
      new zip.BlobReader(blob),
      zipReader => {
        // get all entries from the zip
        zipReader.getEntries(entries => {
          if (entries.length) {
            console.log('Found', entries.length, 'entries within zip file');
            entries[0].getData(new zip.BlobWriter(), blob => {
              const blobReader = new FileReader();
              blobReader.addEventListener('error', e => {
                reject(e);
              });
              blobReader.addEventListener('load', () => {
                console.log('Loading first file...');
                zipReader.close(() => {
                  resolve(blobReader.result);
                });
              });
              blobReader.readAsArrayBuffer(blob);
            });
          }
        });
      },
      error => {
        reject(error);
      }
    );
  });
}

function loadManifest() {
  return fetchManifestDBPath()
    .then(fetchManifest)
    .then(data => {
      console.log('Got a blob db', data);
      return unzipManifest(data);
    })
    .then(data => {
      console.log('Got unziped db', data);
      return data;
    });
}

Promise.all([requireDatabase(), loadManifest()])
  .then(([SQLLib, typedArray]) => {
    console.log('Loaded both SQL library and manifest data');
    console.log('typedArray:', typedArray);
    const db = new SQLLib.Database(typedArray);

    db._exec = db.exec;
    db.exec = (...args) => {
      console.log(`Executing '%c${args[0]}%c'`, 'color: blue', 'color: black');
      return db._exec(...args);
    };

    console.log('Got proper SQLite DB', db);

    const allTables = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table';`
    );

    console.log('All tables', allTables);

    const items = getAllRecords(db, 'DestinyRaceDefinition');
    console.log('Items', { items });
  })
  .catch(err => {
    console.error(err);
  });
