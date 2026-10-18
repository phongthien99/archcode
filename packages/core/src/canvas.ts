/**
 * Phần core dùng trực tiếp trên main thread của web app (canvas): thuần hàm, nhẹ,
 * không kéo theo ELK hay Ajv. Phần nặng chạy trong Worker qua entry chính.
 */
export {
  routeEdges,
  type Box,
  type Point,
  type RouteRequest,
  type RouteResult,
} from './layout/route';
export { computeGroupBoxes, GROUP_PADDING, type GroupBoxResult } from './layout/manual';
export {
  emptyLayout,
  parseLayout,
  serializeLayout,
  renameInLayout,
  pruneLayout,
  checkLayout,
  viewLayout,
  isLayoutEmpty,
  layoutFileName,
  type LayoutFile,
  type ViewLayout,
} from './layout/file';
export { edgePath, iconSvg, nodeBodySvg, nodeClass, nodeTooltip } from './render/svg';
export { elementAt, type ElementRange } from './parser/ranges';
export { isMindmapSource } from './mindmap/detect';
export {
  declaredCollapsed,
  MIND_COLORS,
  MIND_DIRECTIONS,
  MIND_LINK_FIELDS,
  MIND_NODE_FIELDS,
  MIND_ROOT_FIELDS,
  MIND_STYLES,
} from './mindmap/types';
export {
  layoutMindmap,
  type MindBox,
  type MindmapLayout,
  type MindmapLayoutOptions,
} from './mindmap/layout';
export {
  mindBranchClass,
  mindBranchPath,
  mindLinkGeometry,
  mindNodeBodySvg,
  mindNodeClass,
  mindNodeTooltip,
  severityByBox as mindSeverityByBox,
} from './mindmap/render';
export { COMPONENT_TYPES, RELATIONSHIP_TYPES, ID_PATTERN, isAsyncRelationship } from './constants';
