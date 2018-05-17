import sqlWasmPath from 'file-loader?name=[name]-[hash:6].[ext]!sql.js/js/sql-wasm.js';
import sqlWasmBinaryPath from 'file-loader?name=[name]-[hash:6].[ext]!sql.js/js/sql-optimized-wasm-raw.wasm';

function importAsmJs() {
  delete window.Module;
  delete window.SQL;
  console.log('Using asm.js SQLite');
  return import(/* webpackChunkName: "sqlLib" */ 'sql.js');
}

export function getAllRecords(db, table) {
  const rows = db.exec(`SELECT json FROM ${table}`);
  const result = {};
  rows[0].values.forEach(row => {
    const obj = JSON.parse(row);
    result[obj.hash] = obj;
  });
  return result;
}

export function requireDatabase() {
  if (!(typeof WebAssembly === 'object')) {
    console.log('Browser does not support WebAssembly');
    return importAsmJs();
  }

  console.log('Browser supports WebAssembly');

  return new Promise((resolve, reject) => {
    let loaded = false;

    window.Module = {
      locateFile() {
        return sqlWasmBinaryPath;
      }
    };
    window.SQL = {
      onRuntimeInitialized() {
        if (!loaded) {
          loaded = true;

          try {
            // Do a self-test
            const db = new window.SQL.Database();
            db.run('CREATE TABLE hello (a int, b char);');
            db.run("INSERT INTO hello VALUES (0, 'hello');");
            db.exec('SELECT * FROM hello');
          } catch (e) {
            console.error('Failed to load WASM SQLite, falling back', e);
            importAsmJs().then(resolve, reject);
            return;
          }

          console.info('Using WASM SQLite');
          resolve(window.SQL);
          delete window.SQL;
        }
      }
    };

    // Give it 10 seconds to load
    setTimeout(() => {
      if (!loaded) {
        loaded = true;

        // Fall back to the old one
        importAsmJs().then(resolve, reject);
      }
    }, 10000);

    const head = document.getElementsByTagName('head')[0];
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = sqlWasmPath;
    script.async = true;
    head.appendChild(script);
  });
}
