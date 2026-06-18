/** Public API of the Solvis server package. */

export { startServer } from './server.js';
export type { StartServerOptions, RunningServer } from './server.js';
export { exportStatic } from './export.js';
export type { ExportResult } from './export.js';
export { generateGraph } from './pipeline.js';
export type { GraphResult } from './pipeline.js';
export { discoverTemplates, stackIdFor, stackNameFor, isTemplatePath } from './discover.js';
export type { DiscoverResult } from './discover.js';
export {
  listProjects,
  getProject,
  addProject,
  removeProject,
  projectIdForPath,
  SOLVIS_DIR,
  CONFIG_PATH,
} from './store.js';
export type { Project } from './store.js';
export { findWebDist } from './webdist.js';
