## Usage

```javascript
const { FederationStatsPlugin } = require('@mf/loadable-adapters');

module.exports = {
  plugins: [new FederationStatsPlugin()],
};
```

As an option you could provide a output file name
`{ filename: 'federation-stats.json' }`

### Example Output

```json
{
  "name": "AppName",
  "exposes": {
    "module1": [
      {
        "chunk": "vendors-node_modules_babel_runtime_helpers_esm_slicedToArray.js",
        "integrity": "sha256-6ztd5MP6NcgnUXeP3xulOfEGhJg3qlFu7ztMGaGaj3Q="
      },
      {
        "chunk": "vendors-node_modules_core-js.js",
        "integrity": "sha384-v0xgYodEvbgtfRPNinFTbTlRUvWfHSCU4LhxlYnulu6eKSAo4A95Uw/l5cLfo2ra"
      },
      {
        "chunk": "vendors-node_modules_prop-types_index_js.js",
        "integrity": "sha512-O4tsGm/weU4T1hL1szM0E2M/4k7dj0x/I9rmserP99LxYS1492/d5VRPg0tajOtWIPzMoCxvfkr37/mOUwZgBg=="
      }
    ],
    "module2": [
      {
        "chunk": "vendors-node_modules_core-js.js",
        "integrity": "sha384-v0xgYodEvbgtfRPNinFTbTlRUvWfHSCU4LhxlYnulu6eKSAo4A95Uw/l5cLfo2ra"
      }
    ],
    "module3": [
      {
        "chunk": "vendors-node_modules_babel.js",
        "integrity": "sha256-6ztd5MP6NcgnUXeP3xulOfEGhJg3qlFu7ztMGaGaj3Q="
      },
      {
        "chunk": "vendors-node_modules_core-js.js",
        "integrity": "sha384-v0xgYodEvbgtfRPNinFTbTlRUvWfHSCU4LhxlYnulu6eKSAo4A95Uw/l5cLfo2ra"
      }
    ]
  }
}
```
