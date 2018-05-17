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
db.version(2).stores({
  manifestBlob: '&key, data',
  allData: '&key, data'
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
            console.log('Loading first file...', entries[0].filename);

            entries[0].getData(new zip.BlobWriter(), blob => {
              const link = document.createElement('a');
              link.href = window.URL.createObjectURL(blob);
              link.innerHTML = 'Download file';
              link.download = 'manifestDatabase.sqlite';
              document.body.appendChild(link);

              resolve(blob);
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

function loadManifest(dbPath) {
  return fetchManifest(dbPath)
    .then(data => {
      console.log('Got a blob db', data);
      return unzipManifest(data);
    })
    .then(manifestBlob => {
      console.log('Got unziped db', manifestBlob);
      return manifestBlob;
    });
}

function openDBFromBlob(SQLLib, blob) {
  const url = window.URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function(e) {
      const uInt8Array = new Uint8Array(this.response);
      resolve(new SQLLib.Database(uInt8Array));
    };
    xhr.send();
  });
}

function allDataFromRemote(dbPath) {
  return Promise.all([requireDatabase(), loadManifest(dbPath)])
    .then(([SQLLib, manifestBlob]) => {
      console.log('Loaded both SQL library and manifest blob');
      return openDBFromBlob(SQLLib, manifestBlob);
    })
    .then(db => {
      console.log('Got proper SQLite DB', db);

      const allTables = db
        .exec(`SELECT name FROM sqlite_master WHERE type='table';`)[0]
        .values.map(a => a[0]);

      console.log('All tables', allTables);

      const allData = allTables.reduce((acc, tableName) => {
        console.log('Getting all records for', tableName);
        acc[tableName] = getAllRecords(db, tableName);
        return acc;
      }, {});

      return allData;
    });
}

fetchManifestDBPath()
  .then(dbPath => {
    window.perfStart = performance.now();

    console.log('dbPath', dbPath);
    return Promise.all([db.allData.get(dbPath), Promise.resolve(dbPath)]);
  })
  .then(([cachedData, dbPath]) => {
    if (cachedData) {
      return cachedData.data;
    }

    return allDataFromRemote(dbPath).then(allData => {
      db.allData.put({ key: dbPath, data: allData });

      return allData;
    });
  })
  .then(allData => {
    window.perfEnd = performance.now();
    console.log('Time:', perfEnd - perfStart);
    console.log('Items', allData);
  })
  .catch(err => {
    console.error(err);
  });
