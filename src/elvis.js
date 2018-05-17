let vm = {};
window.__vm = vm;

function loadRemoteSQLite(url) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function(e) {
    var uInt8Array = new Uint8Array(this.response);
    vm.sql = new SQL.Database(uInt8Array);
    vm.loadingFlag = false;
  };
  xhr.send();
}

function loadManifest(url) {
  vm.loadingFlag = true;
  var SQL = window.SQL;
  fetch(url)
    .then(function(response) {
      if (response.status === 200 || response.status === 0) {
        return Promise.resolve(response.blob());
      } else {
        return Promise.reject(new Error(response.statusText));
      }
    })
    .then(JSZip.loadAsync)
    .then(function(zip) {
      console.log(zip);
      var name = url.split('/');
      name = name[name.length - 1];
      return zip.file(name); //take the actual filename from the url (this basically means it will only work if the file is in a zip with the same name)
    })
    .then(
      function success(file) {
        return file.async('blob');
      },
      function error(e) {}
    )
    .then(function(blob) {
      loadRemoteSQLite(window.URL.createObjectURL(blob)); //not sure why but creating an object url and then loading through that works and directly loading in the blob doesn't
    });
}
