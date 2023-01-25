import loader from './ssr-sync-federation-loader';
export class SsrSyncFederationLoader {
  static loader = require.resolve('./ssr-sync-federation-loader');
  static _loader = loader;
}
