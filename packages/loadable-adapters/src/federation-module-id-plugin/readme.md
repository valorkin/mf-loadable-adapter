# What this is about?

fixes names of remote containers for @loadable/component so it could find it in `__webpack_modules__`

## Usage

```javascript
const { FederationModuleIdPlugin } = require('@mf/loadable-adapters');
module.exports = {
  plugins: [new FederationModuleIdPlugin()],
};
```

## Docs

This plugin will change the module id of all the federation modules.

The new id will be in the following form: `webpack/container/remote/appName/moduleName`
