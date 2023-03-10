/* eslint-disable @typescript-eslint/ban-types */
import * as path from 'path';
import fetch from 'node-fetch';

import type { ChunkExtractor } from '@loadable/server';

export interface ModuleFederationRemotes {
  // name of module federation container
  name: string;
  // URI to federation-stats.json generated by FederationStatsPlugin
  federationStats: string;
  publicHost: string;
}

export interface Chunk {
  chunk: string;
  integrity?: string;
}

export interface Asset {
  url: string;
  type: ScriptType;
  integrity?: string;
}

export enum ScriptType {
  SCRIPT = 'script',
  STYLE = 'style',
}

export type PropMap<T = {}> = Record<string, T>;

export type PropMapOrFn<T = {}> = PropMap<T> | ((asset: Asset) => PropMap<T>);

export type ExtensionScriptTypes = '.js' | '.mjs' | '.css';

const EXTENSION_SCRIPT_TYPES_MAP: Record<ExtensionScriptTypes, ScriptType> = {
  '.js': ScriptType.SCRIPT,
  '.mjs': ScriptType.SCRIPT,
  '.css': ScriptType.STYLE,
};

function extensionToScriptType(extension: ExtensionScriptTypes): ScriptType | null {
  return EXTENSION_SCRIPT_TYPES_MAP[extension] || null;
}

/**
 * some files can be references with extra query arguments which have to be removed
 * @param name
 * @returns {*}
 */
function cleanFileName(name: string) {
  return name.split('?')[0];
}

function getFileScriptType(fileName: string): ScriptType | null {
  return extensionToScriptType(cleanFileName(path.extname(fileName)).toLowerCase() as ExtensionScriptTypes);
}

function isScriptFile(fileName: string): boolean {
  return getFileScriptType(fileName) === ScriptType.SCRIPT;
}

function joinTags(tags: string[]): string {
  return tags.join('\n');
}

function handleExtraProps<T = {}>(asset: Asset, extraProps: PropMapOrFn<T>): PropMap<T> {
  return typeof extraProps === 'function' ? extraProps(asset) : extraProps;
}

function extraPropsToString<T = {}>(asset: Asset, extraProps: PropMapOrFn<T>): string {
  return Object.entries(handleExtraProps(asset, extraProps)).reduce(
    (acc, [key, value]) => `${acc} ${key}="${value}"`,
    ''
  );
}

function getSriHtmlAttributes(asset: Asset): string {
  if (!asset.integrity) {
    return '';
  }
  return ` integrity="${asset.integrity}"`;
}

function assetToScriptTag<T = {}>(
  asset: Asset,
  extraProps: PropMapOrFn<T>,
  options: { loadMode?: 'async' | 'defer' } = { loadMode: 'defer' }
): string {
  return `<script ${options.loadMode} src="${asset.url}"${getSriHtmlAttributes(asset)}${extraPropsToString(
    asset,
    extraProps
  )}></script>`;
}

function assetToStyleTag<T = {}>(asset: Asset, extraProps: PropMapOrFn<T>): string {
  return `<link rel="stylesheet" href="${asset.url}"${getSriHtmlAttributes(asset)}${extraPropsToString(
    asset,
    extraProps
  )}>`;
}

export class FederatedChunkExtractor {
  private chunks: Chunk[];
  private assets: Asset[];

  private readonly mfPublicHost: Record<string, string>;
  private readonly mfStatsUrlMap: Record<string, string>;

  private readonly mfAppNamesRegex: RegExp;

  constructor(federationRemotes: ModuleFederationRemotes | ModuleFederationRemotes[]) {
    this.chunks = [];
    this.assets = [];

    const _federationRemotes = Array.isArray(federationRemotes) ? federationRemotes : [federationRemotes];

    const mfAppNames = _federationRemotes.map((remote) => remote.name);
    this.mfAppNamesRegex = RegExp(`(${mfAppNames.join('|')})-.*`);

    this.mfStatsUrlMap = _federationRemotes.reduce(
      (memo, remote) => Object.assign(memo, { [remote.name]: remote.federationStats }),
      {}
    );
    this.mfPublicHost = _federationRemotes.reduce(
      (memo, remote) => Object.assign(memo, { [remote.name]: remote.publicHost }),
      {} as Record<string, string>
    );
  }

  public isMfComponent(component: string) {
    return this.mfAppNamesRegex.test(component);
  }

  /**
   * @param {Object} extractor - loadable-components extractor
   * @return {string[]} chunk ids of the rendered components.
   */
  public getLoadableRequiredComponents(extractor: ChunkExtractor) {
    const loadableElement = extractor
      .getScriptElements()
      .find((el) => el.key === '__LOADABLE_REQUIRED_CHUNKS___ext');

    if (loadableElement) {
      const { namedChunks } = JSON.parse((loadableElement.props as any).dangerouslySetInnerHTML.__html);
      return namedChunks;
    }

    return {};
  }

  public getMfRenderedComponents(loadableRequiredComponents: string[]) {
    return loadableRequiredComponents.reduce((result, component) => {
      if (this.isMfComponent(component)) {
        result.push(component.split('-'));
      }
      return result;
    }, [] as string[][]);
  }

  public async getMFStats() {
    const promises = Object.values(this.mfStatsUrlMap).map((url) =>
      fetch(url as string)
        .then((response) => {
          // eslint-disable-next-line no-console
          console.log(`GET: ${url} - ${response.ok} ${response.status}`);
          return response.json();
        })
        // eslint-disable-next-line no-console
        .catch((err) => console.error(`MF: can't fetch ${url}`, err))
    );
    return Promise.all(promises.map((p) => p.catch(() => null))).then((responses) =>
      responses?.filter((data) => !!data)
    );
  }

  public async collectMfChunks(extractor: ChunkExtractor) {
    const loadableRequiredComponents = this.getLoadableRequiredComponents(extractor);
    const mfRenderedComponents = this.getMfRenderedComponents(loadableRequiredComponents);

    const mfChunks = await this.getMFStats();

    this.chunks = [];
    this.assets = [];

    mfRenderedComponents.forEach(([appName, component]) => {
      if (mfChunks.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(`${appName}: could not find a remote for ${component}`);
        return;
      }

      const remoteStats = mfChunks.find((remote) => remote.name === appName);
      remoteStats.exposes[component].forEach((chunk: Chunk) => {
        this.chunks.push(chunk);

        const assetUrl = `${this.mfPublicHost[appName]}/${chunk.chunk}`;

        const newAsset: Asset = {
          url: assetUrl,
          type: isScriptFile(assetUrl) ? ScriptType.SCRIPT : ScriptType.STYLE,
        };

        if (chunk.integrity) {
          newAsset.integrity = chunk.integrity;
        }

        this.assets.push(newAsset);
      });
    });
  }

  // Assets Functions

  public getAssets(scriptType?: ScriptType) {
    if (scriptType) {
      return this.assets.filter((asset: Asset) => asset.type === scriptType);
    }
    return this.assets;
  }

  public getScriptTags<T = {}>(
    extraProps: PropMapOrFn<T> = {},
    options: { loadMode?: 'async' | 'defer' } = { loadMode: 'defer' }
  ) {
    const mainAssets = this.getAssets(ScriptType.SCRIPT);
    const assetsScriptTags = mainAssets.map((asset) => assetToScriptTag(asset, extraProps, options));
    return joinTags(assetsScriptTags);
  }

  public getStyleTags(extraProps = {}) {
    const mainAssets = this.getAssets(ScriptType.STYLE);
    return joinTags(mainAssets.map((asset) => assetToStyleTag(asset, extraProps)));
  }
}
