import * as fs from 'fs';
import * as path from 'path';

const PLUGIN_NAME = 'FederationStatsPlugin';

const EXTENSION_REGEX = /\.[^/.]+$/;

export class FederationStatsPlugin {
  constructor(options = { fileName: 'federation-stats.json' }) {
    this._options = options;
  }

  apply(compiler) {
    const federationPlugin =
      compiler.options.plugins &&
      compiler.options.plugins.find((plugin) => plugin.constructor.name === 'ModuleFederationPlugin');

    if (!federationPlugin) throw new Error('No ModuleFederationPlugin found.');

    const appName = federationPlugin._options.name;

    // get exposed modules from the ModuleFederationPlugin
    const exposedFiles = new Map(
      Object.entries(federationPlugin._options.exposes || {}).map(([k, v]) =>
        typeof v === 'object' ? [v.import, k] : [v, k]
      )
    );

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        {
          name: PLUGIN_NAME,
          stage: compilation.constructor.PROCESS_ASSETS_STAGE_REPORT,
        },
        async () => {
          const stats = compilation.getStats().toJson({});
          // find mf modules
          const mfModules = stats.modules.filter(
            (module) =>
              module.issuerName === 'container entry' &&
              exposedFiles.has(module.name.replace(EXTENSION_REGEX, ''))
          );

          const chunksReducer = (chunksArr, current) => {
            current.siblings.forEach((s) => {
              const chunk = stats.chunks.find((c) => c.id === s);
              chunk.files.forEach((f) => chunksArr.push(f));
            });
            current.files.forEach((f) => chunksArr.push(f));
            return chunksArr;
          };

          const chunks = mfModules.map((module) => {
            const exposedAs = exposedFiles.get(module.name.replace(EXTENSION_REGEX, ''));
            const chunks = module.chunks
              .map((chunkId) => stats.chunks.find((chunk) => chunk.id === chunkId))
              .filter((chunk) => chunk.runtime.includes(appName))
              .reduce(chunksReducer, []);
            return {
              module: exposedAs,
              chunks: chunks,
              id: module.id,
            };
          });

          const exposes = chunks.reduce(
            (result, current) =>
              Object.assign(result, {
                [current.module.replace('./', '')]: current.chunks.map((chunk) => ({
                  chunk,
                  id: current.id,
                })),
              }),
            {}
          );
          const name =
            (federationPlugin._options.library && federationPlugin._options.library.name) ||
            federationPlugin._options.name;

          const statsResult = {
            name,
            exposes,
          };

          const fileName = this._options.fileName;
          const statsBuffer = Buffer.from(JSON.stringify(statsResult), 'utf-8');
          const mfStats = {
            source: () => statsBuffer,
            size: () => statsBuffer.length,
          };

          const asset = compilation.getAsset(fileName);
          if (asset) {
            compilation.updateAsset(fileName, mfStats);
          } else {
            compilation.emitAsset(fileName, mfStats);
          }
        }
      );

      const hasSriPlugin = Boolean(
        compiler.options.plugins &&
          compiler.options.plugins.find((plugin) => plugin.constructor.name === 'SubresourceIntegrityPlugin')
      );

      if (hasSriPlugin) {
        // needs to be optimized
        const assetIntegrityMap = new Map();

        compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
          assetIntegrityMap.clear();

          stats
            .toJson()
            .assets.filter((asset) => Boolean(asset.integrity))
            .forEach((asset) => {
              const integrity = Array.isArray(asset.integrity) ? asset.integrity[0] : asset.integrity;
              console.log(asset.name, integrity);
              assetIntegrityMap.set(asset.name, integrity.split(' ')[0]);
            });
        });

        compiler.hooks.afterDone.tap(PLUGIN_NAME, () => {
          const fileName = this._options.fileName;
          const statsFilePath = path.join(compiler.options.output.path, fileName);
          const rawMfStats = fs.readFileSync(statsFilePath, 'utf-8');
          const mfStats = JSON.parse(rawMfStats);

          Object.entries(mfStats.exposes).forEach(([key, value]) => {
            mfStats.exposes[key] = value.map((v) => {
              const integrity = assetIntegrityMap.get(v.chunk);
              return { ...v, integrity };
            });
          });

          fs.writeFileSync(statsFilePath, JSON.stringify(mfStats, null, 2));
        });
      }
    });
  }
}
