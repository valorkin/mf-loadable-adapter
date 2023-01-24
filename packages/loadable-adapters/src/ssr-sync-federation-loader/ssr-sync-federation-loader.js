function loader(source) {
  const { plugins, target } = this._compiler.options;

  const moduleFederationPlugin = plugins.find((plugin) =>
    ['NodeFederationPlugin', 'ModuleFederationPlugin', 'UniversalFederationPlugin'].includes(
      plugin.constructor.name
    )
  );

  if (!moduleFederationPlugin) {
    return source;
  }

  const regex = new RegExp('require.resolveWeak\\(([\'"])(.+?)\\1\\)', 'g');
  const hasWeak = regex.test(source);

  if (!hasWeak || (target && target !== 'async-node')) {
    return source;
  }

  // reset regex after "test" to start from the beginning
  regex.lastIndex = 0;

  let result = '';
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(source)) !== null) {
    result += `require("${match[2]}")\n`;
  }

  result += source;

  return result;
}

export default loader;
