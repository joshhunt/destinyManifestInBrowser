const path = require('path');

module.exports = () => ({
  output: {
    publicPath: 'dist/'
  },
  module: {
    noParse: path => {
      return path.endsWith('sql.js/js/sql.js');
    },
    rules: [
      {
        type: 'javascript/auto',
        test: /\.wasm/
      }
    ]
  }
});
